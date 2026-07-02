/**
 * Golden wire-parity suite for the Crossroads Chess live-room runtime —
 * recorded BEFORE its VariantTenant migration, same harness as
 * dark-xiangqi-golden-wire.test.ts. Pins the per-seat transport snapshot
 * payloads (the true wire: runtime payload + roomMode/pveEngineId/engine
 * connectedSeats marking) and the per-seat broadcast events for scripted
 * games, plus fixture-independent perfect-info invariants.
 *
 * Crossroads wire quirks this suite intentionally pins (they differ from the
 * fog tenants): every seat (including spectators) receives every event and
 * the full board; the snapshot carries roomMode always and pveEngineId only
 * for PvE rooms; forfeitDeadline is gated to the seat opposite the leaver;
 * rematch offers are keyed white/red; the event log accepts the legacy
 * 'dual-chess' gameSpecId alias and normalizes the projection to
 * 'crossroads-chess'.
 *
 * Regenerate ONLY for an intentional wire change:
 * MISTBOARD_GOLDEN_RECORD=1 npx tsx --test <this file>.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CROSSROADS_CHESS_SPEC_ID,
  type CrossroadsChessMove,
  DUAL_CHESS_SPEC_ID,
  getCrossroadsChessOpenLegalMoves,
} from '@mistboard/game';
import { CROSSROADS_CHESS_DEFAULT_ENGINE_ID } from './crossroads-chess-engine.js';
import type {
  CrossroadsChessEvent,
  CrossroadsChessRuntimeRoom,
  CrossroadsChessSeat,
} from './crossroads-chess-runtime.js';
import { crossroadsChessTenant } from './crossroads-chess-tenant.js';
import type { CrossroadsChessLiveClient } from './server-crossroads-chess-live-room.js';
import { crossroadsChessTransportSnapshotPayload } from './server-ws-crossroads-chess.js';
import {
  appendTenantRuntimeEvent,
  createTenantRuntimeRoomFromEvents,
  expireTenantClock,
  tenantPlyAtEventIndex,
} from './variant-tenant/runtime.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// Anchor on the package dir so the fixture resolves whether this file runs
// from src/ (tsx, test:unit) or compiled into dist/ (test:persistent).
const FIXTURE_PATH = join(HERE, '..', 'src', 'fixtures', 'crossroads-chess-wire-golden.json');
const SEATS: readonly CrossroadsChessSeat[] = ['white', 'red', 'spectator'];

type SeatRecord = Record<string, unknown>;

type GoldenStep = {
  label: string;
  eventForSeat?: Record<string, unknown>;
  snapshots: Record<string, SeatRecord>;
};

type GoldenScript = { id: string; steps: GoldenStep[] };

// The transport payload only reads id/seat off the client; spectators are a
// runtime-level seat the live-client type doesn't model, hence the cast.
function wireClient(seat: CrossroadsChessSeat): CrossroadsChessLiveClient {
  return { id: `client-${seat}`, seat } as unknown as CrossroadsChessLiveClient;
}

function snapshotFor(room: CrossroadsChessRuntimeRoom, seat: CrossroadsChessSeat): SeatRecord {
  const payload = crossroadsChessTransportSnapshotPayload(
    room as Parameters<typeof crossroadsChessTransportSnapshotPayload>[0],
    wireClient(seat),
  );
  return { ...payload, serverAt: 0 };
}

// Perfect-info broadcast policy: every seat gets the event, moves numbered.
function eventForSeat(room: CrossroadsChessRuntimeRoom, event: CrossroadsChessEvent, seq: number) {
  return event.type === 'move-played'
    ? { ...event, ply: tenantPlyAtEventIndex(room.events, seq) }
    : event;
}

function recordStep(
  script: GoldenScript,
  room: CrossroadsChessRuntimeRoom,
  label: string,
  appended?: { event: CrossroadsChessEvent; seq: number },
): void {
  const step: GoldenStep = { label, snapshots: {} };
  if (appended) {
    step.eventForSeat = {};
    for (const seat of SEATS) {
      step.eventForSeat[seat] = eventForSeat(room, appended.event, appended.seq);
    }
  }
  for (const seat of SEATS) {
    step.snapshots[seat] = snapshotFor(room, seat);
  }
  script.steps.push(step);
}

function append(
  script: GoldenScript,
  room: CrossroadsChessRuntimeRoom,
  label: string,
  event: CrossroadsChessEvent,
): void {
  const seq = appendTenantRuntimeEvent(crossroadsChessTenant, room, event);
  recordStep(script, room, label, { event, seq });
}

function hydrate(events: CrossroadsChessEvent[]): CrossroadsChessRuntimeRoom {
  const created = createTenantRuntimeRoomFromEvents(crossroadsChessTenant, events);
  assert.ok(created.ok, 'golden script event log must hydrate');
  return created.room;
}

// Canonical legal move, exactly as the ws move path appends it (the legal-move
// object itself, so promotion rides along when present).
function firstLegalMove(room: CrossroadsChessRuntimeRoom): CrossroadsChessMove {
  const moves = [...getCrossroadsChessOpenLegalMoves(room.projection.state)].sort((a, b) =>
    `${a.from}${a.to}`.localeCompare(`${b.from}${b.to}`),
  );
  assert.ok(moves[0], 'scripted position must have a legal move');
  return moves[0];
}

function playingTurn(room: CrossroadsChessRuntimeRoom): 'white' | 'red' {
  const status = room.projection.state.status;
  assert.equal(status.type, 'playing');
  return (status as { turn: 'white' | 'red' }).turn;
}

// ── Script A: timed PvP — seats, six moves, forfeit-window probe, resign,
//    rematch offer/finalize probes. ─────────────────────────────────────────
function runScriptA(): GoldenScript {
  const script: GoldenScript = { id: 'pvp-full-game', steps: [] };
  const roomId = 'dchess_golden-a';
  const timeControl = { initialMs: 180_000, incrementMs: 2_000 };
  const room = hydrate([
    {
      type: 'room-created',
      at: 1_000,
      roomId,
      gameSpecId: CROSSROADS_CHESS_SPEC_ID,
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

  // Forfeit window open against red: only white (the seat that would win) may
  // see the deadline on the wire.
  room.forfeitSeat = 'red';
  room.forfeitDeadline = 99_000;
  recordStep(script, room, 'forfeit-window-red');
  room.forfeitSeat = null;
  room.forfeitDeadline = null;
  recordStep(script, room, 'forfeit-window-cleared');

  append(script, room, 'resign', {
    type: 'seat-resigned',
    at: 60_000,
    roomId,
    color: playingTurn(room),
  });

  // Rematch flags ride the snapshot: one-sided offer, then a finalized room id.
  room.rematch.offers.white = { tokenHash: 'golden-hash', userId: null, at: 70_000 };
  recordStep(script, room, 'rematch-offer-white');
  room.rematch.finalizedRoomId = 'dchess_golden-a-next';
  recordStep(script, room, 'rematch-finalized');
  return script;
}

// ── Script B: untimed room aborted pregame. ─────────────────────────────────
function runScriptB(): GoldenScript {
  const script: GoldenScript = { id: 'pvp-abort', steps: [] };
  const roomId = 'dchess_golden-b';
  const room = hydrate([
    { type: 'room-created', at: 1_000, roomId, gameSpecId: CROSSROADS_CHESS_SPEC_ID },
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
  const roomId = 'dchess_golden-c';
  const timeControl = { initialMs: 60_000, incrementMs: 1_000 };
  const room = hydrate([
    {
      type: 'room-created',
      at: 1_000,
      roomId,
      gameSpecId: CROSSROADS_CHESS_SPEC_ID,
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

// ── Script D: PvE — FSF engine seated white at creation, human red. ─────────
function runScriptD(): GoldenScript {
  const script: GoldenScript = { id: 'pve-engine-white', steps: [] };
  const roomId = 'dchess_golden-d';
  const timeControl = { initialMs: 180_000, incrementMs: 2_000 };
  const room = hydrate([
    {
      type: 'room-created',
      at: 1_000,
      roomId,
      gameSpecId: CROSSROADS_CHESS_SPEC_ID,
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
    {
      type: 'seat-assigned',
      at: 1_500,
      roomId,
      clientId: CROSSROADS_CHESS_DEFAULT_ENGINE_ID,
      seat: 'white',
    },
  ]);
  recordStep(script, room, 'hydrated-engine-seated');

  append(script, room, 'seat-red-human', {
    type: 'seat-assigned',
    at: 2_000,
    roomId,
    clientId: 'client-red',
    seat: 'red',
  });

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
  return script;
}

// ── Script E: legacy 'dual-chess' spec alias hydrates and normalizes. ───────
function runScriptE(): GoldenScript {
  const script: GoldenScript = { id: 'legacy-dual-chess-spec', steps: [] };
  const roomId = 'dchess_golden-e';
  const room = hydrate([
    { type: 'room-created', at: 1_000, roomId, gameSpecId: DUAL_CHESS_SPEC_ID },
    { type: 'seat-assigned', at: 2_000, roomId, clientId: 'client-white', seat: 'white' },
    { type: 'seat-assigned', at: 3_000, roomId, clientId: 'client-red', seat: 'red' },
  ]);
  recordStep(script, room, 'hydrated');
  append(script, room, 'move-1-white', {
    type: 'move-played',
    at: 10_000,
    roomId,
    color: 'white',
    move: firstLegalMove(room),
  });
  return script;
}

function runAllScripts(): GoldenScript[] {
  return [runScriptA(), runScriptB(), runScriptC(), runScriptD(), runScriptE()];
}

// Round-trip through JSON so undefined-valued keys drop out exactly as they do
// on the wire.
function asWireJson(scripts: GoldenScript[]): unknown {
  return JSON.parse(JSON.stringify({ scripts }));
}

test('crossroads golden wire: per-seat payloads match the recorded fixture', () => {
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

// ── Perfect-info invariants, independent of the fixture ─────────────────────

type WireSnapshot = {
  events: Array<{ type: string; ply?: number }>;
  roomMode: string;
  pveEngineId?: string;
  forfeitDeadline: number | null;
  connectedSeats: Record<string, boolean>;
  state: Record<string, unknown>;
};

function wireSnapshots(step: GoldenStep): Record<string, WireSnapshot> {
  return JSON.parse(JSON.stringify(step.snapshots));
}

test('crossroads golden wire: every seat sees every event with plies on moves', () => {
  for (const script of runAllScripts()) {
    for (const step of script.steps) {
      const snapshots = wireSnapshots(step);
      const white = snapshots.white!;
      assert.deepStrictEqual(
        snapshots.red!.events,
        white.events,
        `${script.id}/${step.label}: red event stream diverged`,
      );
      assert.deepStrictEqual(
        snapshots.spectator!.events,
        white.events,
        `${script.id}/${step.label}: spectator event stream diverged`,
      );
      for (const event of white.events) {
        if (event.type === 'move-played') {
          assert.equal(typeof event.ply, 'number', `${script.id}/${step.label}: move missing ply`);
        }
      }
      if (step.eventForSeat) {
        const broadcast = JSON.parse(JSON.stringify(step.eventForSeat));
        assert.deepStrictEqual(broadcast.red, broadcast.white);
        assert.deepStrictEqual(broadcast.spectator, broadcast.white);
      }
    }
  }
});

test('crossroads golden wire: roomMode/pveEngineId follow the engine seat', () => {
  const pvp = runScriptA();
  for (const step of pvp.steps) {
    for (const seat of SEATS) {
      const snapshot = wireSnapshots(step)[seat]!;
      assert.equal(snapshot.roomMode, 'pvp');
      assert.ok(!('pveEngineId' in snapshot), 'pvp snapshot must not carry pveEngineId');
    }
  }
  const pve = runScriptD();
  for (const step of pve.steps) {
    for (const seat of SEATS) {
      const snapshot = wireSnapshots(step)[seat]!;
      assert.equal(snapshot.roomMode, 'pve');
      assert.equal(snapshot.pveEngineId, CROSSROADS_CHESS_DEFAULT_ENGINE_ID);
      assert.equal(snapshot.connectedSeats.white, true, 'engine seat must read as connected');
    }
  }
});

test('crossroads golden wire: forfeitDeadline only reaches the opposite seat', () => {
  const script = runScriptA();
  const open = script.steps.find((step) => step.label === 'forfeit-window-red');
  assert.ok(open);
  const snapshots = wireSnapshots(open);
  assert.equal(snapshots.white!.forfeitDeadline, 99_000);
  assert.equal(snapshots.red!.forfeitDeadline, null);
  assert.equal(snapshots.spectator!.forfeitDeadline, null);
});

test('crossroads golden wire: legacy dual-chess logs normalize to crossroads-chess', () => {
  const roomId = 'dchess_legacy';
  const created = createTenantRuntimeRoomFromEvents(crossroadsChessTenant, [
    { type: 'room-created', at: 1_000, roomId, gameSpecId: DUAL_CHESS_SPEC_ID },
  ]);
  assert.ok(created.ok, 'legacy dual-chess event log must hydrate');
  assert.equal(created.room.projection.gameSpecId, CROSSROADS_CHESS_SPEC_ID);
  assert.equal(created.room.gameSpecId, CROSSROADS_CHESS_SPEC_ID);
  const snapshot = snapshotFor(created.room, 'white');
  assert.equal(snapshot.gameSpecId, CROSSROADS_CHESS_SPEC_ID);
});
