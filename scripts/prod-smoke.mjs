import WebSocket from 'ws';

const DEFAULT_BASE_URL = 'https://mistboard.com';
const DEFAULT_TIMEOUT_MS = 15_000;

const options = parseArgs(process.argv.slice(2));
const baseUrl = normalizeBaseUrl(
  options.baseUrl ?? process.env.MISTBOARD_BASE_URL ?? DEFAULT_BASE_URL,
);
const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

const health = await fetchJson(new URL('/health', baseUrl), { timeoutMs });
if (health.status !== 200 || health.body?.ok !== true) {
  throw new Error(`/health failed: ${health.status} ${JSON.stringify(health.body)}`);
}

const index = await fetchText(new URL('/', baseUrl), { timeoutMs });
if (index.status !== 200) throw new Error(`/ failed: ${index.status}`);
if (!index.body.includes('Mistboard'))
  throw new Error('homepage did not include Mistboard brand text');

const room = await createRoom(baseUrl, timeoutMs);
const white = await connectSeat(baseUrl, room.roomId, 'white', timeoutMs);
const black = await connectSeat(baseUrl, room.roomId, 'black', timeoutMs);

white.socket.close();
black.socket.close();

const abandoned = await abandonRoom(baseUrl, room.roomId, white.hello.seatToken, timeoutMs);
if (!abandoned.ok) {
  throw new Error(`abandon failed for ${room.roomId}: ${JSON.stringify(abandoned)}`);
}

console.log(
  JSON.stringify({
    ok: true,
    baseUrl: baseUrl.href,
    health: health.body,
    roomId: room.roomId,
    seats: [white.hello.seat, black.hello.seat],
    abandoned,
  }),
);

async function createRoom(baseUrl, timeoutMs) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetchJson(new URL('/api/rooms', baseUrl), {
      timeoutMs,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Pin preferredColor so the smoke's seat assertions are deterministic
        // regardless of the deployed server's preferredColor default. See
        // commit abfd18e for the underlying fix on master.
        body: JSON.stringify({ mode: 'pvp', variant: 'fog-of-war', preferredColor: 'white' }),
      },
    });
    if (response.status === 201) {
      if (typeof response.body?.roomId !== 'string')
        throw new Error('/api/rooms response missing roomId');
      if (attempt > 1) console.error(`/api/rooms succeeded on attempt ${attempt}`);
      return response.body;
    }
    lastError = new Error(`/api/rooms failed: ${response.status} ${JSON.stringify(response.body)}`);
    console.error(`/api/rooms attempt ${attempt} failed: ${response.status}`);
    if (attempt < 3) await new Promise((r) => setTimeout(r, 2_000));
  }
  throw lastError;
}

async function connectSeat(baseUrl, roomId, expectedSeat, timeoutMs) {
  const wsUrl = new URL(baseUrl);
  wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  wsUrl.searchParams.set('room', roomId);
  wsUrl.searchParams.set('client', `prod-smoke-${expectedSeat}-${Date.now()}`);

  const socket = new WebSocket(wsUrl, {
    headers: { origin: baseUrl.origin },
  });

  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`timed out waiting for ${expectedSeat} hello`));
    }, timeoutMs);

    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type !== 'hello') return;
      if (message.seat !== expectedSeat) {
        clearTimeout(timer);
        socket.close();
        reject(new Error(`expected ${expectedSeat} seat, got ${message.seat ?? 'missing'}`));
        return;
      }
      if (typeof message.seatToken !== 'string') {
        clearTimeout(timer);
        socket.close();
        reject(new Error(`${expectedSeat} hello missing seatToken`));
        return;
      }
      clearTimeout(timer);
      resolve({ socket, hello: message });
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    socket.on('close', (code, reason) => {
      clearTimeout(timer);
      reject(new Error(`socket closed before ${expectedSeat} hello: ${code} ${reason.toString()}`));
    });
  });
}

async function abandonRoom(baseUrl, roomId, seatToken, timeoutMs) {
  if (!seatToken) return { ok: false, reason: 'no_seat_token' };
  try {
    const response = await fetchJson(
      new URL(`/api/rooms/${encodeURIComponent(roomId)}/abandon`, baseUrl),
      {
        timeoutMs,
        init: {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ seatToken }),
        },
      },
    );
    return { ok: response.status === 200, status: response.status, body: response.body };
  } catch (err) {
    return { ok: false, error: err.message ?? String(err) };
  }
}

async function fetchJson(url, { timeoutMs, init = {} }) {
  const response = await fetchWithTimeout(url, timeoutMs, init);
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`${url.pathname} returned non-JSON response: ${text.slice(0, 120)}`);
    }
  }
  return { status: response.status, body };
}

async function fetchText(url, { timeoutMs, init = {} }) {
  const response = await fetchWithTimeout(url, timeoutMs, init);
  return { status: response.status, body: await response.text() };
}

async function fetchWithTimeout(url, timeoutMs, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function parseArgs(args) {
  const result = {
    baseUrl: null,
    timeoutMs: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--base') {
      result.baseUrl = requiredValue(args, ++index, '--base');
    } else if (arg === '--timeout-ms') {
      result.timeoutMs = parsePositiveInteger(
        requiredValue(args, ++index, '--timeout-ms'),
        '--timeout-ms',
      );
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return result;
}

function requiredValue(args, index, flag) {
  const value = args[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function parsePositiveInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`${flag} must be a positive integer`);
  return parsed;
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url;
}

function printHelp() {
  console.log(`Usage: npm run prod:smoke -- [options]

Options:
  --base <url>       Base URL to smoke, default ${DEFAULT_BASE_URL}
  --timeout-ms <ms>  Timeout per network step, default ${DEFAULT_TIMEOUT_MS}
`);
}
