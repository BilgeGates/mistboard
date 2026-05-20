// Concurrent-PvE smoke test for CI.
//
// What it catches: regressions where engine moves silently fall back, where
// the PvE flow stops completing, or where the server tail-latency under a
// handful of concurrent games becomes unacceptable. It's deliberately small
// (3 concurrent games, builtin engine, no Postgres) so it stays fast and
// hermetic — the goal is a "is the PvE pipe healthy at all" canary, not a
// real load test. The bigger sweeps live in loadtest/run-baselines.sh and
// must be run by hand against a tuned server.
//
// Concretely, this test would have failed loudly the day the Tier1
// mcts_rollouts regression landed, because every move's `fallback` field
// would have flipped to true. With builtin-random-legal, no engine path
// should ever fall back.

import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { connectClient, startTestServer, type TestClient, type TestServer } from './harness.js';
import { engineCounters } from '../src/obs.js';

const CONCURRENCY = 3;
// Random-legal vs random-legal in fog-of-war can drag well past 200 plies
// before king-capture. We cap each game at a budget that's enough to verify
// the engine path is producing legal moves under concurrency, regardless of
// whether the game itself terminates "naturally" in that window. The
// fallback-rate assertion below is the actual canary, not the FIN status.
const MAX_MOVES = 40;
const MAX_GAME_MS = 20_000;
const MOVE_TIMEOUT_MS = 5_000;
const MIN_MOVES_PER_GAME = 10;

let serverInstance: TestServer;
let httpBase: string;
let baselineMoves = 0;
let baselineFallbacks = 0;

before(async () => {
  serverInstance = await startTestServer();
  httpBase = `http://127.0.0.1:${serverInstance.port}`;
  // Capture counter baseline so we measure only what this test produces.
  baselineMoves = engineCounters.totalMoves;
  baselineFallbacks = engineCounters.totalFallbacks;
});

after(async () => {
  await serverInstance.close();
});

interface GameResult {
  gameIdx: number;
  moves: number;
  finished: boolean;
  note?: string;
  maxMoveLatencyMs: number;
}

type SnapshotMessage = {
  type: 'snapshot';
  state?: {
    status?: { type: 'pregame' | 'playing' | 'finished'; turn?: 'white' | 'black'; reason?: string };
    moveNumber?: number;
    legalMoves?: { from: string; to: string; promotion?: string }[];
  };
};

async function createPveRoom(): Promise<string> {
  const res = await fetch(`${httpBase}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'pve',
      variant: 'fog-of-war',
      // 3+2 is currently the only allowed PvE time control (see
      // isPveAllowedTimeControl in http-api.ts). Keep this synced.
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
    }),
  });
  assert.equal(res.status, 201, `POST /api/rooms returned ${res.status}`);
  const body = (await res.json()) as { roomId?: string };
  assert.ok(typeof body.roomId === 'string', 'roomId missing from POST /api/rooms response');
  return body.roomId!;
}

async function playOne(gameIdx: number): Promise<GameResult> {
  const roomId = await createPveRoom();
  const client = await connectClient({ url: serverInstance.url, room: roomId, variant: 'fog-of-war' });
  try {
    return await play(client, gameIdx);
  } finally {
    await client.disconnect().catch(() => undefined);
  }
}

async function play(client: TestClient, gameIdx: number): Promise<GameResult> {
  const started = Date.now();
  let actedOnMove = -1;
  let moves = 0;
  let lastSentAt: number | null = null;
  let maxLat = 0;

  while (true) {
    if (Date.now() - started > MAX_GAME_MS) return { gameIdx, moves, finished: false, note: 'max-game-ms', maxMoveLatencyMs: maxLat };
    if (moves >= MAX_MOVES) return { gameIdx, moves, finished: false, note: 'max-moves', maxMoveLatencyMs: maxLat };

    let snap: SnapshotMessage;
    try {
      snap = await client.waitFor<SnapshotMessage>((m) => isActionable(m as SnapshotMessage, actedOnMove), { timeoutMs: MOVE_TIMEOUT_MS });
    } catch (err) {
      return { gameIdx, moves, finished: false, note: `wait-timeout:${(err as Error).message}`, maxMoveLatencyMs: maxLat };
    }
    if (lastSentAt !== null) {
      const latency = Date.now() - lastSentAt;
      if (latency > maxLat) maxLat = latency;
      lastSentAt = null;
    }
    const status = snap.state?.status;
    if (status?.type === 'finished') return { gameIdx, moves, finished: true, maxMoveLatencyMs: maxLat };
    if (status?.type !== 'playing' || status.turn !== 'white') continue;
    const legal = snap.state?.legalMoves ?? [];
    if (legal.length === 0) return { gameIdx, moves, finished: false, note: 'no-legal-moves', maxMoveLatencyMs: maxLat };

    const choice = legal[(gameIdx + moves) % legal.length]!;
    lastSentAt = Date.now();
    client.send({ type: 'move', from: choice.from, to: choice.to, ...(choice.promotion ? { promotion: choice.promotion } : {}) });
    actedOnMove = snap.state?.moveNumber ?? actedOnMove;
    moves += 1;
  }
}

function isActionable(msg: SnapshotMessage, actedOnMove: number): boolean {
  if (msg.type !== 'snapshot') return false;
  const status = msg.state?.status;
  if (!status) return false;
  if (status.type === 'finished') return true;
  if (status.type !== 'playing') return false;
  if (status.turn !== 'white') return false;
  const mn = msg.state?.moveNumber ?? -1;
  return mn > actedOnMove;
}

test('POST /api/rooms rejects PvE rooms with non-3+2 time controls', async () => {
  // The UI scopes PvE to 3+2; this is the server-side defense-in-depth so a
  // hand-crafted POST can't bypass the lock and melt the engine.
  // PvP is unconstrained on the server (humans set their own pace) — verified
  // by the smoke test below, which uses PvE 3+2 successfully.
  const bullet = await fetch(`${httpBase}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'pve',
      variant: 'fog-of-war',
      timeControl: { initialMs: 60_000, incrementMs: 1_000 },
    }),
  });
  assert.equal(bullet.status, 400, 'PvE 1+1 should be rejected');
  const body = (await bullet.json()) as { error?: string };
  assert.equal(body.error, 'time_control_unsupported_for_pve');

  // Sanity: PvP at the same 1+1 time control IS allowed (no PvE restriction).
  const pvp = await fetch(`${httpBase}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'pvp',
      variant: 'fog-of-war',
      timeControl: { initialMs: 60_000, incrementMs: 1_000 },
    }),
  });
  assert.equal(pvp.status, 201, 'PvP 1+1 should be accepted');
});

test(`loadtest smoke: ${CONCURRENCY} concurrent PvE games produce engine moves with no fallbacks`, async () => {
  const results = await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => playOne(i)));

  // The fallback-rate check is the canary. If this fires, an engine path
  // regressed silently (Tier1 mcts_rollouts in 2026-05 is the original
  // motivating example).
  const movesPlayed = engineCounters.totalMoves - baselineMoves;
  const fallbacks = engineCounters.totalFallbacks - baselineFallbacks;
  assert.ok(movesPlayed > 0, 'expected some engine moves to have been recorded');
  assert.equal(fallbacks, 0, `unexpected engine fallbacks: ${fallbacks} out of ${movesPlayed} engine moves`);

  // Every game should drive moves through the WS + engine path. Catching
  // stalls requires distinguishing "ended quickly because someone walked
  // their king" (legit, fog-of-war random-vs-random does this) from "stuck
  // because the engine path stopped responding" (the actual regression we
  // want to catch).
  for (const r of results) {
    if (r.note?.startsWith('wait-timeout')) {
      assert.fail(`game ${r.gameIdx} hit a server-side wait timeout: ${r.note}`);
    }
    // Only enforce the floor on games that did NOT finish naturally. A 6-move
    // king-capture is healthy; a 6-move stall mid-game is not.
    if (!r.finished) {
      assert.ok(
        r.moves >= MIN_MOVES_PER_GAME,
        `game ${r.gameIdx} only made ${r.moves} moves (note=${r.note ?? ''}); WS or engine path may be stuck`,
      );
    }
  }

  // Soft latency check — builtin engine is in-process, no subprocess; if this
  // explodes there's a real regression. Loose threshold to avoid CI flakes on
  // a slow runner.
  const slowest = Math.max(...results.map((r) => r.maxMoveLatencyMs));
  assert.ok(slowest < 5_000, `worst engine round-trip ${slowest}ms exceeds 5s threshold`);
});
