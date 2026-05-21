import WebSocket from 'ws';

const DEFAULT_BASE_URL = 'https://mistboard.com';
const DEFAULT_TIMEOUT_MS = 20_000;

const options = parseArgs(process.argv.slice(2));
const baseUrl = normalizeBaseUrl(options.baseUrl ?? process.env.MISTBOARD_BASE_URL ?? DEFAULT_BASE_URL);
const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

const playable = await fetchPlayableEngines(baseUrl);
const requestedEngineIds = options.engineIds.length > 0
  ? options.engineIds
  : playable.map((engine) => engine.id);
const playableIds = new Set(playable.map((engine) => engine.id));
const unknown = requestedEngineIds.filter((engineId) => !playableIds.has(engineId));
if (unknown.length > 0) {
  throw new Error(`unknown playable engine(s): ${unknown.join(', ')}`);
}

for (const engineId of requestedEngineIds) {
  const result = await smokeEngine(baseUrl, engineId, timeoutMs);
  const abandoned = await abandonRoom(baseUrl, result.roomId, result.seatToken, timeoutMs);
  if (!abandoned.ok) {
    throw new Error(`abandon failed for ${engineId} room ${result.roomId}: ${JSON.stringify(abandoned)}`);
  }
  console.log(JSON.stringify({ ...result, abandoned }));
}

async function fetchPlayableEngines(baseUrl) {
  const response = await fetch(new URL('/api/engines/playable', baseUrl));
  if (!response.ok) throw new Error(`engine list failed: ${response.status} ${await response.text()}`);
  const body = await response.json();
  if (!Array.isArray(body.engines)) throw new Error('engine list response missing engines');
  return body.engines;
}

async function smokeEngine(baseUrl, engineId, timeoutMs) {
  const created = await createRoom(baseUrl, engineId);
  const startedAt = Date.now();
  const wsUrl = new URL(baseUrl);
  wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  wsUrl.searchParams.set('room', created.roomId);
  wsUrl.searchParams.set('client', `prod-engine-smoke-${engineId}-${Date.now()}`);

  const socket = new WebSocket(wsUrl, {
    headers: { origin: baseUrl.origin },
  });

  let sentMove = false;
  let settled = false;
  let capturedSeatToken = null;

  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      fail(new Error(`timed out waiting for ${engineId} engine reply`));
    }, timeoutMs);

    function finish(value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      resolve(value);
    }

    function fail(err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      reject(err);
    }

    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type === 'hello' && typeof message.seatToken === 'string') {
        capturedSeatToken = message.seatToken;
      }
      const state = message.state;
      if (!state) return;

      const legalMoves = Array.isArray(state.legalMoves) ? state.legalMoves : [];
      if (!sentMove && legalMoves.some((move) => move.from === 'e2' && move.to === 'e4')) {
        sentMove = true;
        socket.send(JSON.stringify({ type: 'move', from: 'e2', to: 'e4' }));
        return;
      }

      if (
        sentMove
        && state.status?.type === 'playing'
        && state.status.turn === 'white'
        && state.moveNumber >= 2
      ) {
        finish({
          ok: true,
          engineId,
          roomId: created.roomId,
          seatToken: capturedSeatToken,
          elapsedMs: Date.now() - startedAt,
          moveNumber: state.moveNumber,
        });
      }
    });

    socket.on('error', fail);
    socket.on('close', (code, reason) => {
      if (!settled) fail(new Error(`socket closed before ${engineId} replied: ${code} ${reason.toString()}`));
    });
  });
}

async function createRoom(baseUrl, engineId) {
  const response = await fetch(new URL('/api/rooms', baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'pve',
      variant: 'fog-of-war',
      engineId,
    }),
  });
  if (!response.ok) throw new Error(`room creation failed for ${engineId}: ${response.status} ${await response.text()}`);
  const body = await response.json();
  if (typeof body.roomId !== 'string') throw new Error(`room creation response missing roomId for ${engineId}`);
  return body;
}

async function abandonRoom(baseUrl, roomId, seatToken, timeoutMs) {
  if (!seatToken) return { ok: false, reason: 'no_seat_token' };
  const url = new URL(`/api/rooms/${encodeURIComponent(roomId)}/abandon`, baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ seatToken }),
      signal: controller.signal,
    });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { /* ignore */ }
    return { ok: response.status === 200, status: response.status, body };
  } catch (err) {
    return { ok: false, error: err.message ?? String(err) };
  } finally {
    clearTimeout(timer);
  }
}

function parseArgs(args) {
  const result = {
    baseUrl: null,
    engineIds: [],
    timeoutMs: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--base') {
      result.baseUrl = requiredValue(args, ++index, '--base');
    } else if (arg === '--engine') {
      result.engineIds.push(requiredValue(args, ++index, '--engine'));
    } else if (arg === '--timeout-ms') {
      result.timeoutMs = parsePositiveInteger(requiredValue(args, ++index, '--timeout-ms'), '--timeout-ms');
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
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${flag} must be a positive integer`);
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
  console.log(`Usage: npm run prod:smoke:engines -- [options]

Options:
  --base <url>          Base URL to smoke, default ${DEFAULT_BASE_URL}
  --engine <engineId>   Engine to smoke. Repeatable. Defaults to all playable engines.
  --timeout-ms <ms>     Per-engine timeout, default ${DEFAULT_TIMEOUT_MS}
`);
}
