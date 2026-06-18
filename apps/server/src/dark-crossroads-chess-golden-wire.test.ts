/**
 * Golden wire-parity suite for the Dark Crossroads Chess (6x8) live-room
 * runtime — same harness as dark-xiangqi-golden-wire.test.ts. Pins the
 * per-seat snapshot payloads and redacted event-appended events for scripted
 * games, plus fixture-independent hidden-info invariants.
 *
 * Dark Crossroads wire shape this suite pins (mirrors Dark Xiangqi): the
 * snapshot has NO mode/pveEngineId/rated/forfeitDeadline/rematch keys;
 * spectators and the other seat DO receive non-move events (only move-played
 * is redacted to the mover); shrouded board entries carry {color,
 * shrouded:true} only; lastMove is own-moves-only; the event log accepts
 * seat-vacated.
 *
 * Regenerate ONLY for an intentional wire change:
 * MISTBOARD_GOLDEN_RECORD=1 npx tsx --test <this file>.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { type CrossroadsChessMove, getCrossroadsChessLegalMoves } from '@mistboard/game';
import {
  appendDarkCrossroadsChessRuntimeEvent,
  createDarkCrossroadsChessRuntimeRoomFromEvents,
  type DarkCrossroadsChessEvent,
  type DarkCrossroadsChessRuntimeRoom,
  type DarkCrossroadsChessSeat,
  darkCrossroadsChessClientEventFor,
  darkCrossroadsChessPlyAtEventIndex,
  darkCrossroadsChessSnapshotPayload,
  expireDarkCrossroadsChessClock,
} from './dark-crossroads-chess-runtime.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// Anchor on the package dir so the fixture resolves whether this file runs
// from src/ (tsx, test:unit) or compiled into dist/ (test:persistent).
const FIXTURE_PATH = join(HERE, '..', 'src', 'fixtures', 'dark-crossroads-chess-wire-golden.json');
const SEATS: readonly DarkCrossroadsChessSeat[] = ['white', 'red', 'spectator'];

type SeatRecord = Record<string, unknown>;

type GoldenStep = {
  label: string;
  eventForSeat?: Record<string, unknown>;
  snapshots: Record<string, SeatRecord>;
};

type GoldenScript = { id: string; steps: GoldenStep[] };

function snapshotFor(
  room: DarkCrossroadsChessRuntimeRoom,
  seat: DarkCrossroadsChessSeat,
): SeatRecord {
  const payload = darkCrossroadsChessSnapshotPayload(room, {
    id: `client-${seat}`,
    seat,
    solo: false,
  });
  return { ...payload, serverAt: 0 };
}

function recordStep(
  script: GoldenScript,
  room: DarkCrossroadsChessRuntimeRoom,
  label: string,
  appended?: { event: DarkCrossroadsChessEvent; seq: number },
): void {
  const step: GoldenStep = { label, snapshots: {} };
  if (appended) {
    const ply = darkCrossroadsChessPlyAtEventIndex(room.events, appended.seq);
    step.eventForSeat = {};
    for (const seat of SEATS) {
      step.eventForSeat[seat] = darkCrossroadsChessClientEventFor(appended.event, seat, ply);
    }
  }
  for (const seat of SEATS) {
    step.snapshots[seat] = snapshotFor(room, seat);
  }
  script.steps.push(step);
}

function append(
  script: GoldenScript,
  room: DarkCrossroadsChessRuntimeRoom,
  label: string,
  event: DarkCrossroadsChessEvent,
): void {
  const seq = appendDarkCrossroadsChessRuntimeEvent(room, event);
  recordStep(script, room, label, { event, seq });
}

function hydrate(events: DarkCrossroadsChessEvent[]): DarkCrossroadsChessRuntimeRoom {
  const created = createDarkCrossroadsChessRuntimeRoomFromEvents(events);
  assert.ok(created.ok, 'golden script event log must hydrate');
  return created.room;
}

function firstLegalMove(room: DarkCrossroadsChessRuntimeRoom): CrossroadsChessMove {
  const moves = [...getCrossroadsChessLegalMoves(room.projection.state)].sort((a, b) =>
    `${a.from}${a.to}`.localeCompare(`${b.from}${b.to}`),
  );
  assert.ok(moves[0], 'scripted position must have a legal move');
  return { from: moves[0].from, to: moves[0].to };
}

function playingTurn(room: DarkCrossroadsChessRuntimeRoom): 'white' | 'red' {
  const status = room.projection.state.status;
  assert.equal(status.type, 'playing');
  return (status as { turn: 'white' | 'red' }).turn;
}

// ── Script A: PvP game — seats, a vacate/re-seat probe, six moves, resign. ──
function runScriptA(): GoldenScript {
  const script: GoldenScript = { id: 'pvp-full-game', steps: [] };
  const roomId = 'ddchess_golden-a';
  const timeControl = { initialMs: 180_000, incrementMs: 2_000 };
  const room = hydrate([
    {
      type: 'room-created',
      at: 1_000,
      roomId,
      gameSpecId: 'dark-crossroads-chess',
      creatorPreference: 'white',
      timeControl,
    },
    {
      type: 'clock-started',
      at: 1_000,
      roomId,
      clock: {
        activeColor: null,
        incrementMs: timeControl.incrementMs,
        initialMs: timeControl.initialMs,
        remainingMs: { white: timeControl.initialMs, red: timeControl.initialMs },
        runningSince: null,
      },
    },
  ]);
  recordStep(script, room, 'hydrated');

  append(script, room, 'seat-white', {
    type: 'seat-assigned',
    at: 2_000,
    roomId,
    clientId: 'client-white-1',
    seat: 'white',
  });
  // Pregame vacate + re-seat: pins the seat-vacated wire passthrough and the
  // projection seat removal (only when the clientId still holds the seat).
  append(script, room, 'vacate-white', {
    type: 'seat-vacated',
    at: 2_500,
    roomId,
    clientId: 'client-white-1',
    seat: 'white',
  });
  append(script, room, 'reseat-white', {
    type: 'seat-assigned',
    at: 2_800,
    roomId,
    clientId: 'client-white',
    seat: 'white',
  });
  append(script, room, 'seat-red', {
    type: 'seat-assigned',
    at: 3_000,
    roomId,
    clientId: 'client-red',
    seat: 'red',
  });

  for (let i = 0; i < 6; i += 1) {
    const color = playingTurn(room);
    append(script, room, `move-${i + 1}-${color}`, {
      type: 'move-played',
      at: 10_000 + i * 5_000,
      roomId,
      color,
      move: firstLegalMove(room),
    });
  }

  append(script, room, 'resign', {
    type: 'seat-resigned',
    at: 60_000,
    roomId,
    color: playingTurn(room),
  });
  return script;
}

// ── Script B: untimed room aborted pregame. ─────────────────────────────────
function runScriptB(): GoldenScript {
  const script: GoldenScript = { id: 'pvp-abort', steps: [] };
  const roomId = 'ddchess_golden-b';
  const room = hydrate([
    { type: 'room-created', at: 1_000, roomId, gameSpecId: 'dark-crossroads-chess' },
    { type: 'seat-assigned', at: 2_000, roomId, clientId: 'client-white', seat: 'white' },
    { type: 'seat-assigned', at: 3_000, roomId, clientId: 'client-red', seat: 'red' },
  ]);
  recordStep(script, room, 'hydrated');
  append(script, room, 'abort', {
    type: 'game-aborted',
    at: 5_000,
    roomId,
    reason: 'user-abort',
  });
  return script;
}

// ── Script C: timed game ending by clock expiry after the clock arms. ───────
function runScriptC(): GoldenScript {
  const script: GoldenScript = { id: 'clock-expired', steps: [] };
  const roomId = 'ddchess_golden-c';
  const timeControl = { initialMs: 60_000, incrementMs: 1_000 };
  const room = hydrate([
    {
      type: 'room-created',
      at: 1_000,
      roomId,
      gameSpecId: 'dark-crossroads-chess',
      timeControl,
    },
    {
      type: 'clock-started',
      at: 1_000,
      roomId,
      clock: {
        activeColor: null,
        incrementMs: timeControl.incrementMs,
        initialMs: timeControl.initialMs,
        remainingMs: { white: timeControl.initialMs, red: timeControl.initialMs },
        runningSince: null,
      },
    },
    { type: 'seat-assigned', at: 2_000, roomId, clientId: 'client-white', seat: 'white' },
    { type: 'seat-assigned', at: 3_000, roomId, clientId: 'client-red', seat: 'red' },
  ]);
  recordStep(script, room, 'hydrated');

  for (let i = 0; i < 2; i += 1) {
    const color = playingTurn(room);
    append(script, room, `move-${i + 1}-${color}`, {
      type: 'move-played',
      at: 10_000 + i * 5_000,
      roomId,
      color,
      move: firstLegalMove(room),
    });
  }

  const expiredColor = playingTurn(room);
  const expiredClock = expireDarkCrossroadsChessClock(room.projection.clock, 90_000, expiredColor);
  assert.ok(expiredClock, 'script C must have an armed clock to expire');
  append(script, room, 'clock-expired', {
    type: 'clock-expired',
    at: 90_000,
    roomId,
    color: expiredColor,
    clock: expiredClock,
  });
  return script;
}

function runAllScripts(): GoldenScript[] {
  return [runScriptA(), runScriptB(), runScriptC()];
}

// Round-trip through JSON so undefined-valued keys drop out exactly as they do
// on the wire.
function asWireJson(scripts: GoldenScript[]): unknown {
  return JSON.parse(JSON.stringify({ scripts }));
}

test('ddchess golden wire: per-seat payloads match the recorded fixture', () => {
  const actual = asWireJson(runAllScripts());
  if (process.env.MISTBOARD_GOLDEN_RECORD === '1') {
    writeFileSync(FIXTURE_PATH, `${JSON.stringify(actual, null, 2)}\n`);
    return;
  }
  assert.ok(
    existsSync(FIXTURE_PATH),
    `missing golden fixture ${FIXTURE_PATH}; record once with MISTBOARD_GOLDEN_RECORD=1`,
  );
  const expected = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
  assert.deepStrictEqual(actual, expected);
});

// ── Hidden-info invariants, independent of the fixture ──────────────────────

type WireSnapshot = {
  events: Array<{ type: string; color?: string }>;
  state: {
    board: Record<
      string,
      { shrouded: false; piece: { color: string } } | { shrouded: true; color: string }
    >;
    lastMove?: unknown;
    legalMoves: unknown[];
    visibleSquares: string[];
  };
};

function wireSnapshots(step: GoldenStep): Record<string, WireSnapshot> {
  return JSON.parse(JSON.stringify(step.snapshots));
}

test('ddchess golden wire: opponent moves never reach the other seat or spectators', () => {
  for (const script of runAllScripts()) {
    for (const step of script.steps) {
      const snapshots = wireSnapshots(step);
      for (const seat of ['white', 'red', 'spectator'] as const) {
        const others = seat === 'white' ? ['red'] : seat === 'red' ? ['white'] : ['white', 'red'];
        for (const event of snapshots[seat]!.events) {
          if (event.type !== 'move-played') continue;
          assert.ok(
            !others.includes(event.color ?? ''),
            `${script.id}/${step.label}: ${seat} received a foreign move event`,
          );
        }
      }
      const eventForSeat = step.eventForSeat as
        | Record<string, { type?: string } | null>
        | undefined;
      if (eventForSeat?.white?.type === 'move-played') {
        assert.equal(eventForSeat.red, null, 'red must not see white move broadcast');
        assert.equal(eventForSeat.spectator, null, 'spectator must not see move broadcast');
      }
      if (eventForSeat?.red?.type === 'move-played') {
        assert.equal(eventForSeat.white, null, 'white must not see red move broadcast');
      }
    }
  }
});

test('ddchess golden wire: shrouded board entries never carry piece identity', () => {
  for (const script of runAllScripts()) {
    for (const step of script.steps) {
      const snapshots = wireSnapshots(step);
      for (const seat of ['white', 'red'] as const) {
        const view = snapshots[seat]!.state;
        const visible = new Set(view.visibleSquares);
        for (const [square, entry] of Object.entries(view.board)) {
          if (entry.shrouded) {
            assert.ok(
              !('piece' in entry),
              `${script.id}/${step.label}: shrouded entry on ${square} leaks a piece`,
            );
          } else if (entry.piece.color !== seat) {
            assert.ok(
              visible.has(square),
              `${script.id}/${step.label}: ${seat} sees hidden opponent piece on ${square}`,
            );
          }
        }
      }
      const spectatorView = snapshots.spectator!.state;
      assert.deepStrictEqual(spectatorView.board, {});
      assert.deepStrictEqual(spectatorView.visibleSquares, []);
      assert.deepStrictEqual(spectatorView.legalMoves, []);
      assert.equal(spectatorView.lastMove, undefined);
    }
  }
});

test('ddchess golden wire: lastMove is stripped unless the seat moved last', () => {
  const script = runScriptA();
  const afterWhiteMove = script.steps.find((step) => step.label === 'move-1-white');
  assert.ok(afterWhiteMove);
  const snapshots = wireSnapshots(afterWhiteMove);
  assert.notEqual(snapshots.white!.state.lastMove, undefined);
  assert.equal(snapshots.red!.state.lastMove, undefined);
});

test('ddchess golden wire: snapshot omits engine/rated/rematch keys (ddchess wire shape)', () => {
  const script = runScriptA();
  const last = script.steps.at(-1);
  assert.ok(last);
  for (const seat of SEATS) {
    const snapshot = last.snapshots[seat]!;
    for (const key of ['mode', 'pveEngineId', 'rated', 'forfeitDeadline', 'rematch']) {
      assert.ok(!(key in snapshot), `ddchess snapshot must not carry '${key}'`);
    }
  }
});
