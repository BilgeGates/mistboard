import WebSocket from 'ws';

const DEFAULT_BASE_URL = 'https://mistboard.com';
const DEFAULT_ENGINE_ID = 'python-tier1-v0.9.5';
const DEFAULT_TARGET_PLIES = 64;
const DEFAULT_REPLY_TIMEOUT_MS = 35_000;
const DEFAULT_TOTAL_TIMEOUT_MS = 10 * 60_000;

const options = parseArgs(process.argv.slice(2));
const baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
const engineId = options.engineId ?? DEFAULT_ENGINE_ID;
const targetPlies = options.targetPlies ?? DEFAULT_TARGET_PLIES;
const replyTimeoutMs = options.replyTimeoutMs ?? DEFAULT_REPLY_TIMEOUT_MS;
const totalTimeoutMs = options.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS;

let seatToken = null;
let roomId = null;

try {
  const result = await playOut({
    baseUrl,
    engineId,
    targetPlies,
    replyTimeoutMs,
    totalTimeoutMs,
  });
  console.log(JSON.stringify(result));
} finally {
  if (roomId && seatToken) {
    const abandoned = await abandonRoom(baseUrl, roomId, seatToken, 10_000);
    console.log(JSON.stringify({ abandoned, roomId }));
  }
}

async function playOut({ baseUrl, engineId, targetPlies, replyTimeoutMs, totalTimeoutMs }) {
  const created = await createRoom(baseUrl, engineId);
  roomId = created.roomId;

  const wsUrl = new URL(baseUrl);
  wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  wsUrl.searchParams.set('room', roomId);
  wsUrl.searchParams.set('client', `prod-engine-playout-${Date.now()}`);

  const socket = new WebSocket(wsUrl, {
    headers: { origin: baseUrl.origin },
  });

  let humanMoves = 0;
  let engineReplies = 0;
  let plies = 0;
  let waitingForEngine = false;
  let waitingForHumanAck = false;
  let pendingHumanMove = null;
  let lastAcceptedMoveKey = null;
  let settled = false;
  let lastEngineWaitStartedAt = 0;
  const moveTrace = [];

  return await new Promise((resolve, reject) => {
    const totalTimer = setTimeout(() => {
      fail(new Error(`timed out after ${totalTimeoutMs}ms`));
    }, totalTimeoutMs);

    let replyTimer = null;
    let humanAckTimer = null;

    function finish(value) {
      if (settled) return;
      settled = true;
      clearTimeout(totalTimer);
      if (replyTimer) clearTimeout(replyTimer);
      if (humanAckTimer) clearTimeout(humanAckTimer);
      socket.close();
      resolve(value);
    }

    function fail(err) {
      if (settled) return;
      settled = true;
      clearTimeout(totalTimer);
      if (replyTimer) clearTimeout(replyTimer);
      if (humanAckTimer) clearTimeout(humanAckTimer);
      socket.close();
      reject(err);
    }

    function armHumanAckTimer(move) {
      if (humanAckTimer) clearTimeout(humanAckTimer);
      humanAckTimer = setTimeout(() => {
        fail(
          new Error(
            `human move ack timeout at ply ${plies + 1} room ${roomId} move ${moveKey(move)}`,
          ),
        );
      }, 5_000);
    }

    function clearHumanAckTimer() {
      if (!humanAckTimer) return;
      clearTimeout(humanAckTimer);
      humanAckTimer = null;
    }

    function armReplyTimer() {
      if (replyTimer) clearTimeout(replyTimer);
      lastEngineWaitStartedAt = Date.now();
      replyTimer = setTimeout(() => {
        fail(
          new Error(
            `engine reply timeout after ${replyTimeoutMs}ms at ply ${plies} room ${roomId}`,
          ),
        );
      }, replyTimeoutMs);
    }

    function clearReplyTimer() {
      if (!replyTimer) return;
      clearTimeout(replyTimer);
      replyTimer = null;
    }

    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type === 'hello' && typeof message.seatToken === 'string') {
        seatToken = message.seatToken;
      }
      const state = message.state;
      if (!state) return;
      const stateMoveKey = state.lastMove ? moveKey(state.lastMove) : null;

      const status = state.status;
      if (status?.type !== 'playing') {
        finish({
          ok: true,
          terminal: status,
          engineId,
          roomId,
          plies,
          humanMoves,
          engineReplies,
          moveNumber: state.moveNumber,
          lastMove: state.lastMove ?? null,
          moveTrace,
        });
        return;
      }

      if (waitingForHumanAck) {
        if (!pendingHumanMove || stateMoveKey !== moveKey(pendingHumanMove)) return;
        waitingForHumanAck = false;
        waitingForEngine = true;
        clearHumanAckTimer();
        humanMoves += 1;
        plies += 1;
        lastAcceptedMoveKey = stateMoveKey;
        moveTrace.push({
          by: 'human',
          ply: plies,
          moveNumber: state.moveNumber,
          move: state.lastMove ?? pendingHumanMove,
        });
        pendingHumanMove = null;
        armReplyTimer();
        return;
      }

      if (
        waitingForEngine &&
        status.turn === 'white' &&
        stateMoveKey &&
        stateMoveKey !== lastAcceptedMoveKey
      ) {
        waitingForEngine = false;
        clearReplyTimer();
        engineReplies += 1;
        plies += 1;
        lastAcceptedMoveKey = stateMoveKey;
        moveTrace.push({
          by: 'engine',
          ply: plies,
          elapsedMs: Date.now() - lastEngineWaitStartedAt,
          moveNumber: state.moveNumber,
          move: state.lastMove ?? null,
        });
      }

      if (plies >= targetPlies) {
        finish({
          ok: true,
          engineId,
          roomId,
          plies,
          humanMoves,
          engineReplies,
          moveNumber: state.moveNumber,
          lastMove: state.lastMove ?? null,
          moveTrace,
        });
        return;
      }

      if (status.turn !== 'white' || waitingForEngine || waitingForHumanAck) return;

      const legalMoves = Array.isArray(state.legalMoves) ? state.legalMoves : [];
      if (legalMoves.length === 0) {
        fail(new Error(`no legal white moves at ply ${plies} room ${roomId}`));
        return;
      }

      const move = chooseMove(legalMoves, humanMoves);
      waitingForHumanAck = true;
      pendingHumanMove = move;
      socket.send(JSON.stringify({ type: 'move', ...move }));
      armHumanAckTimer(move);
    });

    socket.on('error', fail);
    socket.on('close', (code, reason) => {
      if (!settled) fail(new Error(`socket closed early: ${code} ${reason.toString()}`));
    });
  });
}

function chooseMove(legalMoves, humanMoves) {
  if (humanMoves === 0) {
    const e4 = legalMoves.find((move) => move.from === 'e2' && move.to === 'e4');
    if (e4) return e4;
  }
  const quiet = legalMoves.find((move) => !move.capturedRole && move.from[0] !== 'e');
  return quiet ?? legalMoves[0];
}

function moveKey(move) {
  return `${move.from}-${move.to}-${move.promotion ?? ''}`;
}

async function createRoom(baseUrl, engineId) {
  const response = await fetch(new URL('/api/rooms', baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'pve',
      variant: 'fog-of-war',
      engineId,
      preferredColor: 'white',
    }),
  });
  if (!response.ok) {
    throw new Error(`room creation failed: ${response.status} ${await response.text()}`);
  }
  const body = await response.json();
  if (typeof body.roomId !== 'string') throw new Error('room creation response missing roomId');
  return body;
}

async function abandonRoom(baseUrl, roomId, seatToken, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      new URL(`/api/rooms/${encodeURIComponent(roomId)}/abandon`, baseUrl),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seatToken }),
        signal: controller.signal,
      },
    );
    return { ok: response.status === 200, status: response.status };
  } catch (err) {
    return { ok: false, error: err.message ?? String(err) };
  } finally {
    clearTimeout(timer);
  }
}

function parseArgs(args) {
  const result = {
    baseUrl: null,
    engineId: null,
    replyTimeoutMs: null,
    targetPlies: null,
    totalTimeoutMs: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--base') result.baseUrl = requiredValue(args, ++index, arg);
    else if (arg === '--engine') result.engineId = requiredValue(args, ++index, arg);
    else if (arg === '--target-plies') {
      result.targetPlies = parsePositiveInteger(requiredValue(args, ++index, arg), arg);
    } else if (arg === '--reply-timeout-ms') {
      result.replyTimeoutMs = parsePositiveInteger(requiredValue(args, ++index, arg), arg);
    } else if (arg === '--total-timeout-ms') {
      result.totalTimeoutMs = parsePositiveInteger(requiredValue(args, ++index, arg), arg);
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
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${flag} must be positive`);
  return parsed;
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url;
}
