import { mkdir, writeFile } from 'node:fs/promises';
import https from 'node:https';
import { join } from 'node:path';
import net from 'node:net';
import tls from 'node:tls';

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.error('OPENAI_API_KEY is missing. Set it first, then run: node scripts/generate-ai-assets.mjs');
  process.exit(1);
}

const outDir = join(process.cwd(), 'src', 'assets');
const endpoint = new URL(process.env.OPENAI_IMAGE_ENDPOINT || 'https://api.openai.com/v1/images/generations');
const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';
const requestTimeoutMs = Number(process.env.OPENAI_IMAGE_TIMEOUT_MS) || 60000;

const assets = [
  {
    file: 'cute-board.png',
    background: 'opaque',
    prompt: [
      'Use case: stylized-concept',
      'Asset type: web game board texture for a Go/Weiqi placement app',
      'Primary request: a cute square wooden Go board surface in anime hand-drawn style, no stones, no text, no coordinate labels',
      'Style/medium: Japanese anime background art, soft hand-painted 2D illustration, cozy tabletop board-game feeling',
      'Composition/framing: perfectly top-down square board texture, centered, clean enough to sit under CSS grid lines',
      'Lighting/mood: warm afternoon light, cheerful, gentle, slightly whimsical',
      'Color palette: honey wood, peach cream, soft amber, subtle pink highlights',
      'Materials/textures: hand-drawn wood grain, tiny uneven brush details, soft watercolor-like shading',
      'Constraints: no visible grid lines, no letters, no numbers, no characters, no watermark, no logo',
    ].join('\n'),
  },
  {
    file: 'cute-black-stone.png',
    background: 'transparent',
    prompt: [
      'Use case: stylized-concept',
      'Asset type: transparent PNG game piece for a Go/Weiqi board',
      'Primary request: a single cute black Go stone in anime hand-drawn style, round and slightly imperfect like a real placed stone',
      'Style/medium: Japanese anime prop art, soft hand-painted 2D illustration, clean transparent cutout',
      'Composition/framing: centered object, generous padding, isolated on transparent background',
      'Lighting/mood: soft top-left highlight, warm and playful, subtle painted rim light',
      'Materials/textures: glossy ceramic stone with gentle brush shading, not photorealistic',
      'Constraints: no face, no text, no shadow outside the stone, no watermark, no logo',
    ].join('\n'),
  },
  {
    file: 'cute-white-stone.png',
    background: 'transparent',
    prompt: [
      'Use case: stylized-concept',
      'Asset type: transparent PNG game piece for a Go/Weiqi board',
      'Primary request: a single cute white Go stone in anime hand-drawn style, round and slightly imperfect like a real placed stone',
      'Style/medium: Japanese anime prop art, soft hand-painted 2D illustration, clean transparent cutout',
      'Composition/framing: centered object, generous padding, isolated on transparent background',
      'Lighting/mood: soft top-left highlight, warm and playful, subtle painted rim light',
      'Materials/textures: glossy ceramic stone with gentle brush shading, not photorealistic',
      'Constraints: no face, no text, no shadow outside the stone, no watermark, no logo',
    ].join('\n'),
  },
];

async function generateAsset(asset) {
  const result = await postJsonWithRetry({
    model: 'gpt-image-1.5',
    prompt: asset.prompt,
    size: '1024x1024',
    quality: 'low',
    output_format: 'png',
    background: asset.background,
  });

  const image = result.data?.[0]?.b64_json;
  if (!image) {
    throw new Error(`${asset.file}: response did not contain data[0].b64_json`);
  }

  await writeFile(join(outDir, asset.file), Buffer.from(image, 'base64'));
  console.log(`Generated ${asset.file}`);
}

async function postJsonWithRetry(body, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await postJson(body);
    } catch (error) {
      lastError = error;
      if (!error.retryable) break;
      if (attempt === attempts) break;
      const delayMs = 1200 * attempt;
      console.warn(`Request failed, retrying in ${delayMs}ms (${attempt}/${attempts}): ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

function postJson(body) {
  const payload = JSON.stringify(body);
  const agent = proxyUrl ? createHttpsProxyAgent(proxyUrl, endpoint.hostname, endpoint.port || 443) : undefined;

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        protocol: endpoint.protocol,
        hostname: endpoint.hostname,
        port: endpoint.port || 443,
        method: 'POST',
        path: `${endpoint.pathname}${endpoint.search}`,
        agent,
        timeout: requestTimeoutMs,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (response.statusCode < 200 || response.statusCode >= 300) {
            const error = new Error(`${response.statusCode} ${text}`);
            error.statusCode = response.statusCode;
            try {
              error.code = JSON.parse(text).error?.code;
            } catch {
              error.code = undefined;
            }
            error.retryable = response.statusCode >= 500 || response.statusCode === 429;
            reject(error);
            return;
          }
          try {
            resolve(JSON.parse(text));
          } catch {
            reject(new Error(`Invalid JSON response: ${text.slice(0, 300)}`));
          }
        });
      },
    );

    request.on('timeout', () => request.destroy(new Error(`Request timed out after ${requestTimeoutMs}ms`)));
    request.on('error', reject);
    request.write(payload);
    request.end();
  });
}

function createHttpsProxyAgent(rawProxyUrl, targetHost, targetPort) {
  const proxy = new URL(rawProxyUrl);
  const proxyPort = Number(proxy.port) || (proxy.protocol === 'https:' ? 443 : 80);
  const agent = new https.Agent({ keepAlive: false });

  agent.createConnection = (_options, callback) => {
    const proxySocket = net.connect(proxyPort, proxy.hostname);

    proxySocket.setTimeout(requestTimeoutMs);
    proxySocket.once('connect', () => {
      const auth = proxy.username
        ? `Proxy-Authorization: Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString('base64')}\r\n`
        : '';
      proxySocket.write(
        `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n` +
          `Host: ${targetHost}:${targetPort}\r\n` +
          auth +
          'Connection: close\r\n\r\n',
      );
    });

    let response = '';
    const onData = (chunk) => {
      response += chunk.toString('latin1');
      if (!response.includes('\r\n\r\n')) return;

      proxySocket.off('data', onData);
      const statusLine = response.split('\r\n')[0];
      if (!/^HTTP\/\d\.\d 200\b/.test(statusLine)) {
        callback(new Error(`Proxy CONNECT failed: ${statusLine}`));
        proxySocket.destroy();
        return;
      }

      const secureSocket = tls.connect({
        socket: proxySocket,
        servername: targetHost,
      });
      callback(null, secureSocket);
    };

    proxySocket.on('data', onData);
    proxySocket.once('timeout', () => {
      callback(new Error(`Proxy connection timed out after ${requestTimeoutMs}ms`));
      proxySocket.destroy();
    });
    proxySocket.once('error', callback);
  };

  return agent;
}

await mkdir(outDir, { recursive: true });

console.log(`Using endpoint: ${endpoint.origin}${endpoint.pathname}`);
console.log(proxyUrl ? `Using proxy: ${proxyUrl}` : 'No proxy configured. Set HTTPS_PROXY if your network needs one.');

try {
  for (const asset of assets) {
    await generateAsset(asset);
  }

  console.log('AI assets saved under src/assets/. Refresh index.html to use them.');
} catch (error) {
  if (error.code === 'billing_hard_limit_reached') {
    console.error('OpenAI billing hard limit has been reached. Increase or reset your API billing limit, then run this script again.');
  } else {
    console.error(error.message);
  }
  process.exit(1);
}
