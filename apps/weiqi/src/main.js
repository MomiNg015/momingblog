const { createApp } = Vue;

const EMPTY = null;
const BLACK = 'black';
const WHITE = 'white';
const labels = 'ABCDEFGHJKLMNOPQRST'.split('');
const API_BASE = window.location.pathname.startsWith('/apps/weiqi') ? '/apps/weiqi/api' : '/api';

createApp({
  data() {
    return {
      clientId: localStorage.getItem('weiqi.clientId') || '',
      nickname: localStorage.getItem('weiqi.nickname') || '',
      nicknameDraft: '',
      state: { phase: 'needJoin', game: null },
      error: '',
      message: '正在连接本地对弈服务...',
      pollTimer: null,
      showMoveNumbers: false,
      chatDraft: '',
      localChat: [],
      timeDraft: { mainSeconds: 300, byoYomiSeconds: 20, periods: 3 },
      mainOptions: [
        { label: '1分钟', value: 60 },
        { label: '5分钟', value: 300 },
        { label: '10分钟', value: 600 },
        { label: '20分钟', value: 1200 },
        { label: '30分钟', value: 1800 },
        { label: '1小时', value: 3600 },
      ],
      byoYomiOptions: [10, 15, 20, 30, 40, 60],
      periodOptions: [1, 3, 5],
    };
  },
  computed: {
    game() {
      return this.state.game;
    },
    boardSize() {
      return this.game?.boardSize || 19;
    },
    board() {
      return this.game?.board || Array(this.boardSize * this.boardSize).fill(EMPTY);
    },
    moveMarks() {
      return this.game?.moveMarks || Array(this.boardSize * this.boardSize).fill(EMPTY);
    },
    stoneOffsets() {
      return this.game?.stoneOffsets || Array(this.boardSize * this.boardSize).fill(EMPTY);
    },
    intersections() {
      return this.board.map((stone, index) => {
        const row = Math.floor(index / this.boardSize);
        const col = index % this.boardSize;
        return {
          index,
          row,
          col,
          stone,
          moveNumber: this.moveMarks[index],
          offset: this.stoneOffsets[index],
          coord: `${labels[col]}${this.boardSize - row}`,
        };
      });
    },
    coordinateColumns() {
      return labels.slice(0, this.boardSize);
    },
    coordinateRows() {
      return Array.from({ length: this.boardSize }, (_, index) => this.boardSize - index);
    },
    boardStyle() {
      return { '--board-size': this.boardSize };
    },
    phaseText() {
      const map = {
        waiting: '等待匹配',
        negotiating: '协商时间',
        playing: '对局中',
        finished: '已结束',
      };
      return map[this.state.phase] || '未加入';
    },
    isMyTurn() {
      return this.game?.status === 'playing' && this.game.selfColor === this.game.currentColor;
    },
    currentTurnName() {
      return this.game?.currentColor === BLACK ? '黑棋' : '白棋';
    },
    selfInfo() {
      const color = this.game?.selfColor;
      const player = color ? this.game?.players?.[color] : null;
      return this.playerInfo(player?.nickname || this.nickname || '我方', color, true);
    },
    opponentInfo() {
      const opponent = (this.game?.players?.list || []).find((player) => player.clientId !== this.clientId);
      let color = null;
      if (opponent && this.game?.players?.black?.clientId === opponent.clientId) color = BLACK;
      if (opponent && this.game?.players?.white?.clientId === opponent.clientId) color = WHITE;
      return this.playerInfo(opponent?.nickname || '等待对手', color, false);
    },
    showNicknameModal() {
      return !this.nickname;
    },
    showTimeModal() {
      return this.game?.status === 'negotiating';
    },
    proposalText() {
      if (!this.game?.proposal) return '尚未提交时间方案';
      return `${this.formatMain(this.game.proposal.mainSeconds)} + ${this.game.proposal.byoYomiSeconds}s x ${this.game.proposal.periods}次`;
    },
    proposalByText() {
      if (!this.game?.proposal) return '';
      return this.game.proposedBy === this.clientId ? '你提交的方案' : `${this.opponentInfo.name} 提交的方案`;
    },
    hasAcceptedProposal() {
      return this.game?.agreed?.includes(this.clientId);
    },
  },
  watch: {
    game: {
      handler(game) {
        if (game?.proposal) this.timeDraft = { ...game.proposal };
      },
      deep: true,
    },
  },
  async mounted() {
    if (!this.clientId) {
      this.clientId = crypto.randomUUID();
      localStorage.setItem('weiqi.clientId', this.clientId);
    }
    this.nicknameDraft = this.nickname;
    if (this.nickname) await this.join();
    this.pollTimer = setInterval(() => this.refresh(), 800);
  },
  beforeUnmount() {
    clearInterval(this.pollTimer);
  },
  methods: {
    playerInfo(name, color, isSelf) {
      const clock = color ? this.game?.clocks?.[color] : null;
      return {
        name,
        color,
        colorName: color === BLACK ? '黑棋' : color === WHITE ? '白棋' : isSelf ? '待猜先' : '待定',
        clock: this.formatClock(clock),
        captures: color === BLACK ? this.game?.blackCaptures || 0 : color === WHITE ? this.game?.whiteCaptures || 0 : 0,
        isTurn: color && this.game?.currentColor === color,
      };
    },
    async api(path, body = null, method = body ? 'POST' : 'GET') {
      const options = { method, headers: { 'Content-Type': 'application/json' } };
      if (body) options.body = JSON.stringify(body);
      const response = await fetch(path.startsWith('/api') ? `${API_BASE}${path.slice(4)}` : path, options);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '请求失败');
      return data;
    },
    async join() {
      const nickname = this.nicknameDraft.trim() || this.nickname;
      if (!nickname) {
        this.error = '请输入昵称。';
        return;
      }
      localStorage.setItem('weiqi.nickname', nickname);
      this.nickname = nickname;
      await this.refresh(true);
    },
    async refresh(forceJoin = false) {
      try {
        this.error = '';
        if (!this.nickname) return;
        const path = forceJoin ? '/api/join' : `/api/state?clientId=${encodeURIComponent(this.clientId)}`;
        const body = forceJoin ? { clientId: this.clientId, nickname: this.nickname } : null;
        this.state = await this.api(path, body);
        this.message = this.statusMessage();
      } catch (error) {
        this.error = error.message;
      }
    },
    statusMessage() {
      if (!this.nickname) return '请输入昵称后加入。';
      if (this.state.phase === 'waiting') return '等待另一位玩家进入。';
      if (this.state.phase === 'negotiating') return `已匹配 ${this.opponentInfo.name}，请协商对局时间。`;
      if (this.state.phase === 'playing') return this.isMyTurn ? '轮到你落子。' : `等待 ${this.currentTurnName} 落子。`;
      if (this.state.phase === 'finished') return this.game?.endReason || '对局结束。';
      return '正在连接...';
    },
    async submitProposal() {
      await this.runAction(() => this.api('/api/proposal', { clientId: this.clientId, settings: this.timeDraft }));
    },
    async acceptProposal() {
      await this.runAction(() => this.api('/api/accept', { clientId: this.clientId }));
    },
    async playAt(index) {
      if (!this.isMyTurn) {
        this.message = this.game?.status === 'playing' ? '还没轮到你。' : '对局尚未开始。';
        return;
      }
      await this.runAction(() => this.api('/api/move', { clientId: this.clientId, index }));
    },
    async passTurn() {
      await this.runAction(() => this.api('/api/pass', { clientId: this.clientId }));
    },
    async resign() {
      if (!confirm('确定要认输吗？')) return;
      await this.runAction(() => this.api('/api/resign', { clientId: this.clientId }));
    },
    requestCounting() {
      this.message = '数目申请功能暂未实现，当前版本先支持对弈、计时、虚着和认输。';
    },
    sendLocalChat() {
      const text = this.chatDraft.trim();
      if (!text) return;
      this.localChat.unshift({ who: this.nickname, text });
      this.chatDraft = '';
    },
    async runAction(action) {
      try {
        this.error = '';
        this.state = await action();
        this.message = this.statusMessage();
      } catch (error) {
        this.error = error.message;
        this.message = error.message;
      }
    },
    stoneStyle(point) {
      const offset = point.offset || { x: 0, y: 0, rotate: 0 };
      return {
        '--stone-x': `${offset.x}%`,
        '--stone-y': `${offset.y}%`,
        '--stone-rotate': `${offset.rotate}deg`,
      };
    },
    formatMain(seconds) {
      const option = this.mainOptions.find((item) => item.value === seconds);
      return option?.label || `${seconds}s`;
    },
    formatClock(clock) {
      if (!clock) return '--:--';
      const main = Math.max(0, clock.main);
      if (main > 0) return this.formatSeconds(main);
      return `读秒 ${Math.max(0, clock.period)}s / ${Math.max(0, clock.periodsLeft)}次`;
    },
    formatSeconds(seconds) {
      const value = Math.max(0, Math.floor(seconds));
      const minutes = Math.floor(value / 60);
      const rest = value % 60;
      return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
    },
  },
  template: `
    <main class="app-shell">
      <section class="match-layout">
        <aside class="left-rail">
          <section class="info-card opponent-card" :class="{ active: opponentInfo.isTurn }">
            <div class="info-heading">
              <strong>对方</strong>
              <span v-if="opponentInfo.color" class="mini-stone" :class="opponentInfo.color"></span>
            </div>
            <p class="player-name">{{ opponentInfo.name }}</p>
            <p class="clock-text">{{ opponentInfo.clock }}</p>
            <p class="sub-clock">{{ opponentInfo.colorName }} · 提子 {{ opponentInfo.captures }}</p>
          </section>

          <section class="chat-box">
            <strong>聊天框</strong>
            <div class="chat-list">
              <p v-for="item in localChat" :key="item.text + item.who"><b>{{ item.who }}：</b>{{ item.text }}</p>
              <p v-if="!localChat.length" class="muted">本地预览聊天，联网同步后续再接。</p>
            </div>
            <form class="chat-form" @submit.prevent="sendLocalChat">
              <input v-model="chatDraft" placeholder="说点什么..." />
              <button>发送</button>
            </form>
          </section>
        </aside>

        <section class="center-board">
          <div class="board-frame">
            <div class="coordinate-board" :style="boardStyle">
              <div class="corner"></div>
              <div class="coord-line coord-columns">
                <span v-for="label in coordinateColumns" :key="'top-' + label">{{ label }}</span>
              </div>
              <div class="corner"></div>

              <div class="coord-line coord-rows">
                <span v-for="row in coordinateRows" :key="'left-' + row">{{ row }}</span>
              </div>
              <div class="board" role="grid" :aria-label="boardSize + '路围棋棋盘'">
                <button
                  v-for="point in intersections"
                  :key="point.index"
                  class="point"
                  :class="{
                    edgeTop: point.row === 0,
                    edgeRight: point.col === boardSize - 1,
                    edgeBottom: point.row === boardSize - 1,
                    edgeLeft: point.col === 0,
                    star: boardSize === 19 && [3, 9, 15].includes(point.row) && [3, 9, 15].includes(point.col),
                  }"
                  role="gridcell"
                  :aria-label="point.coord + (point.stone ? (point.stone === 'black' ? ' 黑棋' : ' 白棋') : ' 空点')"
                  :title="point.coord"
                  @click="playAt(point.index)"
                >
                  <span
                    v-if="point.stone"
                    class="stone"
                    :class="[point.stone, { latest: game?.latestMove === point.index, numbered: showMoveNumbers && point.moveNumber }]"
                    :style="stoneStyle(point)"
                  >
                    <span v-if="showMoveNumbers && point.moveNumber" class="move-number">{{ point.moveNumber }}</span>
                  </span>
                </button>
              </div>
              <div class="coord-line coord-rows">
                <span v-for="row in coordinateRows" :key="'right-' + row">{{ row }}</span>
              </div>

              <div class="corner"></div>
              <div class="coord-line coord-columns">
                <span v-for="label in coordinateColumns" :key="'bottom-' + label">{{ label }}</span>
              </div>
              <div class="corner"></div>
            </div>
          </div>

          <div class="board-actions">
            <button :disabled="!isMyTurn" @click="passTurn">弃一手</button>
            <button :disabled="game?.status !== 'playing'" @click="requestCounting">申请数目</button>
            <button :disabled="game?.status !== 'playing'" class="danger" @click="resign">认输</button>
          </div>
          <p class="message" :class="{ error: error }">{{ error || message }}</p>
        </section>

        <aside class="right-rail">
          <section class="info-card self-card" :class="{ active: selfInfo.isTurn }">
            <div class="info-heading">
              <strong>我方</strong>
              <span v-if="selfInfo.color" class="mini-stone" :class="selfInfo.color"></span>
            </div>
            <p class="player-name">{{ selfInfo.name }}</p>
            <p class="clock-text">{{ selfInfo.clock }}</p>
            <p class="sub-clock">{{ selfInfo.colorName }} · 提子 {{ selfInfo.captures }}</p>
          </section>
        </aside>
      </section>

      <label class="floating-switch">
        <span>手数</span>
        <input type="checkbox" v-model="showMoveNumbers" />
      </label>

      <div v-if="showNicknameModal" class="modal-backdrop">
        <form class="modal" @submit.prevent="join">
          <h2>输入昵称</h2>
          <p>每台电脑会保存一个昵称，用于本地对弈匹配。</p>
          <input v-model.trim="nicknameDraft" maxlength="16" placeholder="例如：小黑" autofocus />
          <button type="submit">进入对弈</button>
        </form>
      </div>

      <div v-if="showTimeModal" class="modal-backdrop">
        <section class="modal large">
          <h2>设置对局时间</h2>
          <p>已匹配 {{ opponentInfo.name }}。任意一方可提交或修改方案，另一方同意后自动猜先开局。</p>

          <div class="time-grid">
            <label>
              固定时间
              <select v-model.number="timeDraft.mainSeconds">
                <option v-for="item in mainOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
            </label>
            <label>
              读秒时间
              <select v-model.number="timeDraft.byoYomiSeconds">
                <option v-for="item in byoYomiOptions" :key="item" :value="item">{{ item }}s</option>
              </select>
            </label>
            <label>
              读秒次数
              <select v-model.number="timeDraft.periods">
                <option v-for="item in periodOptions" :key="item" :value="item">{{ item }}次</option>
              </select>
            </label>
          </div>

          <div class="proposal-box">
            <span>{{ proposalByText }}</span>
            <strong>{{ proposalText }}</strong>
          </div>

          <div class="modal-actions">
            <button @click="submitProposal">提交/修改申请</button>
            <button :disabled="!game?.proposal || hasAcceptedProposal" @click="acceptProposal">同意并等待开局</button>
          </div>
        </section>
      </div>
    </main>
  `,
}).mount('#app');
