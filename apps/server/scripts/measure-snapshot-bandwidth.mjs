// Measure WebSocket ingress per client for a PvP fog-of-war room. Plays N
// plies of legal moves picked from each client's own snapshot, recording the
// raw JSON byte size of every WS frame received per client.
//
// Output: a CSV-ish table to stdout (move,white_bytes,black_bytes,
// white_cumulative,black_cumulative) followed by a summary. Useful for
// validating the O(n^2) bandwidth claim in
// docs/specs/incremental-snapshot-protocol.md before any wire-format change.
//
// Run from repo root:
//   MOVES=20 node apps/server/scripts/measure-snapshot-bandwidth.mjs
//   MOVES=60 node apps/server/scripts/measure-snapshot-bandwidth.mjs
//
// Requires `apps/server/dist/main.js` to exist
// (`npm --workspace apps/server run build`).

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const MOVES = Number(process.env.MOVES ?? 20);

const scriptDir = dirname(fileURLToPath(import.meta.url));
const serverEntry = join(scriptDir, '..', 'dist', 'main.js');

const port = await openPort();
const child = spawn(process.execPath, [serverEntry], {
  env: {
    ...process.env,
    MISTBOARD_ALLOW_IN_MEMORY_PERSISTENCE: 'true',
    NODE_ENV: 'test',
    PORT: String(port),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stderrTail = '';
child.stderr.on('data', (chunk) => {
  stderrTail = (stderrTail + chunk.toString('utf8')).slice(-2000);
});

try {
  await waitForReady(child);

  const room = `bw-${Date.now()}`;
  const white = await connect(port, `room=${room}&client=white-bw-0001&reset=1`);
  const black = await connect(port, `room=${room}&client=black-bw-0001`);

  const perMove = [];
  let lastWhiteBytes = white.cumulativeBytes;
  let lastBlackBytes = black.cumulativeBytes;

  for (let ply = 1; ply <= MOVES; ply += 1) {
    const mover = ply % 2 === 1 ? white : black;
    const observer = ply % 2 === 1 ? black : white;
    await waitForOwnTurn(mover);

    const snap = lastSnapshot(mover);
    const legal = snap?.state?.legalMoves ?? [];
    const move = pickMove(legal);
    if (!move) {
      // No legal move — game presumably ended early. Stop and report.
      process.stderr.write(`stopped at ply ${ply}: no legal move for ${mover.seat}\n`);
      break;
    }

    const baselineMover = mover.messages.length;
    const baselineObserver = observer.messages.length;
    mover.socket.send(JSON.stringify({ type: 'move', from: move.from, to: move.to }));
    await waitForSnapshotAfter(mover, baselineMover);
    await waitForSnapshotAfter(observer, baselineObserver);

    const whiteDelta = white.cumulativeBytes - lastWhiteBytes;
    const blackDelta = black.cumulativeBytes - lastBlackBytes;
    perMove.push({
      ply,
      mover: mover.seat,
      whiteBytes: whiteDelta,
      blackBytes: blackDelta,
      whiteCumulative: white.cumulativeBytes,
      blackCumulative: black.cumulativeBytes,
    });
    lastWhiteBytes = white.cumulativeBytes;
    lastBlackBytes = black.cumulativeBytes;

    const status = lastSnapshot(mover)?.state?.status;
    if (status?.type === 'finished') {
      process.stderr.write(`game ended at ply ${ply}: ${status.reason ?? 'unknown'}\n`);
      break;
    }
  }

  // Output: table + summary.
  process.stdout.write('# Snapshot bandwidth measurement\n');
  process.stdout.write(`# server: in-memory persistence, fog-of-war PvP, ${perMove.length} plies played\n`);
  process.stdout.write('# bytes are raw JSON length of WS frames received per client\n');
  process.stdout.write('#\n');
  process.stdout.write('ply,mover,white_frame_bytes,black_frame_bytes,white_cumulative,black_cumulative\n');
  for (const row of perMove) {
    process.stdout.write(`${row.ply},${row.mover},${row.whiteBytes},${row.blackBytes},${row.whiteCumulative},${row.blackCumulative}\n`);
  }
  process.stdout.write('\n# Summary\n');
  const totalWhite = white.cumulativeBytes;
  const totalBlack = black.cumulativeBytes;
  const totalCombined = totalWhite + totalBlack;
  const lastRow = perMove[perMove.length - 1];
  const avgFrameLastQuarter = (() => {
    if (perMove.length < 4) return null;
    const start = Math.floor(perMove.length * 0.75);
    const slice = perMove.slice(start);
    const sum = slice.reduce((acc, r) => acc + r.whiteBytes + r.blackBytes, 0);
    return Math.round(sum / slice.length);
  })();
  process.stdout.write(`# total white ingress: ${totalWhite} bytes\n`);
  process.stdout.write(`# total black ingress: ${totalBlack} bytes\n`);
  process.stdout.write(`# combined: ${totalCombined} bytes\n`);
  process.stdout.write(`# last-frame size (white+black) at ply ${lastRow?.ply}: ${lastRow ? lastRow.whiteBytes + lastRow.blackBytes : 'n/a'} bytes\n`);
  if (avgFrameLastQuarter !== null) {
    process.stdout.write(`# average frame size (white+black) over last quarter of game: ${avgFrameLastQuarter} bytes\n`);
  }

  white.socket.close();
  black.socket.close();
} finally {
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    child.once('exit', resolve);
    setTimeout(resolve, 2000);
  });
  if (process.exitCode && stderrTail) process.stderr.write(stderrTail);
}

function openPort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      if (!addr || typeof addr === 'string') {
        s.close(() => reject(new Error('failed to allocate port')));
        return;
      }
      s.close(() => resolve(addr.port));
    });
  });
}

function waitForReady(c) {
  return new Promise((resolve, reject) => {
    let out = '';
    const timeout = setTimeout(() => reject(new Error(`server startup timeout: ${out}`)), 5000);
    c.stdout.on('data', (chunk) => {
      out += chunk.toString('utf8');
      if (out.includes('mistboard server listening')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    c.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`server exited before ready: ${code}`));
    });
  });
}

function connect(port, query) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/?${query}`);
  const messages = [];
  const state = { socket, messages, cumulativeBytes: 0, seat: null };
  socket.on('message', (raw) => {
    const text = String(raw);
    state.cumulativeBytes += Buffer.byteLength(text, 'utf8');
    const m = JSON.parse(text);
    if (m.type === 'hello' || m.type === 'snapshot') {
      messages.push(m);
      if (!state.seat && m.seat) state.seat = m.seat;
    }
  });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`connect timeout for ${query}`)), 3000);
    socket.once('error', reject);
    socket.once('close', (code, reason) => {
      reject(new Error(`closed before hello: ${code} ${reason.toString('utf8')}`));
    });
    const wait = () => {
      if (messages[0]) {
        clearTimeout(timeout);
        resolve(state);
        return;
      }
      setTimeout(wait, 10);
    };
    wait();
  });
}

function lastSnapshot(client) {
  for (let i = client.messages.length - 1; i >= 0; i -= 1) {
    if (client.messages[i].type === 'snapshot') return client.messages[i];
  }
  return undefined;
}

async function waitForOwnTurn(client) {
  const started = Date.now();
  while (Date.now() - started < 3000) {
    const m = lastSnapshot(client);
    if (
      m
      && m.state.status.type === 'playing'
      && m.state.status.turn === m.seat
      && (m.state.legalMoves?.length ?? 0) > 0
    ) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for own turn (seat=${client.seat})`);
}

async function waitForSnapshotAfter(client, baselineCount) {
  const started = Date.now();
  while (Date.now() - started < 3000) {
    if (client.messages.length > baselineCount && lastSnapshot(client)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('timed out waiting for snapshot after move');
}

// Pick a legal move. Prefer non-promotion moves and skip ones that obviously
// end the game by capturing the opponent king on a square we can see — we
// want the game to run for the full requested length when possible.
function pickMove(legalMoves) {
  if (!legalMoves || legalMoves.length === 0) return null;
  // Stable pick: first move in the list. Deterministic per server-side
  // legalMoves ordering so the run is reproducible.
  return legalMoves[0];
}
