import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { networkInterfaces } from 'node:os';

const root = resolve('.');
const port = Number(process.env.PORT) || 5173;
const host = process.env.HOST || '0.0.0.0';
const boardSize = 19;
const EMPTY = null;
const BLACK = 'black';
const WHITE = 'white';

const players = new Map();
const games = new Map();
let nextGameId = 1;

const contentTypes = {
  '.html': 'text/html;charset=utf-8',
  '.js': 'text/javascript;charset=utf-8',
  '.css': 'text/css;charset=utf-8',
  '.json': 'application/json;charset=utf-8',
  '.png': 'image/png',
};

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host || `${host}:${port}`}`);

  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(request, response, url);
      return;
    }

    await handleStatic(url, response);
  } catch (error) {
    json(response, 500, { error: error.message || 'Server error' });
  }
}).listen(port, host, () => {
  console.log(`围棋对弈本地服务: http://127.0.0.1:${port}`);
  for (const address of lanAddresses()) {
    console.log(`局域网访问地址: http://${address}:${port}`);
  }
});

async function handleStatic(url, response) {
  const pathname = decodeURIComponent(url.pathname);
  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = normalize(join(root, relativePath));

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  const body = await readFile(filePath);
  response.writeHead(200, {
    'content-type': contentTypes[extname(filePath)] || 'application/octet-stream',
  });
  response.end(body);
}

async function handleApi(request, response, url) {
  if (request.method === 'POST' && url.pathname === '/api/join') {
    const body = await readBody(request);
    const clientId = cleanId(body.clientId);
    const nickname = cleanNickname(body.nickname);
    if (!clientId || !nickname) return json(response, 400, { error: '缺少昵称或设备 ID。' });

    const player = players.get(clientId) || { clientId, nickname, gameId: null };
    player.nickname = nickname;
    player.lastSeen = Date.now();
    players.set(clientId, player);
    matchWaitingPlayers();
    return json(response, 200, publicState(clientId));
  }

  if (request.method === 'GET' && url.pathname === '/api/state') {
    const clientId = cleanId(url.searchParams.get('clientId'));
    touchPlayer(clientId);
    matchWaitingPlayers();
    return json(response, 200, publicState(clientId));
  }

  if (request.method === 'POST' && url.pathname === '/api/proposal') {
    const body = await readBody(request);
    const game = playerGame(body.clientId);
    if (!game || game.status !== 'negotiating') return json(response, 400, { error: '当前不能设置对局时间。' });

    game.proposal = normalizeTimeSettings(body.settings);
    game.proposedBy = body.clientId;
    game.agreed = new Set([body.clientId]);
    return json(response, 200, publicState(body.clientId));
  }

  if (request.method === 'POST' && url.pathname === '/api/accept') {
    const body = await readBody(request);
    const game = playerGame(body.clientId);
    if (!game || game.status !== 'negotiating' || !game.proposal) return json(response, 400, { error: '当前没有可同意的时间申请。' });

    game.agreed.add(body.clientId);
    if (game.agreed.size >= 2) startGame(game);
    return json(response, 200, publicState(body.clientId));
  }

  if (request.method === 'POST' && url.pathname === '/api/move') {
    const body = await readBody(request);
    const game = playerGame(body.clientId);
    if (!game || game.status !== 'playing') return json(response, 400, { error: '对局尚未开始。' });

    applyClock(game);
    if (game.status !== 'playing') return json(response, 200, publicState(body.clientId));
    const result = playMove(game, body.clientId, Number(body.index));
    if (!result.ok) return json(response, 400, { error: result.error });
    return json(response, 200, publicState(body.clientId));
  }

  if (request.method === 'POST' && url.pathname === '/api/pass') {
    const body = await readBody(request);
    const game = playerGame(body.clientId);
    if (!game || game.status !== 'playing') return json(response, 400, { error: '对局尚未开始。' });

    applyClock(game);
    if (game.status !== 'playing') return json(response, 200, publicState(body.clientId));
    const result = passMove(game, body.clientId);
    if (!result.ok) return json(response, 400, { error: result.error });
    return json(response, 200, publicState(body.clientId));
  }

  if (request.method === 'POST' && url.pathname === '/api/resign') {
    const body = await readBody(request);
    const game = playerGame(body.clientId);
    if (!game || game.status !== 'playing') return json(response, 400, { error: '对局尚未开始。' });

    const color = playerColor(game, body.clientId);
    game.status = 'finished';
    game.winner = opposite(color);
    game.endReason = `${playerName(body.clientId)} 认输。`;
    return json(response, 200, publicState(body.clientId));
  }

  json(response, 404, { error: 'Not found' });
}

function matchWaitingPlayers() {
  const waiting = [...players.values()].filter((player) => !player.gameId && Date.now() - player.lastSeen < 15000);
  while (waiting.length >= 2) {
    const a = waiting.shift();
    const b = waiting.shift();
    const game = createGame(a, b);
    games.set(game.id, game);
    a.gameId = game.id;
    b.gameId = game.id;
  }
}

function createGame(a, b) {
  const pointCount = boardSize * boardSize;
  return {
    id: `G${nextGameId++}`,
    status: 'negotiating',
    players: [a.clientId, b.clientId],
    proposal: null,
    proposedBy: null,
    agreed: new Set(),
    board: Array(pointCount).fill(EMPTY),
    moveMarks: Array(pointCount).fill(EMPTY),
    stoneOffsets: Array(pointCount).fill(EMPTY),
    latestMove: null,
    currentColor: BLACK,
    moveNumber: 0,
    blackCaptures: 0,
    whiteCaptures: 0,
    koPreviousKey: null,
    passes: 0,
    colors: null,
    clocks: null,
    lastTick: Date.now(),
    winner: null,
    endReason: '',
    log: ['匹配成功，等待双方确认对局时间。'],
  };
}

function startGame(game) {
  const shuffled = Math.random() < 0.5 ? game.players : [...game.players].reverse();
  game.colors = { black: shuffled[0], white: shuffled[1] };
  game.status = 'playing';
  game.currentColor = BLACK;
  game.moveNumber = 0;
  game.latestMove = null;
  game.lastTick = Date.now();
  game.clocks = {
    black: createClock(game.proposal),
    white: createClock(game.proposal),
    settings: game.proposal,
  };
  game.log.push(`猜先完成：${playerName(game.colors.black)} 执黑，${playerName(game.colors.white)} 执白。`);
}

function createClock(settings) {
  return {
    main: settings.mainSeconds,
    period: settings.byoYomiSeconds,
    periodsLeft: settings.periods,
  };
}

function applyClock(game) {
  if (game.status !== 'playing' || !game.clocks) return;
  const now = Date.now();
  let elapsed = Math.max(0, Math.floor((now - game.lastTick) / 1000));
  if (elapsed <= 0) return;
  game.lastTick += elapsed * 1000;

  const clock = game.clocks[game.currentColor];
  while (elapsed > 0 && game.status === 'playing') {
    if (clock.main > 0) {
      const spent = Math.min(clock.main, elapsed);
      clock.main -= spent;
      elapsed -= spent;
    } else {
      const spent = Math.min(clock.period, elapsed);
      clock.period -= spent;
      elapsed -= spent;
      if (clock.period <= 0 && elapsed >= 0) {
        clock.periodsLeft -= 1;
        if (clock.periodsLeft <= 0) {
          game.status = 'finished';
          game.winner = opposite(game.currentColor);
          game.endReason = `${game.currentColor === BLACK ? '黑棋' : '白棋'} 超时。`;
          break;
        }
        clock.period = game.clocks.settings.byoYomiSeconds;
      }
    }
  }
}

function playMove(game, clientId, index) {
  const color = playerColor(game, clientId);
  if (!color) return { ok: false, error: '你不在本局对局中。' };
  if (color !== game.currentColor) return { ok: false, error: '还没轮到你。' };
  if (!Number.isInteger(index) || index < 0 || index >= game.board.length) return { ok: false, error: '落点无效。' };
  if (game.board[index] !== EMPTY) return { ok: false, error: '这里已经有棋子。' };

  const nextBoard = [...game.board];
  const nextMoveMarks = [...game.moveMarks];
  const nextStoneOffsets = [...game.stoneOffsets];
  const beforeKey = boardKey(game.board);
  const captured = [];

  nextBoard[index] = color;
  nextMoveMarks[index] = game.moveNumber + 1;
  nextStoneOffsets[index] = randomStoneOffset();

  for (const neighbor of neighbors(index)) {
    if (nextBoard[neighbor] !== opposite(color)) continue;
    const group = getGroup(nextBoard, neighbor);
    if (group.liberties.size === 0) {
      for (const stoneIndex of group.stones) {
        nextBoard[stoneIndex] = EMPTY;
        nextMoveMarks[stoneIndex] = EMPTY;
        nextStoneOffsets[stoneIndex] = EMPTY;
        captured.push(stoneIndex);
      }
    }
  }

  const ownGroup = getGroup(nextBoard, index);
  if (ownGroup.liberties.size === 0) return { ok: false, error: '禁入点：不能自杀。' };
  if (boardKey(nextBoard) === game.koPreviousKey) return { ok: false, error: '劫争限制：不能立刻回到上一手前的局面。' };

  game.board = nextBoard;
  game.moveMarks = nextMoveMarks;
  game.stoneOffsets = nextStoneOffsets;
  game.latestMove = index;
  game.moveNumber += 1;
  if (color === BLACK) game.blackCaptures += captured.length;
  if (color === WHITE) game.whiteCaptures += captured.length;
  game.koPreviousKey = beforeKey;
  game.currentColor = opposite(color);
  game.passes = 0;
  game.lastTick = Date.now();
  resetPeriodIfNeeded(game.clocks[color], game.clocks.settings);
  game.log.push(`${color === BLACK ? '黑' : '白'}棋 ${coordOf(index)}${captured.length ? `，提 ${captured.length} 子` : ''}。`);
  return { ok: true };
}

function passMove(game, clientId) {
  const color = playerColor(game, clientId);
  if (!color) return { ok: false, error: '你不在本局对局中。' };
  if (color !== game.currentColor) return { ok: false, error: '还没轮到你。' };

  game.moveNumber += 1;
  game.latestMove = null;
  game.currentColor = opposite(color);
  game.passes += 1;
  game.lastTick = Date.now();
  resetPeriodIfNeeded(game.clocks[color], game.clocks.settings);
  game.log.push(`${color === BLACK ? '黑' : '白'}棋虚着。`);

  if (game.passes >= 2) {
    game.status = 'finished';
    game.endReason = '双方连续虚着，对局结束。';
  }
  return { ok: true };
}

function resetPeriodIfNeeded(clock, settings) {
  if (clock.main <= 0) clock.period = settings.byoYomiSeconds;
}

function publicState(clientId) {
  const player = players.get(clientId);
  if (!player) return { phase: 'needJoin' };
  const game = player.gameId ? games.get(player.gameId) : null;
  if (game) applyClock(game);

  return {
    phase: game ? game.status : 'waiting',
    self: { clientId: player.clientId, nickname: player.nickname },
    waitingCount: [...players.values()].filter((p) => !p.gameId && Date.now() - p.lastSeen < 15000).length,
    game: game ? publicGame(game, clientId) : null,
  };
}

function publicGame(game, clientId) {
  const color = playerColor(game, clientId);
  return {
    id: game.id,
    status: game.status,
    boardSize,
    board: game.board,
    moveMarks: game.moveMarks,
    stoneOffsets: game.stoneOffsets,
    latestMove: game.latestMove,
    currentColor: game.currentColor,
    moveNumber: game.moveNumber,
    blackCaptures: game.blackCaptures,
    whiteCaptures: game.whiteCaptures,
    proposal: game.proposal,
    proposedBy: game.proposedBy,
    agreed: [...game.agreed],
    players: {
      black: game.colors?.black ? publicPlayer(game.colors.black) : null,
      white: game.colors?.white ? publicPlayer(game.colors.white) : null,
      list: game.players.map(publicPlayer),
    },
    selfColor: color,
    clocks: game.clocks,
    winner: game.winner,
    endReason: game.endReason,
    log: game.log.slice(-8).reverse(),
  };
}

function publicPlayer(clientId) {
  const player = players.get(clientId);
  return player ? { clientId, nickname: player.nickname } : { clientId, nickname: '离线玩家' };
}

function playerGame(clientId) {
  const player = players.get(cleanId(clientId));
  return player?.gameId ? games.get(player.gameId) : null;
}

function playerColor(game, clientId) {
  if (!game.colors) return null;
  if (game.colors.black === clientId) return BLACK;
  if (game.colors.white === clientId) return WHITE;
  return null;
}

function playerName(clientId) {
  return players.get(clientId)?.nickname || '玩家';
}

function touchPlayer(clientId) {
  const player = players.get(clientId);
  if (player) player.lastSeen = Date.now();
}

function normalizeTimeSettings(settings = {}) {
  const mainOptions = [60, 300, 600, 1200, 1800, 3600];
  const byoYomiOptions = [10, 15, 20, 30, 40, 60];
  const periodOptions = [1, 3, 5];
  return {
    mainSeconds: pickOption(Number(settings.mainSeconds), mainOptions, 300),
    byoYomiSeconds: pickOption(Number(settings.byoYomiSeconds), byoYomiOptions, 20),
    periods: pickOption(Number(settings.periods), periodOptions, 3),
  };
}

function pickOption(value, options, fallback) {
  return options.includes(value) ? value : fallback;
}

function cleanNickname(value) {
  return String(value || '').trim().slice(0, 16);
}

function cleanId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function json(response, status, payload) {
  response.writeHead(status, {
    'content-type': 'application/json;charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

function neighbors(index) {
  const row = Math.floor(index / boardSize);
  const col = index % boardSize;
  const result = [];
  if (row > 0) result.push(index - boardSize);
  if (row < boardSize - 1) result.push(index + boardSize);
  if (col > 0) result.push(index - 1);
  if (col < boardSize - 1) result.push(index + 1);
  return result;
}

function getGroup(board, start) {
  const color = board[start];
  const stones = new Set([start]);
  const liberties = new Set();
  const stack = [start];

  while (stack.length) {
    const current = stack.pop();
    for (const neighbor of neighbors(current)) {
      if (board[neighbor] === EMPTY) {
        liberties.add(neighbor);
      } else if (board[neighbor] === color && !stones.has(neighbor)) {
        stones.add(neighbor);
        stack.push(neighbor);
      }
    }
  }

  return { stones, liberties };
}

function boardKey(board) {
  return board.map((stone) => (stone ? stone[0] : '.')).join('');
}

function opposite(color) {
  return color === BLACK ? WHITE : BLACK;
}

function coordOf(index) {
  const row = Math.floor(index / boardSize);
  const col = index % boardSize;
  const labels = 'ABCDEFGHJKLMNOPQRST'.split('');
  return `${labels[col]}${boardSize - row}`;
}

function randomStoneOffset() {
  const max = 5.5;
  return {
    x: Number(((Math.random() * 2 - 1) * max).toFixed(2)),
    y: Number(((Math.random() * 2 - 1) * max).toFixed(2)),
    rotate: Number(((Math.random() * 2 - 1) * 4).toFixed(2)),
  };
}

function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((item) => item && item.family === 'IPv4' && !item.internal)
    .map((item) => item.address);
}
