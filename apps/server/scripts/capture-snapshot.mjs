// Capture real WebSocket snapshot frames from a live PvP dark-chess room,
// for use as verbatim artifacts in the server-enforced-fog article.
//
// Spawns the built server with in-memory persistence, opens two seated WS
// clients, plays a handful of moves, then requests fresh snapshot frames
// from both seats. The capture runs the same server entrypoint shipped to
// production, so the wire format is real.
//
// Two output modes:
//   - Default (stdout): writes white's snapshot as pretty JSON.
//       node apps/server/scripts/capture-snapshot.mjs > /tmp/snapshot.json
//   - File mode (both seats): set CAPTURE_OUT_WHITE and CAPTURE_OUT_BLACK
//     to paths and the script writes both files.
//       CAPTURE_OUT_WHITE=apps/web/src/article-snapshot-fog.json \
//       CAPTURE_OUT_BLACK=apps/web/src/article-snapshot-fog-black.json \
//       node apps/server/scripts/capture-snapshot.mjs
//
// Post-Phase-3 (snapshot→delta migration) state-changes arrive as
// event-appended frames; the script requests explicit snapshots at the end
// via snapshot:request so the captured artifacts carry the full filtered
// event log for each recipient.
//
// Requires `apps/server/dist/main.js` to exist (run `npm --workspace
// apps/server run build` first).

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

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

  const room = `capture-${Date.now()}`;
  const white = await connect(port, `room=${room}&client=white-cap-0001&reset=1`);
  const black = await connect(port, `room=${room}&client=black-cap-0001`);

  // Play a small opening so the snapshot has non-trivial visible/hidden
  // structure: white's e-pawn pushes once, black mirrors, white develops
  // knight. After this sequence, mid-board fog still hides several of
  // black's back-rank pieces from white's perspective.
  // End on a black move so white's resulting snapshot is on white's own
  // turn — it'll carry a populated legalMoves list, which is more
  // illustrative for the article than an empty one.
  const sequence = [
    { who: white, from: 'e2', to: 'e4' },
    { who: black, from: 'e7', to: 'e5' },
    { who: white, from: 'g1', to: 'f3' },
    { who: black, from: 'b8', to: 'c6' },
    { who: white, from: 'f1', to: 'c4' },
    { who: black, from: 'g8', to: 'f6' },
  ];

  for (const step of sequence) {
    await waitForOwnTurn(step.who);
    const baseline = step.who.messages.length;
    step.who.socket.send(JSON.stringify({ type: 'move', from: step.from, to: step.to }));
    await waitForMessageAfter(step.who, baseline);
  }

  // Let any trailing broadcasts settle before requesting fresh snapshots.
  await new Promise((resolve) => setTimeout(resolve, 100));

  const whiteSnapshot = await captureFreshSnapshot(white);
  const blackSnapshot = await captureFreshSnapshot(black);

  const outWhitePath = process.env.CAPTURE_OUT_WHITE;
  const outBlackPath = process.env.CAPTURE_OUT_BLACK;

  if (outWhitePath && outBlackPath) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(outWhitePath, JSON.stringify(anonymize(whiteSnapshot), null, 2) + '\n');
    writeFileSync(outBlackPath, JSON.stringify(anonymize(blackSnapshot), null, 2) + '\n');
    process.stderr.write(`wrote ${outWhitePath}\nwrote ${outBlackPath}\n`);
  } else {
    process.stdout.write(JSON.stringify(anonymize(whiteSnapshot), null, 2));
    process.stdout.write('\n');
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
  socket.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    // Accept all framed types so post-Phase-3 event-appended frames can be
    // observed for sequencing. lastSnapshot/captureFreshSnapshot still
    // filter to snapshot frames when that's what's wanted.
    if (m.type === 'hello' || m.type === 'snapshot' || m.type === 'event-appended') {
      messages.push(m);
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
        resolve({ messages, socket });
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

function lastStateMessage(client) {
  for (let i = client.messages.length - 1; i >= 0; i -= 1) {
    if (client.messages[i].state) return client.messages[i];
  }
  return undefined;
}

async function waitForOwnTurn(client) {
  const started = Date.now();
  while (Date.now() - started < 3000) {
    const m = lastStateMessage(client);
    if (
      m &&
      m.state.status.type === 'playing' &&
      m.state.status.turn === m.seat &&
      (m.state.legalMoves?.length ?? 0) > 0
    )
      return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for own turn (seat=${client.messages[0]?.seat})`);
}

async function waitForMessageAfter(client, baselineCount) {
  const started = Date.now();
  while (Date.now() - started < 3000) {
    if (client.messages.length > baselineCount) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('timed out waiting for message after move');
}

async function captureFreshSnapshot(client) {
  const baseline = client.messages.length;
  client.socket.send(JSON.stringify({ type: 'snapshot:request' }));
  const started = Date.now();
  while (Date.now() - started < 3000) {
    for (let i = client.messages.length - 1; i >= baseline; i -= 1) {
      if (client.messages[i].type === 'snapshot') return client.messages[i];
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for snapshot reply (seat=${client.messages[0]?.seat})`);
}

// Replace machine-local identifiers and absolute timestamps with stable
// placeholders so the embedded artifact is reviewable + diffable in source.
// Shape of the snapshot is preserved exactly.
function anonymize(snapshot) {
  const replacements = new Map([
    [snapshot.roomId, 'mb-demo-room-001'],
    ['white-cap-0001', 'white-client-0001'],
    ['black-cap-0001', 'black-client-0001'],
  ]);
  const baseAt = 1700000000000; // fixed epoch for the capture
  let perMoveOffset = 0;
  return walk(snapshot);

  function walk(value) {
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(value)) {
        if (k === 'roomId' && typeof v === 'string') out[k] = replacements.get(v) ?? v;
        else if (k === 'id' && typeof v === 'string' && replacements.has(v))
          out[k] = replacements.get(v);
        else if (k === 'clientId' && typeof v === 'string') out[k] = replacements.get(v) ?? v;
        else if (k === 'at' && typeof v === 'number') {
          perMoveOffset += 1000;
          out[k] = baseAt + perMoveOffset;
        } else if (k === 'serverAt' && typeof v === 'number') out[k] = baseAt + 10_000;
        else if (k === 'runningSince' && typeof v === 'number') out[k] = baseAt + 10_000;
        else if (k === 'seats' && v && typeof v === 'object') {
          out[k] = Object.fromEntries(
            Object.entries(v).map(([seat, cid]) => [
              seat,
              typeof cid === 'string' ? (replacements.get(cid) ?? cid) : cid,
            ]),
          );
        } else out[k] = walk(v);
      }
      return out;
    }
    return value;
  }
}
