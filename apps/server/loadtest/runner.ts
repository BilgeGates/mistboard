// Concurrent game runner for the load harness.
//
// Drives one or more games per scenario, captures per-move latency, returns a
// flat result the CLI can aggregate. Talks to a server over HTTP (room
// creation) + WebSocket (gameplay) — designed to point at either a local dev
// server or a deployed Railway service.

import { connectClient, type TestClient } from '../integration/harness.js';
import { makeRng, pickRandomMove, type Scenario } from './scenarios.js';
import type { Color, Move, RoomTimeControl } from '@mistboard/game';

export interface GameResult {
  scenario: string;
  gameIdx: number;
  /** Per-move user-perceived latency in ms (send_move → next observable my-turn snapshot or finish). */
  moveLatencies: number[];
  /** Wall time start→end of the game in ms. */
  durationMs: number;
  /** True if the server reported a finished status before we hit a cap. */
  finishedNaturally: boolean;
  /** Game outcome if finished naturally. */
  result?: { winner: 'white' | 'black' | null; reason: string };
  /** Non-fatal note (e.g. "hit maxMoves cap", "move-timeout") attached to the result. */
  note?: string;
  /** If the game errored out mid-stream, the error message. */
  error?: string;
}

export interface RunnerOptions {
  serverUrl: string;
  scenario: Scenario;
  concurrency: number;
  /** If set, override what's in the scenario (used by the CLI's --duration). */
  durationMs?: number;
  /** Base seed for deterministic move selection across runs. */
  seed?: number;
  /** Called after each game completes — used for progress reporting. */
  onGameComplete?: (result: GameResult) => void;
}

const HTTP_TIMEOUT_MS = 10_000;

type SnapshotMessage = {
  type: 'snapshot' | 'event-appended';
  seat?: 'white' | 'black' | 'spectator';
  state?: {
    status?: {
      type: 'pregame' | 'playing' | 'finished';
      turn?: Color;
      winner?: Color | null;
      reason?: string;
    };
    moveNumber?: number;
    legalMoves?: Move[];
  };
};

export async function runScenario(opts: RunnerOptions): Promise<GameResult[]> {
  const results: GameResult[] = [];
  const startedAt = Date.now();
  const wantsDuration = opts.durationMs !== undefined;
  const wallDeadline = wantsDuration ? startedAt + opts.durationMs! : Infinity;
  const baseSeed = opts.seed ?? 0x9e3779b9;

  // Concurrent workers — each one runs games back-to-back until duration elapses (if set)
  // or until each worker has run one game (if duration not set).
  const workerCount = Math.max(1, opts.concurrency);
  let gameCounter = 0;

  const worker = async (workerIdx: number): Promise<void> => {
    while (true) {
      const gameIdx = gameCounter++;
      // If duration-mode and deadline passed, stop. If single-pass mode, stop after one game per worker.
      if (wantsDuration && Date.now() >= wallDeadline) break;
      if (!wantsDuration && gameIdx >= workerCount) break;

      const seed = baseSeed ^ ((workerIdx + 1) * 0x9e3779b1) ^ (gameIdx * 0xcafe);
      const result = await runOneGame(opts.serverUrl, opts.scenario, gameIdx, seed);
      results.push(result);
      opts.onGameComplete?.(result);

      if (wantsDuration && Date.now() >= wallDeadline) break;
      if (!wantsDuration) break;
    }
  };

  await Promise.all(Array.from({ length: workerCount }, (_, i) => worker(i)));
  return results;
}

async function runOneGame(
  serverUrl: string,
  scenario: Scenario,
  gameIdx: number,
  seed: number,
): Promise<GameResult> {
  const gameStart = Date.now();
  try {
    const roomId = await createRoom(serverUrl, scenario);
    if (scenario.mode === 'pve') {
      return await runPveGame(serverUrl, roomId, scenario, gameIdx, gameStart, seed);
    }
    return await runPvpGame(serverUrl, roomId, scenario, gameIdx, gameStart, seed);
  } catch (err) {
    return {
      scenario: scenario.name,
      gameIdx,
      moveLatencies: [],
      durationMs: Date.now() - gameStart,
      finishedNaturally: false,
      error: (err as Error).message,
    };
  }
}

async function createRoom(serverUrl: string, scenario: Scenario): Promise<string> {
  const httpUrl = wsToHttpUrl(serverUrl);
  const body = {
    mode: scenario.mode,
    variant: scenario.variant,
    timeControl: scenario.timeControl,
    ...(scenario.mode === 'pve' && scenario.engineId ? { engineId: scenario.engineId } : {}),
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(`${httpUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`POST /api/rooms failed: ${res.status} ${text}`);
    }
    const json = (await res.json()) as { roomId: string };
    return json.roomId;
  } finally {
    clearTimeout(timer);
  }
}

function wsToHttpUrl(wsUrl: string): string {
  return wsUrl.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:');
}

async function runPveGame(
  serverUrl: string,
  roomId: string,
  scenario: Scenario,
  gameIdx: number,
  gameStart: number,
  seed: number,
): Promise<GameResult> {
  const client = await connectClient({ url: serverUrl, room: roomId, variant: scenario.variant });
  try {
    return await playLoop(client, scenario, gameIdx, gameStart, seed, /* mySeat */ 'white');
  } finally {
    await client.disconnect().catch(() => undefined);
  }
}

async function runPvpGame(
  serverUrl: string,
  roomId: string,
  scenario: Scenario,
  gameIdx: number,
  gameStart: number,
  seed: number,
): Promise<GameResult> {
  const a = await connectClient({ url: serverUrl, room: roomId, variant: scenario.variant });
  const b = await connectClient({ url: serverUrl, room: roomId, variant: scenario.variant });
  try {
    // Both clients play in lockstep; whichever is to move sends the next move.
    // We measure latency on the white client only (any side works; pick one to
    // avoid double-counting). Black still drives the game forward.
    const whiteClient = a.seat === 'white' ? a : b;
    const blackClient = a.seat === 'black' ? a : b;
    if (whiteClient.seat !== 'white' || blackClient.seat !== 'black') {
      throw new Error(`PvP pairing failed: seats ${a.seat}/${b.seat}`);
    }
    // Run both sides concurrently. White records latency.
    const whitePromise = playLoop(whiteClient, scenario, gameIdx, gameStart, seed ^ 0x1, 'white');
    const blackPromise = playLoop(
      blackClient,
      scenario,
      gameIdx,
      gameStart,
      seed ^ 0x2,
      'black',
      /* recordLatency */ false,
    );
    const [whiteResult] = await Promise.all([whitePromise, blackPromise]);
    return whiteResult;
  } finally {
    await Promise.all([
      a.disconnect().catch(() => undefined),
      b.disconnect().catch(() => undefined),
    ]);
  }
}

async function playLoop(
  client: TestClient,
  scenario: Scenario,
  gameIdx: number,
  gameStart: number,
  seed: number,
  mySeat: 'white' | 'black',
  recordLatency = true,
): Promise<GameResult> {
  const rng = makeRng(seed);
  const moveLatencies: number[] = [];
  // Track the moveNumber of the snapshot we last *acted* on so the next wait
  // looks past it. White is to-move at moveNumber=1 (chess fullmoves); black is
  // to-move at the same moveNumber that white just played at. So we always
  // need a strictly newer snapshot than the one we just consumed.
  let actedOnMove = -1;
  let movesPlayed = 0;
  let finishedNaturally = false;
  let result: { winner: 'white' | 'black' | null; reason: string } | undefined;
  let note: string | undefined;
  let lastMoveSentAt: number | null = null;

  while (true) {
    const elapsed = Date.now() - gameStart;
    if (elapsed > scenario.maxGameMs) {
      note = 'maxGameMs-exceeded';
      break;
    }
    if (movesPlayed >= scenario.maxMoves) {
      note = 'maxMoves-cap';
      break;
    }

    const remainingMs = Math.max(500, scenario.maxGameMs - elapsed);
    const waitMs = Math.min(scenario.moveTimeoutMs, remainingMs);
    let snapshot: SnapshotMessage;
    try {
      snapshot = await client.waitFor<SnapshotMessage>(
        (m) => isActionableSnapshot(m as SnapshotMessage, mySeat, actedOnMove),
        { timeoutMs: waitMs },
      );
    } catch (err) {
      note = `move-wait-timeout: ${(err as Error).message}`;
      // Diagnostic: dump status/turn/moveNumber of the LAST snapshot received,
      // so we can see why the predicate stopped matching.
      if (process.env.LOADTEST_DEBUG === '1') {
        const lastSnap = [...client.messages]
          .reverse()
          .find((m) => (m as { type: string }).type === 'snapshot') as SnapshotMessage | undefined;
        const tail = client.messages.slice(-3).map((m) => {
          const s = (m as SnapshotMessage).state;
          return `t=${(m as { type: string }).type} status=${s?.status?.type ?? '?'} turn=${s?.status?.turn ?? '?'} mn=${s?.moveNumber ?? '?'} legal=${s?.legalMoves?.length ?? '?'}`;
        });
        console.error(
          `[debug] game=${gameIdx} actedOnMove=${actedOnMove} movesPlayed=${movesPlayed} lastSnapshot=${JSON.stringify(lastSnap?.state?.status)} tail=${JSON.stringify(tail)}`,
        );
      }
      break;
    }

    // Latency = time from last move-send to this actionable snapshot arriving.
    if (lastMoveSentAt !== null && recordLatency) {
      moveLatencies.push(Date.now() - lastMoveSentAt);
      lastMoveSentAt = null;
    }

    const status = snapshot.state?.status;
    if (status?.type === 'finished') {
      finishedNaturally = true;
      result = { winner: status.winner ?? null, reason: status.reason ?? '' };
      break;
    }
    // Defensive: should always be playing+myTurn here per predicate, but loop if not.
    if (status?.type !== 'playing' || status.turn !== mySeat) continue;

    const legal = snapshot.state?.legalMoves ?? [];
    const choice = pickRandomMove(legal, rng);
    if (!choice) {
      note = 'no-legal-moves';
      break;
    }

    lastMoveSentAt = Date.now();
    client.send({
      type: 'move',
      from: choice.from,
      to: choice.to,
      ...(choice.promotion ? { promotion: choice.promotion } : {}),
    });
    actedOnMove = snapshot.state?.moveNumber ?? actedOnMove;
    movesPlayed += 1;
  }

  return {
    scenario: scenario.name,
    gameIdx,
    moveLatencies,
    durationMs: Date.now() - gameStart,
    finishedNaturally,
    result,
    note,
  };
}

function isActionableSnapshot(
  msg: SnapshotMessage,
  mySeat: 'white' | 'black',
  actedOnMove: number,
): boolean {
  // Accepts both legacy `snapshot` and the Phase 3 default `event-appended`.
  // Both carry the same `state` shape via apps/server/src/payloads.ts.
  if (msg.type !== 'snapshot' && msg.type !== 'event-appended') return false;
  const status = msg.state?.status;
  if (!status) return false;
  // Finished snapshot also counts — we want to break out of the loop on it.
  if (status.type === 'finished') return true;
  if (status.type !== 'playing') return false;
  if (status.turn !== mySeat) return false;
  // moveNumber is the chess fullmove counter (increments after black moves).
  // For white-to-move snapshots after a full round this strictly grows; for
  // black-to-move after a round it also grows by 1. Use > so we don't loop
  // forever on the same snapshot.
  const mn = msg.state?.moveNumber ?? -1;
  return mn > actedOnMove;
}

// Unused export marker so the time-control type isn't dropped by lint.
export type _TC = RoomTimeControl;
