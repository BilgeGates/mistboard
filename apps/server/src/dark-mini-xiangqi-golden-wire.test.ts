/**
 * Golden wire-parity suite for the Dark Mini Xiangqi live-room runtime.
 *
 * Pins the per-seat wire surface (snapshot payloads + redacted event-appended
 * events) for scripted games BEFORE the VariantTenant extraction, so the
 * migration can prove the generic runtime emits an identical wire format for
 * every seat (red, black, spectator). Two layers:
 *
 *   1. Fixture parity — every recorded payload deep-equals
 *      fixtures/dark-mini-xiangqi-wire-golden.json. Regenerate ONLY for an
 *      intentional wire change: MISTBOARD_GOLDEN_RECORD=1 node --test ... then
 *      review the fixture diff like a protocol change.
 *   2. Hidden-info invariants — asserted inline (not via the fixture) so they
 *      hold even when the fixture is regenerated: opponent moves never appear
 *      in a seat's event stream, spectators get the empty view, opponent
 *      pieces only appear on visible squares, and lastMove never reveals an
 *      opponent move.
 *
 * Deterministic by construction: rooms hydrate from fixed-timestamp event
 * logs (no feature-flag/Date.now() in the room path) and moves are chosen as
 * the lexicographically-first legal move. The only wall-clock field, snapshot
 * serverAt, is normalized to 0.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { getMiniXiangqiLegalMoves, type MiniXiangqiMove } from '@mistboard/game';
import type {
  DarkMiniXiangqiEvent,
  DarkMiniXiangqiRuntimeRoom,
  DarkMiniXiangqiSeat,
} from './dark-mini-xiangqi-runtime.js';
import {
  darkMiniXiangqiClientEventFor,
  darkMiniXiangqiTenant,
} from './dark-mini-xiangqi-tenant.js';
import {
  appendTenantRuntimeEvent,
  createTenantRuntimeRoomFromEvents,
  expireTenantClock,
  tenantPlyAtEventIndex,
  tenantSnapshotPayload,
} from './variant-tenant/runtime.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// Anchor on the package dir so the fixture resolves whether this file runs
// from src/ (tsx, test:unit) or compiled into dist/ (test:persistent).
const FIXTURE_PATH = join(HERE, '..', 'src', 'fixtures', 'dark-mini-xiangqi-wire-golden.json');
const SEATS: readonly DarkMiniXiangqiSeat[] = ['red', 'black', 'spectator'];

type SeatRecord = Record<string, unknown>;

type GoldenStep = {
  label: string;
  // darkMiniXiangqiClientEventFor output per seat for the event appended at
  // this step (absent for probe steps that only mutate transient room state).
  eventForSeat?: Record<string, unknown>;
  snapshots: Record<string, SeatRecord>;
};

type GoldenScript = { id: string; steps: GoldenStep[] };

function snapshotFor(room: DarkMiniXiangqiRuntimeRoom, seat: DarkMiniXiangqiSeat): SeatRecord {
  const payload = tenantSnapshotPayload(darkMiniXiangqiTenant, room, {
    id: `client-${seat}`,
    seat,
    solo: false,
  });
  // serverAt is the one wall-clock field on the snapshot; pin it for the golden.
  return { ...payload, serverAt: 0 };
}

function recordStep(
  script: GoldenScript,
  room: DarkMiniXiangqiRuntimeRoom,
  label: string,
  appended?: { event: DarkMiniXiangqiEvent; seq: number },
): void {
  const step: GoldenStep = { label, snapshots: {} };
  if (appended) {
    const ply = tenantPlyAtEventIndex(room.events, appended.seq);
    step.eventForSeat = {};
    for (const seat of SEATS) {
      step.eventForSeat[seat] = darkMiniXiangqiClientEventFor(appended.event, seat, ply);
    }
  }
  for (const seat of SEATS) {
    step.snapshots[seat] = snapshotFor(room, seat);
  }
  script.steps.push(step);
}

function append(
  script: GoldenScript,
  room: DarkMiniXiangqiRuntimeRoom,
  label: string,
  event: DarkMiniXiangqiEvent,
): void {
  const seq = appendTenantRuntimeEvent(darkMiniXiangqiTenant, room, event);
  recordStep(script, room, label, { event, seq });
}

function hydrate(events: DarkMiniXiangqiEvent[]): DarkMiniXiangqiRuntimeRoom {
  const created = createTenantRuntimeRoomFromEvents(darkMiniXiangqiTenant, events);
  assert.ok(created.ok, 'golden script event log must hydrate');
  return created.room;
}

function firstLegalMove(room: DarkMiniXiangqiRuntimeRoom): MiniXiangqiMove {
  const moves = [...getMiniXiangqiLegalMoves(room.projection.state)].sort((a, b) =>
    `${a.from}${a.to}`.localeCompare(`${b.from}${b.to}`),
  );
  assert.ok(moves[0], 'scripted position must have a legal move');
  return { from: moves[0].from, to: moves[0].to };
}

function playingTurn(room: DarkMiniXiangqiRuntimeRoom): 'red' | 'black' {
  const status = room.projection.state.status;
  assert.equal(status.type, 'playing');
  return (status as { turn: 'red' | 'black' }).turn;
}

// ── Script A: PvP game — seats, six moves, forfeit-deadline probe, resign,
// rematch probes. The richest wire surface: clock arming + increments, per-seat
// move redaction, forfeit-deadline seat gating, rematch flags. ──────────────
function runScriptA(): GoldenScript {
  const script: GoldenScript = { id: 'pvp-full-game', steps: [] };
  const roomId = 'dmxq_golden-a';
  const timeControl = { initialMs: 180_000, incrementMs: 2_000 };
  const room = hydrate([
    {
      type: 'room-created',
      at: 1_000,
      roomId,
      gameSpecId: 'dark-mini-xiangqi',
      creatorPreference: 'red',
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
        remainingMs: { black: timeControl.initialMs, red: timeControl.initialMs },
        runningSince: null,
      },
    },
  ]);
  recordStep(script, room, 'hydrated');

  append(script, room, 'seat-red', {
    type: 'seat-assigned',
    at: 2_000,
    roomId,
    clientId: 'client-red',
    seat: 'red',
  });
  append(script, room, 'seat-black', {
    type: 'seat-assigned',
    at: 3_000,
    roomId,
    clientId: 'client-black',
    seat: 'black',
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

  // Probe: only the seat OPPOSITE the forfeiting seat may see the deadline
  // (the "you win in Ns" banner must never leak to the leaver).
  room.forfeitSeat = 'black';
  room.forfeitDeadline = 999_999;
  recordStep(script, room, 'forfeit-deadline-probe');
  room.forfeitSeat = null;
  room.forfeitDeadline = null;

  append(script, room, 'resign', {
    type: 'seat-resigned',
    at: 60_000,
    roomId,
    color: playingTurn(room),
  });

  // Probe: rematch wire flags expose offer booleans only, never token material.
  room.rematch.offers.red = { tokenHash: 'golden-hash', userId: null, at: 61_000 };
  recordStep(script, room, 'rematch-offer-probe');
  room.rematch.finalizedRoomId = 'dmxq_golden-next';
  recordStep(script, room, 'rematch-finalized-probe');
  room.rematch = { offers: {} };

  return script;
}

// ── Script B: PvE room (engine seated at creation) aborted pregame. Covers
// mode/pveEngineId, engine seat shown connected, and the aborted projection. ──
function runScriptB(): GoldenScript {
  const script: GoldenScript = { id: 'pve-abort', steps: [] };
  const roomId = 'dmxq_golden-b';
  const room = hydrate([
    { type: 'room-created', at: 1_000, roomId, gameSpecId: 'dark-mini-xiangqi' },
    {
      type: 'seat-assigned',
      at: 1_000,
      roomId,
      clientId: 'python-dmx-v1.0',
      seat: 'red',
    },
  ]);
  recordStep(script, room, 'hydrated');

  append(script, room, 'seat-black-human', {
    type: 'seat-assigned',
    at: 2_000,
    roomId,
    clientId: 'client-black',
    seat: 'black',
  });
  append(script, room, 'abort', {
    type: 'game-aborted',
    at: 5_000,
    roomId,
    reason: 'user-abort',
  });
  return script;
}

// ── Script C: timed game ending by clock expiry. Covers clock arming after the
// second player's first move and the clock-expired terminal projection. ──────
function runScriptC(): GoldenScript {
  const script: GoldenScript = { id: 'clock-expired', steps: [] };
  const roomId = 'dmxq_golden-c';
  const timeControl = { initialMs: 60_000, incrementMs: 1_000 };
  const room = hydrate([
    {
      type: 'room-created',
      at: 1_000,
      roomId,
      gameSpecId: 'dark-mini-xiangqi',
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
        remainingMs: { black: timeControl.initialMs, red: timeControl.initialMs },
        runningSince: null,
      },
    },
    { type: 'seat-assigned', at: 2_000, roomId, clientId: 'client-red', seat: 'red' },
    { type: 'seat-assigned', at: 3_000, roomId, clientId: 'client-black', seat: 'black' },
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
  const expiredClock = expireTenantClock(room.projection.clock, 90_000, expiredColor);
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
// on the wire (JSON.stringify in sendDarkMiniXiangqiPayload).
function asWireJson(scripts: GoldenScript[]): unknown {
  return JSON.parse(JSON.stringify({ scripts }));
}

test('dmx golden wire: per-seat payloads match the recorded fixture', () => {
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
  events: Array<{ type: string; color?: string; seat?: string }>;
  forfeitDeadline: number | null;
  state: {
    board: Record<string, { color: string }>;
    lastMove?: unknown;
    legalMoves: unknown[];
    visibleSquares: string[];
  };
};

function wireSnapshots(step: GoldenStep): Record<string, WireSnapshot> {
  return JSON.parse(JSON.stringify(step.snapshots));
}

test('dmx golden wire: opponent moves never reach the other seat or spectators', () => {
  for (const script of runAllScripts()) {
    for (const step of script.steps) {
      const snapshots = wireSnapshots(step);
      for (const seat of ['red', 'black'] as const) {
        const other = seat === 'red' ? 'black' : 'red';
        for (const event of snapshots[seat]!.events) {
          assert.notEqual(
            `${event.type}:${event.color}`,
            `move-played:${other}`,
            `${script.id}/${step.label}: ${seat} received an opponent move event`,
          );
          if (event.type === 'seat-assigned') {
            assert.equal(event.seat, seat, `${script.id}/${step.label}: foreign seat-assigned`);
          }
        }
      }
      assert.deepStrictEqual(
        snapshots.spectator!.events,
        [],
        `${script.id}/${step.label}: spectator event stream must be empty`,
      );
      const eventForSeat = step.eventForSeat as
        | Record<string, { type?: string; color?: string } | null>
        | undefined;
      if (eventForSeat?.red?.type === 'move-played') {
        assert.equal(eventForSeat.black, null, 'black must not see red move broadcast');
      }
      if (eventForSeat?.black?.type === 'move-played') {
        assert.equal(eventForSeat.red, null, 'red must not see black move broadcast');
      }
      assert.equal(eventForSeat?.spectator ?? null, null, 'spectator broadcasts must be null');
    }
  }
});

test('dmx golden wire: views never reveal hidden opponent pieces or moves', () => {
  for (const script of runAllScripts()) {
    for (const step of script.steps) {
      const snapshots = wireSnapshots(step);
      for (const seat of ['red', 'black'] as const) {
        const view = snapshots[seat]!.state;
        const visible = new Set(view.visibleSquares);
        for (const [square, piece] of Object.entries(view.board)) {
          if (piece.color === seat) continue;
          assert.ok(
            visible.has(square),
            `${script.id}/${step.label}: ${seat} sees hidden opponent piece on ${square}`,
          );
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

test('dmx golden wire: forfeit deadline only visible to the non-forfeiting seat', () => {
  const script = runScriptA();
  const probe = script.steps.find((step) => step.label === 'forfeit-deadline-probe');
  assert.ok(probe);
  const snapshots = wireSnapshots(probe);
  assert.equal(snapshots.red!.forfeitDeadline, 999_999, 'winner seat sees the deadline');
  assert.equal(snapshots.black!.forfeitDeadline, null, 'forfeiting seat must not see it');
  assert.equal(snapshots.spectator!.forfeitDeadline, null);
});

test('dmx golden wire: lastMove is stripped unless the seat moved last', () => {
  const script = runScriptA();
  // After move-1 (red), red sees its own lastMove; black must not.
  const afterRedMove = script.steps.find((step) => step.label === 'move-1-red');
  assert.ok(afterRedMove);
  const snapshots = wireSnapshots(afterRedMove);
  assert.notEqual(snapshots.red!.state.lastMove, undefined);
  assert.equal(snapshots.black!.state.lastMove, undefined);
});
