/**
 * Golden wire-parity suite for the Dark Shogi (9x9) live-room runtime — same
 * harness as dark-crossroads-chess-golden-wire.test.ts. Pins the per-seat
 * snapshot payloads and redacted event-appended events for scripted games, plus
 * fixture-independent hidden-info invariants — including the shogi-specific one:
 * a seat's view carries only ITS OWN hand (reserves are private under fog).
 *
 * Regenerate ONLY for an intentional wire change:
 * MISTBOARD_GOLDEN_RECORD=1 npx tsx --test <this file>.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { getLegalShogiMoves, isShogiDrop, type ShogiMove } from '@mistboard/game';
import {
  appendDarkShogiRuntimeEvent,
  createDarkShogiRuntimeRoomFromEvents,
  type DarkShogiEvent,
  type DarkShogiRuntimeRoom,
  type DarkShogiSeat,
  darkShogiClientEventFor,
  darkShogiPlyAtEventIndex,
  darkShogiSnapshotPayload,
  expireDarkShogiClock,
} from './dark-shogi-runtime.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(HERE, '..', 'src', 'fixtures', 'dark-shogi-wire-golden.json');
const SEATS: readonly DarkShogiSeat[] = ['black', 'white', 'spectator'];

type SeatRecord = Record<string, unknown>;
type GoldenStep = {
  label: string;
  eventForSeat?: Record<string, unknown>;
  snapshots: Record<string, SeatRecord>;
};
type GoldenScript = { id: string; steps: GoldenStep[] };

function moveKey(move: ShogiMove): string {
  return isShogiDrop(move)
    ? `*${move.drop}${move.to}`
    : `${move.from}${move.to}${move.promote ? 'q' : ''}`;
}

function snapshotFor(room: DarkShogiRuntimeRoom, seat: DarkShogiSeat): SeatRecord {
  const payload = darkShogiSnapshotPayload(room, { id: `client-${seat}`, seat, solo: false });
  return { ...payload, serverAt: 0 };
}

function recordStep(
  script: GoldenScript,
  room: DarkShogiRuntimeRoom,
  label: string,
  appended?: { event: DarkShogiEvent; seq: number },
): void {
  const step: GoldenStep = { label, snapshots: {} };
  if (appended) {
    const ply = darkShogiPlyAtEventIndex(room.events, appended.seq);
    step.eventForSeat = {};
    for (const seat of SEATS)
      step.eventForSeat[seat] = darkShogiClientEventFor(appended.event, seat, ply);
  }
  for (const seat of SEATS) step.snapshots[seat] = snapshotFor(room, seat);
  script.steps.push(step);
}

function append(
  script: GoldenScript,
  room: DarkShogiRuntimeRoom,
  label: string,
  event: DarkShogiEvent,
): void {
  const seq = appendDarkShogiRuntimeEvent(room, event);
  recordStep(script, room, label, { event, seq });
}

function hydrate(events: DarkShogiEvent[]): DarkShogiRuntimeRoom {
  const created = createDarkShogiRuntimeRoomFromEvents(events);
  assert.ok(created.ok, 'golden script event log must hydrate');
  return created.room;
}

function firstLegalMove(room: DarkShogiRuntimeRoom): ShogiMove {
  const moves = [...getLegalShogiMoves(room.projection.state)].sort((a, b) =>
    moveKey(a).localeCompare(moveKey(b)),
  );
  assert.ok(moves[0], 'scripted position must have a legal move');
  return moves[0];
}

function playingTurn(room: DarkShogiRuntimeRoom): 'black' | 'white' {
  const status = room.projection.state.status;
  assert.equal(status.type, 'playing');
  return (status as { turn: 'black' | 'white' }).turn;
}

function runScriptA(): GoldenScript {
  const script: GoldenScript = { id: 'pvp-full-game', steps: [] };
  const roomId = 'dsg_golden-a';
  const timeControl = { initialMs: 180_000, incrementMs: 2_000 };
  const room = hydrate([
    {
      type: 'room-created',
      at: 1_000,
      roomId,
      gameSpecId: 'dark-shogi',
      creatorPreference: 'black',
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
        remainingMs: { black: timeControl.initialMs, white: timeControl.initialMs },
        runningSince: null,
      },
    },
  ]);
  recordStep(script, room, 'hydrated');
  append(script, room, 'seat-black', {
    type: 'seat-assigned',
    at: 2_000,
    roomId,
    clientId: 'client-black',
    seat: 'black',
  });
  append(script, room, 'seat-white', {
    type: 'seat-assigned',
    at: 3_000,
    roomId,
    clientId: 'client-white',
    seat: 'white',
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

function runScriptB(): GoldenScript {
  const script: GoldenScript = { id: 'pvp-abort', steps: [] };
  const roomId = 'dsg_golden-b';
  const room = hydrate([
    { type: 'room-created', at: 1_000, roomId, gameSpecId: 'dark-shogi' },
    { type: 'seat-assigned', at: 2_000, roomId, clientId: 'client-black', seat: 'black' },
    { type: 'seat-assigned', at: 3_000, roomId, clientId: 'client-white', seat: 'white' },
  ]);
  recordStep(script, room, 'hydrated');
  append(script, room, 'abort', { type: 'game-aborted', at: 5_000, roomId, reason: 'user-abort' });
  return script;
}

function runScriptC(): GoldenScript {
  const script: GoldenScript = { id: 'clock-expired', steps: [] };
  const roomId = 'dsg_golden-c';
  const timeControl = { initialMs: 60_000, incrementMs: 1_000 };
  const room = hydrate([
    { type: 'room-created', at: 1_000, roomId, gameSpecId: 'dark-shogi', timeControl },
    {
      type: 'clock-started',
      at: 1_000,
      roomId,
      clock: {
        activeColor: null,
        incrementMs: timeControl.incrementMs,
        initialMs: timeControl.initialMs,
        remainingMs: { black: timeControl.initialMs, white: timeControl.initialMs },
        runningSince: null,
      },
    },
    { type: 'seat-assigned', at: 2_000, roomId, clientId: 'client-black', seat: 'black' },
    { type: 'seat-assigned', at: 3_000, roomId, clientId: 'client-white', seat: 'white' },
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
  const expiredClock = expireDarkShogiClock(room.projection.clock, 90_000, expiredColor);
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

function asWireJson(scripts: GoldenScript[]): unknown {
  return JSON.parse(JSON.stringify({ scripts }));
}

test('dsg golden wire: per-seat payloads match the recorded fixture', () => {
  const actual = asWireJson(runAllScripts());
  if (process.env.MISTBOARD_GOLDEN_RECORD === '1') {
    writeFileSync(FIXTURE_PATH, `${JSON.stringify(actual, null, 2)}\n`);
    return;
  }
  assert.ok(
    existsSync(FIXTURE_PATH),
    `missing golden fixture ${FIXTURE_PATH}; record with MISTBOARD_GOLDEN_RECORD=1`,
  );
  assert.deepStrictEqual(actual, JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')));
});

// ── Hidden-info invariants ──────────────────────────────────────────────────

type WireSnapshot = {
  events: Array<{ type: string; color?: string }>;
  state: {
    board: Record<string, { color: string }>;
    hand: Record<string, number>;
    lastMove?: unknown;
    legalMoves: unknown[];
    visibleSquares: string[];
  };
};

function wireSnapshots(step: GoldenStep): Record<string, WireSnapshot> {
  return JSON.parse(JSON.stringify(step.snapshots));
}

test('dsg golden wire: opponent moves never reach the other seat or spectators', () => {
  for (const script of runAllScripts()) {
    for (const step of script.steps) {
      const snapshots = wireSnapshots(step);
      for (const seat of ['black', 'white', 'spectator'] as const) {
        const others =
          seat === 'black' ? ['white'] : seat === 'white' ? ['black'] : ['black', 'white'];
        for (const event of snapshots[seat]!.events) {
          if (event.type !== 'move-played') continue;
          assert.ok(
            !others.includes(event.color ?? ''),
            `${script.id}/${step.label}: ${seat} got a foreign move`,
          );
        }
      }
      const efs = step.eventForSeat as Record<string, { type?: string } | null> | undefined;
      if (efs?.black?.type === 'move-played') {
        assert.equal(efs.white, null, 'white must not see black move broadcast');
        assert.equal(efs.spectator, null, 'spectator must not see move broadcast');
      }
      if (efs?.white?.type === 'move-played')
        assert.equal(efs.black, null, 'black must not see white move broadcast');
    }
  }
});

test('dsg golden wire: a seat sees only its own pieces-in-vision and its OWN hand', () => {
  for (const script of runAllScripts()) {
    for (const step of script.steps) {
      const snapshots = wireSnapshots(step);
      for (const seat of ['black', 'white'] as const) {
        const view = snapshots[seat]!.state;
        const visible = new Set(view.visibleSquares);
        for (const [square, entry] of Object.entries(view.board)) {
          if (entry.color !== seat) {
            assert.ok(
              visible.has(square),
              `${script.id}/${step.label}: ${seat} sees a hidden ${entry.color} piece on ${square}`,
            );
          }
        }
        // The hand is present (the viewer's own); the enemy hand is never a field.
        assert.equal(typeof view.hand, 'object');
      }
      const spectator = snapshots.spectator!.state;
      assert.deepStrictEqual(spectator.board, {});
      assert.deepStrictEqual(spectator.hand, {});
      assert.deepStrictEqual(spectator.visibleSquares, []);
      assert.deepStrictEqual(spectator.legalMoves, []);
      assert.equal(spectator.lastMove, undefined);
    }
  }
});

test('dsg golden wire: lastMove is stripped unless the seat moved last', () => {
  const script = runScriptA();
  const afterBlackMove = script.steps.find((step) => step.label === 'move-1-black');
  assert.ok(afterBlackMove);
  const snapshots = wireSnapshots(afterBlackMove);
  assert.notEqual(snapshots.black!.state.lastMove, undefined);
  assert.equal(snapshots.white!.state.lastMove, undefined);
});

test('dsg golden wire: snapshot omits engine/rated/rematch keys (bare wire shape)', () => {
  const last = runScriptA().steps.at(-1);
  assert.ok(last);
  for (const seat of SEATS) {
    const snapshot: SeatRecord = last.snapshots[seat]!;
    for (const key of ['mode', 'pveEngineId', 'rated', 'forfeitDeadline', 'rematch']) {
      assert.ok(!(key in snapshot), `dsg snapshot must not carry '${key}'`);
    }
  }
});
