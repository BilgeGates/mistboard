import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import {
  connectClient,
  sleep,
  startTestServer,
  type TestClient,
  type TestServer,
  uniqueRoomId,
  waitUntil,
} from './harness.js';

// ── Shared server (single port for the file; rooms map is shared but every
//    test uses a unique room id, so there's no cross-test interference). ──────

let serverInstance: TestServer;

before(async () => {
  // Aggressively short grace so the pregame-vacate test stays under 1s.
  serverInstance = await startTestServer({ seatVacateGraceMs: 200 });
});

after(async () => {
  await serverInstance.close();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function pairPvpPlayers(roomId: string): Promise<{ white: TestClient; black: TestClient }> {
  const a = await connectClient({ url: serverInstance.url, room: roomId });
  const b = await connectClient({ url: serverInstance.url, room: roomId });
  // Wait for both to see the other seated so subsequent moves are accepted.
  const aSeesPair = a.waitFor((m) => {
    if (m.type !== 'snapshot' && m.type !== 'hello') return false;
    const seats = (m as { seats?: { white?: string; black?: string } }).seats;
    return !!seats && !!seats.white && !!seats.black;
  });
  const bSeesPair = b.waitFor((m) => {
    if (m.type !== 'snapshot' && m.type !== 'hello') return false;
    const seats = (m as { seats?: { white?: string; black?: string } }).seats;
    return !!seats && !!seats.white && !!seats.black;
  });
  await Promise.all([aSeesPair, bSeesPair]);

  const white = a.seat === 'white' ? a : b;
  const black = a.seat === 'black' ? a : b;
  assert.equal(white.seat, 'white', 'first connection should be seated white');
  assert.equal(black.seat, 'black', 'second connection should be seated black');
  return { white, black };
}

function moveNumberOf(msg: unknown): number {
  return (msg as { state?: { moveNumber?: number } }).state?.moveNumber ?? 0;
}

// Resign is only legal once both players have completed their first move
// (moveNumber >= 2); before that, leaving is an abort (no result), not a
// resignation (server-enforced at index.ts — moveNumber < 2 makes resign a
// no-op). Play e4/e5 and wait until both clients observe move 2, so a
// subsequent resign is accepted.
async function playBothFirstMoves(white: TestClient, black: TestClient): Promise<void> {
  white.send({ type: 'move', from: 'e2', to: 'e4' });
  await black.waitFor((m) => {
    const s = (m as { state?: { status?: { type: string; turn?: string } } }).state?.status;
    return s?.type === 'playing' && s.turn === 'black';
  });
  black.send({ type: 'move', from: 'e7', to: 'e5' });
  await Promise.all([
    white.waitFor((m) => moveNumberOf(m) >= 2),
    black.waitFor((m) => moveNumberOf(m) >= 2),
  ]);
}

function finishedStatus(msg: unknown): { winner: 'white' | 'black' | null; reason: string } | null {
  const m = msg as {
    state?: { status?: { type: string; winner?: 'white' | 'black' | null; reason?: string } };
  };
  if (m.state?.status?.type !== 'finished') return null;
  return { winner: m.state.status.winner ?? null, reason: m.state.status.reason ?? '' };
}

// ── 1. Happy-path PvP game-end via resign ────────────────────────────────────

test('ping echoes the client timestamp so RTT is clock-skew safe', async () => {
  const roomId = uniqueRoomId('ping');
  const client = await connectClient({ url: serverInstance.url, room: roomId });
  const at = Date.now() - 123;

  client.send({ type: 'ping', at });
  const pong = await client.expectMessage<{ type: string; at: number; serverAt: number }>('pong');

  assert.equal(pong.at, at);
  assert.equal(typeof pong.serverAt, 'number');
  await client.disconnect();
});

test('PvP resign ends the game with opposite color winning, both clients see it', async () => {
  const roomId = uniqueRoomId('resign');
  const { white, black } = await pairPvpPlayers(roomId);

  // Resign is only valid from move 2 on (before that it'd be an abort), so both
  // sides play their first move before white resigns.
  await playBothFirstMoves(white, black);

  white.send({ type: 'resign' });
  const whiteFinal = await white.waitFor((m) => finishedStatus(m) !== null);
  const blackFinal = await black.waitFor((m) => finishedStatus(m) !== null);

  const wf = finishedStatus(whiteFinal)!;
  const bf = finishedStatus(blackFinal)!;
  assert.equal(wf.winner, 'black');
  assert.equal(wf.reason, 'resignation');
  assert.equal(bf.winner, 'black');
  assert.equal(bf.reason, 'resignation');
});

// ── 2. Rematch round-trip with color swap ─────────────────────────────────────

test('Mutual rematch creates a new room with colors swapped and per-client seat tokens', async () => {
  const roomId = uniqueRoomId('rematch');
  const { white, black } = await pairPvpPlayers(roomId);

  await playBothFirstMoves(white, black);
  white.send({ type: 'resign' });
  await Promise.all([
    white.waitFor((m) => finishedStatus(m) !== null),
    black.waitFor((m) => finishedStatus(m) !== null),
  ]);

  // Both offer rematch.
  white.send({ type: 'rematch:offer' });
  black.send({ type: 'rematch:offer' });

  const whiteRedirect = await white.expectMessage<{
    type: string;
    roomId: string;
    seat: 'white' | 'black';
    seatToken: string;
    url: string;
  }>('rematch:redirect');
  const blackRedirect = await black.expectMessage<{
    type: string;
    roomId: string;
    seat: 'white' | 'black';
    seatToken: string;
    url: string;
  }>('rematch:redirect');

  assert.equal(
    whiteRedirect.roomId,
    blackRedirect.roomId,
    'both redirects target the same new room',
  );
  assert.notEqual(whiteRedirect.roomId, roomId, 'redirect targets a new room id');
  assert.equal(whiteRedirect.seat, 'black', 'white seat should flip to black in the rematch');
  assert.equal(blackRedirect.seat, 'white', 'black seat should flip to white in the rematch');
  assert.notEqual(whiteRedirect.seatToken, blackRedirect.seatToken, 'seat tokens must differ');

  // Now connect into the new room with those tokens — assert seats stick.
  const newRoomId = whiteRedirect.roomId;
  const reseatedWhite = await connectClient({
    url: serverInstance.url,
    room: newRoomId,
    seatToken: blackRedirect.seatToken, // old-black's flipped → white in new
  });
  const reseatedBlack = await connectClient({
    url: serverInstance.url,
    room: newRoomId,
    seatToken: whiteRedirect.seatToken, // old-white's flipped → black in new
  });
  assert.equal(reseatedWhite.seat, 'white', 'old black player should sit white in new room');
  assert.equal(reseatedBlack.seat, 'black', 'old white player should sit black in new room');

  await reseatedWhite.disconnect();
  await reseatedBlack.disconnect();
  await white.disconnect();
  await black.disconnect();
});

// ── 3. Rematch redirect replay on reconnect ───────────────────────────────────

test('Player offline at finalize gets the rematch redirect on reconnect', async () => {
  const roomId = uniqueRoomId('rematch-replay');
  const { white, black } = await pairPvpPlayers(roomId);
  const whiteToken = white.seatToken!;
  const blackToken = black.seatToken!;
  assert.ok(whiteToken && blackToken, 'both seats should have been issued tokens');

  await playBothFirstMoves(white, black);
  white.send({ type: 'resign' });
  await Promise.all([
    white.waitFor((m) => finishedStatus(m) !== null),
    black.waitFor((m) => finishedStatus(m) !== null),
  ]);

  // White offers, then disconnects. Black offers — finalize happens while
  // white is offline. White reconnects and should receive the stashed redirect.
  white.send({ type: 'rematch:offer' });
  await black.expectMessage('rematch:state');
  await white.disconnect();

  black.send({ type: 'rematch:offer' });
  const blackRedirect = await black.expectMessage<{ roomId: string }>('rematch:redirect');

  // White reconnects to the OLD room. Server should replay the redirect via
  // maybeReplayRematchRedirect.
  const whiteReturn = await connectClient({
    url: serverInstance.url,
    room: roomId,
    seatToken: whiteToken,
  });
  const replay = await whiteReturn.expectMessage<{ roomId: string; seat: 'white' | 'black' }>(
    'rematch:redirect',
    { timeoutMs: 2_000 },
  );
  assert.equal(replay.roomId, blackRedirect.roomId, 'replay should point at the same new room');
  assert.equal(replay.seat, 'black', 'old white player flips to black on rematch');

  await whiteReturn.disconnect();
  await black.disconnect();
});

// ── 4. Pre-first-move 20s grace window ────────────────────────────────────────

test('Pregame disconnect within grace window does NOT vacate the seat', async () => {
  const roomId = uniqueRoomId('grace-keep');
  const a = await connectClient({ url: serverInstance.url, room: roomId });
  assert.equal(a.seat, 'white');
  const seatToken = a.seatToken!;
  await a.disconnect();
  // Reconnect within the grace window (200ms in this file).
  await sleep(50);
  const reconnected = await connectClient({ url: serverInstance.url, room: roomId, seatToken });
  assert.equal(
    reconnected.seat,
    'white',
    'seat should be retained when reconnect beats the grace timer',
  );

  // Confirm event log shows no seat-vacated.
  const room = serverInstance.rooms.get(roomId);
  assert.ok(room, 'room should still be in memory');
  const vacated = room!.events.filter((e) => e.type === 'seat-vacated');
  assert.equal(vacated.length, 0, 'seat-vacated event should not have been appended');

  await reconnected.disconnect();
});

test('Pregame disconnect that misses the grace window DOES vacate', async () => {
  const roomId = uniqueRoomId('grace-vacate');
  const a = await connectClient({ url: serverInstance.url, room: roomId });
  await a.disconnect();
  // Wait long enough that the 200ms grace fires.
  await sleep(400);
  const room = serverInstance.rooms.get(roomId);
  assert.ok(room);
  const vacated = room!.events.filter((e) => e.type === 'seat-vacated');
  assert.equal(vacated.length, 1, 'seat-vacated should fire once the grace window elapses');
});

// ── 5. Presence dot signal: connectedSeats reflects live membership ──────────

test('connectedSeats flips false when a seated peer disconnects', async () => {
  const roomId = uniqueRoomId('presence');
  const { white, black } = await pairPvpPlayers(roomId);

  // Pair establishment already produced snapshots; sanity-check the latest.
  const latestForWhite = [...white.messages]
    .reverse()
    .find((m) => (m as { type: string }).type === 'snapshot') as
    | { connectedSeats?: { white: boolean; black: boolean } }
    | undefined;
  assert.deepEqual(latestForWhite?.connectedSeats, { white: true, black: true });

  await black.disconnect();
  const afterPeerLeft = await white.waitFor((m) => {
    if (m.type !== 'snapshot') return false;
    const seats = (m as { connectedSeats?: { white: boolean; black: boolean } }).connectedSeats;
    return !!seats && seats.white === true && seats.black === false;
  });
  assert.ok(afterPeerLeft);

  await white.disconnect();
});

// ── 6. Seat-token re-seat on reconnect (no new seat-assigned event) ──────────

test('Reconnecting with a valid seat token re-seats without minting a new token', async () => {
  const roomId = uniqueRoomId('reseat');
  const a = await connectClient({ url: serverInstance.url, room: roomId });
  const token = a.seatToken!;
  assert.equal(a.seat, 'white');

  const room = serverInstance.rooms.get(roomId)!;
  const seatAssignedBefore = room.events.filter((e) => e.type === 'seat-assigned').length;

  await a.disconnect();
  const back = await connectClient({ url: serverInstance.url, room: roomId, seatToken: token });
  assert.equal(back.seat, 'white', 'token should resolve back to white');

  const seatAssignedAfter = room.events.filter((e) => e.type === 'seat-assigned').length;
  assert.equal(
    seatAssignedAfter,
    seatAssignedBefore,
    'no new seat-assigned event on token-based reseat',
  );

  await back.disconnect();
});

// ── 7. Rematch finalize once both peers offered while one was offline first ─

test('Rematch only finalizes when BOTH have offered (one-sided offer is pending)', async () => {
  const roomId = uniqueRoomId('rematch-pending');
  const { white, black } = await pairPvpPlayers(roomId);

  await playBothFirstMoves(white, black);
  white.send({ type: 'resign' });
  await Promise.all([
    white.waitFor((m) => finishedStatus(m) !== null),
    black.waitFor((m) => finishedStatus(m) !== null),
  ]);

  white.send({ type: 'rematch:offer' });
  const offered = await black.waitFor<{ type: string; offers: { white: boolean; black: boolean } }>(
    (m) =>
      m.type === 'rematch:state' &&
      (m as unknown as { offers: { white: boolean } }).offers.white === true,
  );
  assert.equal(offered.offers.white, true);
  assert.equal(offered.offers.black, false);

  // White cancels without black ever offering. Match on the post-cancel state.
  white.send({ type: 'rematch:cancel' });
  const cancelled = await black.waitFor<{
    type: string;
    offers: { white: boolean; black: boolean };
  }>(
    (m) =>
      m.type === 'rematch:state' &&
      (m as unknown as { offers: { white: boolean } }).offers.white === false,
  );
  assert.equal(cancelled.offers.white, false);

  await white.disconnect();
  await black.disconnect();
});

// ── 8. Move broadcasts produce snapshots for both seats ───────────────────────

test('A move appends a move-played event and broadcasts to both seats', async () => {
  // Asserts on the canonical server-side event log AND on each client's
  // visible snapshot. Note: in live fog-of-war PvP, opponent move-played
  // events are intentionally redacted from the snapshot stream, so we wait
  // for the *server* event log to reach the expected count, then confirm
  // each client received a fresh snapshot (any snapshot after the move).
  const roomId = uniqueRoomId('move');
  const { white, black } = await pairPvpPlayers(roomId);
  const room = serverInstance.rooms.get(roomId)!;
  const baselineEventCount = room.events.length;
  const whiteBaselineMsgs = white.messages.length;
  const blackBaselineMsgs = black.messages.length;

  white.send({ type: 'move', from: 'e2', to: 'e4' });

  // Poll the server event log — the move append is the source of truth.
  await waitUntil(() => room.events.length > baselineEventCount, 2_000);
  const played = room.events.filter((e) => e.type === 'move-played');
  assert.equal(played.length, 1, 'exactly one move-played event recorded');
  assert.equal((played[0] as { color: string }).color, 'white');

  // Both clients received a fresh snapshot triggered by the move broadcast.
  await waitUntil(() => white.messages.length > whiteBaselineMsgs, 1_000);
  await waitUntil(() => black.messages.length > blackBaselineMsgs, 1_000);

  // Fog redaction is on for live PvP — verify black's snapshot does NOT
  // include white's move-played event (this is the contract; ensures we
  // don't accidentally regress it via the integration surface).
  const blackSnapshots = black.messages.filter((m) => (m as { type: string }).type === 'snapshot');
  const latest = blackSnapshots[blackSnapshots.length - 1] as {
    events: { type: string; color?: string }[];
  };
  const visibleMovesForBlack = latest.events.filter((e) => e.type === 'move-played');
  assert.equal(
    visibleMovesForBlack.length,
    0,
    'live fog-of-war should redact opponent move-played events',
  );

  await white.disconnect();
  await black.disconnect();
});
