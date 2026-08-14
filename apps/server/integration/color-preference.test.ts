// Color-preference coverage for POST /api/rooms.
//
// Verifies that `preferredColor` is honored end-to-end:
//   - PvE: human seat is the opposite of the engine seat picked at creation.
//   - PvP challenge (creator-then-invitee): first connection is assigned the
//     creator's preferred seat; the second arrival gets the other side.
//
// Random preference is sampled with bounded retries so "always white" regressions
// fail without making a single room creation deterministic.

import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { connectClient, startTestServer, type TestServer } from './harness.js';

let serverInstance: TestServer;
let httpBase: string;
let priorExtraEngines: string | undefined;

before(async () => {
  // The prod PvE default is now Misty (python-v2-v1.1), which needs Stockfish +
  // a python worker this hermetic test doesn't have. The PvE cases here only
  // care about seat assignment, so opt the builtin random engine in and request
  // it explicitly — a cheap, reservation-free stand-in.
  priorExtraEngines = process.env.MISTBOARD_EXTRA_PLAYABLE_ENGINES;
  process.env.MISTBOARD_EXTRA_PLAYABLE_ENGINES = 'builtin-random-legal';
  serverInstance = await startTestServer({ seatVacateGraceMs: 200 });
  httpBase = serverInstance.url.replace(/^ws/, 'http');
});

after(async () => {
  await serverInstance.close();
  if (priorExtraEngines === undefined) delete process.env.MISTBOARD_EXTRA_PLAYABLE_ENGINES;
  else process.env.MISTBOARD_EXTRA_PLAYABLE_ENGINES = priorExtraEngines;
});

async function createRoom(body: Record<string, unknown>): Promise<{ roomId: string }> {
  const response = await fetch(`${httpBase}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 201, `expected 201 from /api/rooms, got ${response.status}`);
  const data = (await response.json()) as { roomId: string };
  assert.ok(data.roomId, 'response should include roomId');
  return { roomId: data.roomId };
}

// ── PvE ─────────────────────────────────────────────────────────────────────

test('PvE preferredColor=white seats the human as white', async () => {
  const { roomId } = await createRoom({
    mode: 'pve',
    variant: 'dark-chess',
    engineId: 'builtin-random-legal',
    // Fog PvE is pinned to 5+5; the engine cannot honor 3+2 (#283).
    timeControl: { initialMs: 300_000, incrementMs: 5_000 },
    preferredColor: 'white',
  });
  const human = await connectClient({ url: serverInstance.url, room: roomId });
  assert.equal(human.seat, 'white');
});

test('PvE preferredColor=black seats the human as black', async () => {
  const { roomId } = await createRoom({
    mode: 'pve',
    variant: 'dark-chess',
    engineId: 'builtin-random-legal',
    // Fog PvE is pinned to 5+5; the engine cannot honor 3+2 (#283).
    timeControl: { initialMs: 300_000, incrementMs: 5_000 },
    preferredColor: 'black',
  });
  const human = await connectClient({ url: serverInstance.url, room: roomId });
  assert.equal(human.seat, 'black');
});

test('PvE preferredColor=random can seat the human as either color', async () => {
  const seenHumanSeats = new Set<string>();
  for (let attempt = 0; attempt < 24 && seenHumanSeats.size < 2; attempt += 1) {
    const { roomId } = await createRoom({
      mode: 'pve',
      variant: 'dark-chess',
      engineId: 'builtin-random-legal',
      // Fog PvE is pinned to 5+5; the engine cannot honor 3+2 (#283).
      timeControl: { initialMs: 300_000, incrementMs: 5_000 },
      preferredColor: 'random',
    });
    const room = serverInstance.rooms.get(roomId);
    assert.ok(room, 'created room should be present in the test server');
    const engineSeat =
      room.projection.seats.white === 'builtin-random-legal'
        ? 'white'
        : room.projection.seats.black === 'builtin-random-legal'
          ? 'black'
          : null;
    assert.ok(engineSeat, 'engine should be pre-seated in PvE rooms');
    seenHumanSeats.add(engineSeat === 'white' ? 'black' : 'white');
  }
  assert.deepEqual([...seenHumanSeats].sort(), ['black', 'white']);
});

// ── PvP challenge (creator + invitee on a shared room URL) ───────────────────

test('PvP preferredColor=white assigns creator white, invitee black', async () => {
  const { roomId } = await createRoom({
    mode: 'pvp',
    variant: 'dark-chess',
    preferredColor: 'white',
    rated: false,
  });
  const creator = await connectClient({ url: serverInstance.url, room: roomId });
  const invitee = await connectClient({ url: serverInstance.url, room: roomId });
  assert.equal(creator.seat, 'white');
  assert.equal(invitee.seat, 'black');
});

test('PvP preferredColor=black assigns creator black, invitee white', async () => {
  const { roomId } = await createRoom({
    mode: 'pvp',
    variant: 'dark-chess',
    preferredColor: 'black',
    rated: false,
  });
  const creator = await connectClient({ url: serverInstance.url, room: roomId });
  const invitee = await connectClient({ url: serverInstance.url, room: roomId });
  assert.equal(creator.seat, 'black');
  assert.equal(invitee.seat, 'white');
});

test('PvP preferredColor=random can seat the creator as either color', async () => {
  const seenCreatorSeats = new Set<string>();
  for (let attempt = 0; attempt < 24 && seenCreatorSeats.size < 2; attempt += 1) {
    const { roomId } = await createRoom({
      mode: 'pvp',
      variant: 'dark-chess',
      preferredColor: 'random',
      rated: false,
    });
    const creator = await connectClient({ url: serverInstance.url, room: roomId });
    assert.ok(creator.seat === 'white' || creator.seat === 'black');
    seenCreatorSeats.add(creator.seat);
    await creator.disconnect();
  }
  assert.deepEqual([...seenCreatorSeats].sort(), ['black', 'white']);
});

// ── Default behavior unchanged when preferredColor is omitted ────────────────

test('PvP without preferredColor falls back to first-come-first-served (creator=white)', async () => {
  const { roomId } = await createRoom({
    mode: 'pvp',
    variant: 'dark-chess',
    rated: false,
  });
  const creator = await connectClient({ url: serverInstance.url, room: roomId });
  const invitee = await connectClient({ url: serverInstance.url, room: roomId });
  assert.equal(creator.seat, 'white');
  assert.equal(invitee.seat, 'black');
});
