import assert from 'node:assert/strict';
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import test, { type TestContext } from 'node:test';
import WebSocket from 'ws';
import type { Color, GameEvent, Move, PlayerView } from '@bichess/game';

type SnapshotMessage = {
  type: 'hello' | 'snapshot';
  events: GameEvent[];
  mode?: 'pvp' | 'pve' | 'eve' | 'imported' | 'manual';
  seat: Color | 'spectator';
  state: PlayerView;
};

type TestClient = {
  messages: SnapshotMessage[];
  socket: WebSocket;
};
type ServerProcess = ChildProcessByStdio<null, Readable, Readable>;

test('live PvP third client is rejected before any snapshot', async (t) => {
  const { port } = await startServer(t);
  const clients: TestClient[] = [];
  t.after(async () => closeClients(clients));

  const room = `ws-pvp-${Date.now()}`;
  clients.push(await connectForHello(port, `room=${room}&client=white-client-0001&reset=1`));
  clients.push(await connectForHello(port, `room=${room}&client=black-client-0001`));

  const rejected = await connectForClose(port, `room=${room}&client=third-client-0001`);

  assert.equal(rejected.code, 1008);
  assert.equal(rejected.reason, 'private room');
  assert.deepEqual(rejected.messages, []);
});

test('live PvE observer receives the human perspective and not engine moves', async (t) => {
  const { port } = await startServer(t);
  const clients: TestClient[] = [];
  t.after(async () => closeClients(clients));

  const room = `ws-pve-${Date.now()}`;
  const human = await connectForHello(port, `room=${room}&client=pve-human-0001&engine=random&reset=1`);
  clients.push(human);
  assert.equal(human.messages[0]?.mode, 'pve');
  assert.equal(human.messages[0]?.seat, 'white');

  const move = firstLegalMove(human.messages[0]);
  human.socket.send(JSON.stringify({ type: 'move', ...move }));
  await waitForMessage(
    human.messages,
    (message) => message.state.status.type === 'playing'
      && message.state.status.turn === 'white'
      && message.state.moveNumber > 1,
    'PvE engine reply',
  );

  const observer = await connectForHello(port, `room=${room}&client=pve-observer-01`);
  clients.push(observer);
  const snapshot = observer.messages[0];
  assert.ok(snapshot);

  const moveColors = moveEventColors(snapshot.events);
  assert.equal(snapshot.mode, 'pve');
  assert.equal(snapshot.seat, 'spectator');
  assert.equal(snapshot.state.perspective, 'white');
  assert.notDeepEqual(snapshot.state.board, {});
  assert.deepEqual(snapshot.state.legalMoves, []);
  assert.equal(moveColors.includes('white'), true);
  assert.equal(moveColors.includes('black'), false);
  assert.equal(snapshot.state.visibleSquares.length < 64, true);
});

test('live EvE observer receives full truth and full event stream by design', async (t) => {
  const { port } = await startServer(t);
  const clients: TestClient[] = [];
  t.after(async () => closeClients(clients));

  const room = `ws-eve-${Date.now()}`;
  const white = await connectForHello(port, `room=${room}&client=engine:white&reset=1`);
  const black = await connectForHello(port, `room=${room}&client=engine:black`);
  clients.push(white, black);

  const whiteReady = await waitForMessage(
    white.messages,
    (message) => message.mode === 'eve'
      && message.state.status.type === 'playing'
      && message.state.status.turn === 'white'
      && message.state.legalMoves.length > 0,
    'EvE white to move',
  );
  white.socket.send(JSON.stringify({ type: 'move', ...firstLegalMove(whiteReady) }));

  const blackReady = await waitForMessage(
    black.messages,
    (message) => message.mode === 'eve'
      && message.state.status.type === 'playing'
      && message.state.status.turn === 'black'
      && message.state.legalMoves.length > 0,
    'EvE black to move',
  );
  black.socket.send(JSON.stringify({ type: 'move', ...firstLegalMove(blackReady) }));

  await waitForMessage(
    white.messages,
    (message) => message.mode === 'eve'
      && message.state.status.type === 'playing'
      && message.state.status.turn === 'white'
      && message.state.moveNumber > 1,
    'EvE move pair',
  );

  const observer = await connectForHello(port, `room=${room}&client=eve-observer-01`);
  clients.push(observer);
  const snapshot = observer.messages[0];
  assert.ok(snapshot);

  assert.equal(snapshot.mode, 'eve');
  assert.equal(snapshot.seat, 'spectator');
  assert.equal(snapshot.state.visibleSquares.length, 64);
  assert.equal(snapshot.state.legalMoves.length, 0);
  assert.deepEqual(moveEventColors(snapshot.events), ['white', 'black']);
});

async function startServer(t: TestContext): Promise<{ port: number }> {
  const port = await openPort();
  const entry = join(dirname(fileURLToPath(import.meta.url)), 'index.js');
  const child = spawn(process.execPath, [entry], {
    env: {
      BICHESS_ALLOW_IN_MEMORY_PERSISTENCE: 'true',
      NODE_ENV: 'test',
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => stopServer(child));

  await waitForServerReady(child);
  return { port };
}

function openPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('failed to allocate test port')));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

function waitForServerReady(child: ServerProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`server startup timed out: ${output}`)), 5_000);
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
      if (output.includes('bichess server listening')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`server exited before ready with code ${code}: ${output}`));
    });
  });
}

function stopServer(child: ServerProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 2_000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

function connectForHello(port: number, query: string): Promise<TestClient> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/?${query}`);
  const messages: SnapshotMessage[] = [];
  socket.on('message', (raw) => {
    const message = JSON.parse(String(raw)) as SnapshotMessage;
    if (message.type === 'hello' || message.type === 'snapshot') messages.push(message);
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`hello timed out for ${query}`)), 3_000);
    socket.once('error', reject);
    socket.once('close', (code, reason) => {
      reject(new Error(`socket closed before hello for ${query}: ${code} ${reason.toString('utf8')}`));
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

function connectForClose(port: number, query: string): Promise<{ code: number; messages: SnapshotMessage[]; reason: string }> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/?${query}`);
  const messages: SnapshotMessage[] = [];
  socket.on('message', (raw) => {
    const message = JSON.parse(String(raw)) as SnapshotMessage;
    if (message.type === 'hello' || message.type === 'snapshot') messages.push(message);
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`close timed out for ${query}`)), 3_000);
    socket.once('error', reject);
    socket.once('close', (code, reason) => {
      clearTimeout(timeout);
      resolve({ code, messages, reason: reason.toString('utf8') });
    });
  });
}

async function waitForMessage(
  messages: SnapshotMessage[],
  predicate: (message: SnapshotMessage) => boolean,
  label: string,
): Promise<SnapshotMessage> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 3_000) {
    const found = [...messages].reverse().find(predicate);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for ${label}`);
}

function firstLegalMove(message: SnapshotMessage | undefined): Move {
  const move = message?.state.legalMoves[0];
  assert.ok(move, 'expected at least one legal move');
  return move;
}

function moveEventColors(events: GameEvent[]): Color[] {
  return events.flatMap((event) => event.type === 'move-played' ? [event.color] : []);
}

async function closeClients(clients: TestClient[]): Promise<void> {
  await Promise.all(clients.map((client) => new Promise<void>((resolve) => {
    if (client.socket.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    client.socket.once('close', () => resolve());
    client.socket.close();
    setTimeout(resolve, 250);
  })));
}
