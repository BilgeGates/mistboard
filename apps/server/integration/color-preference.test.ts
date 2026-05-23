// Color-preference coverage for POST /api/rooms.
//
// Verifies that `preferredColor` is honored end-to-end:
//   - PvE: human seat is the opposite of the engine seat picked at creation.
//   - PvP challenge (creator-then-invitee): first connection is assigned the
//     creator's preferred seat; the second arrival gets the other side.
//
// Random preference is not asserted (it's a coinflip); the white/black cases
// are sufficient to lock the deterministic contract.

import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import {
  connectClient,
  startTestServer,
  type TestServer,
} from './harness.js';

let serverInstance: TestServer;
let httpBase: string;

before(async () => {
  serverInstance = await startTestServer({ seatVacateGraceMs: 200 });
  httpBase = serverInstance.url.replace(/^ws/, 'http');
});

after(async () => {
  await serverInstance.close();
});

async function createRoom(body: Record<string, unknown>): Promise<{ roomId: string }> {
  const response = await fetch(`${httpBase}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 201, `expected 201 from /api/rooms, got ${response.status}`);
  const data = await response.json() as { roomId: string };
  assert.ok(data.roomId, 'response should include roomId');
  return { roomId: data.roomId };
}

// ── PvE ─────────────────────────────────────────────────────────────────────

test('PvE preferredColor=white seats the human as white', async () => {
  const { roomId } = await createRoom({
    mode: 'pve',
    variant: 'fog-of-war',
    timeControl: { initialMs: 180_000, incrementMs: 2_000 },
    preferredColor: 'white',
  });
  const human = await connectClient({ url: serverInstance.url, room: roomId });
  assert.equal(human.seat, 'white');
});

test('PvE preferredColor=black seats the human as black', async () => {
  const { roomId } = await createRoom({
    mode: 'pve',
    variant: 'fog-of-war',
    timeControl: { initialMs: 180_000, incrementMs: 2_000 },
    preferredColor: 'black',
  });
  const human = await connectClient({ url: serverInstance.url, room: roomId });
  assert.equal(human.seat, 'black');
});

// ── PvP challenge (creator + invitee on a shared room URL) ───────────────────

test('PvP preferredColor=white assigns creator white, invitee black', async () => {
  const { roomId } = await createRoom({
    mode: 'pvp',
    variant: 'fog-of-war',
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
    variant: 'fog-of-war',
    preferredColor: 'black',
    rated: false,
  });
  const creator = await connectClient({ url: serverInstance.url, room: roomId });
  const invitee = await connectClient({ url: serverInstance.url, room: roomId });
  assert.equal(creator.seat, 'black');
  assert.equal(invitee.seat, 'white');
});

// ── Default behavior unchanged when preferredColor is omitted ────────────────

test('PvP without preferredColor falls back to first-come-first-served (creator=white)', async () => {
  const { roomId } = await createRoom({
    mode: 'pvp',
    variant: 'fog-of-war',
    rated: false,
  });
  const creator = await connectClient({ url: serverInstance.url, room: roomId });
  const invitee = await connectClient({ url: serverInstance.url, room: roomId });
  assert.equal(creator.seat, 'white');
  assert.equal(invitee.seat, 'black');
});
