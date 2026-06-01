// ── Dark Mini Xiangqi rematch ──────────────────────────────────────────────
//
// Sibling of the chess rematch orchestrator (rematch.ts) for the parallel Dark
// Mini Xiangqi runtime. Same mutual-confirm shape, but over red/black seats and
// the DMX room/runtime types: each seat can offer; when both seats have an
// active offer from the players who still hold the seat tokens, a new room is
// created with colors swapped (carrying the time control forward) and each side
// gets a pre-issued seat token + redirect URL.
//
// Identity rule: only the players whose seat tokens are still the active tokens
// for their color (tokenHash match) can offer or be finalized — enforced in
// activeSeatTokenForClient + identitiesMatch.

import type { MiniXiangqiColor, RoomTimeControl } from '@mistboard/game';
import type {
  DarkMiniXiangqiRuntimeRoom,
  DarkMiniXiangqiSeatTokenState,
} from './dark-mini-xiangqi-runtime.js';
import type {
  DarkMiniXiangqiLiveClient,
  DarkMiniXiangqiLiveRoom,
} from './server-ws-dark-mini-xiangqi.js';

export type DarkMiniXiangqiRematchContext = {
  send: (client: DarkMiniXiangqiLiveClient, payload: unknown) => void;
  createRoom: (
    timeControl: RoomTimeControl | undefined,
  ) => Promise<
    { ok: true; room: DarkMiniXiangqiRuntimeRoom } | { ok: false; error: string }
  >;
  issueSeatToken: (
    room: DarkMiniXiangqiRuntimeRoom,
    seat: MiniXiangqiColor,
    identity: { userId: string | null; userHandle: string | null; userDisplayName: string | null },
  ) => Promise<{ rawToken: string; state: DarkMiniXiangqiSeatTokenState }>;
  buildRoomUrl: (roomId: string) => string;
};

function activeSeatTokenForClient(
  room: DarkMiniXiangqiLiveRoom,
  client: DarkMiniXiangqiLiveClient,
): DarkMiniXiangqiSeatTokenState | null {
  const token = room.seatTokens[client.seat];
  if (!token) return null;
  if (token.tokenHash !== client.seatTokenHash) return null;
  return token;
}

// DMX rooms are PvP-only (no engine play yet), so the only gate is a real,
// not-yet-finalized finished game. Aborted games fall back to instant play-again.
function isRematchAllowed(room: DarkMiniXiangqiLiveRoom): boolean {
  if (room.projection.state.status.type !== 'finished') return false;
  if (room.rematch.finalizedRoomId) return false;
  return true;
}

export function broadcastDarkMiniXiangqiRematchState(
  ctx: DarkMiniXiangqiRematchContext,
  room: DarkMiniXiangqiLiveRoom,
): void {
  const payload = {
    type: 'rematch:state' as const,
    offers: {
      red: room.rematch.offers.red !== undefined,
      black: room.rematch.offers.black !== undefined,
    },
    finalizedRoomId: room.rematch.finalizedRoomId ?? null,
  };
  for (const client of room.clients) {
    ctx.send(client, payload);
  }
}

export function offerDarkMiniXiangqiRematch(
  ctx: DarkMiniXiangqiRematchContext,
  room: DarkMiniXiangqiLiveRoom,
  client: DarkMiniXiangqiLiveClient,
): void {
  if (!isRematchAllowed(room)) return;
  const token = activeSeatTokenForClient(room, client);
  if (!token) return;
  if (room.rematch.offers[token.seat]) return;
  room.rematch.offers[token.seat] = {
    tokenHash: token.tokenHash,
    userId: token.userId,
    at: Date.now(),
  };
  broadcastDarkMiniXiangqiRematchState(ctx, room);
}

export function cancelDarkMiniXiangqiRematch(
  ctx: DarkMiniXiangqiRematchContext,
  room: DarkMiniXiangqiLiveRoom,
  client: DarkMiniXiangqiLiveClient,
): void {
  const token = activeSeatTokenForClient(room, client);
  if (!token) return;
  if (!room.rematch.offers[token.seat]) return;
  delete room.rematch.offers[token.seat];
  broadcastDarkMiniXiangqiRematchState(ctx, room);
}

export function declineDarkMiniXiangqiRematch(
  ctx: DarkMiniXiangqiRematchContext,
  room: DarkMiniXiangqiLiveRoom,
  client: DarkMiniXiangqiLiveClient,
): void {
  const token = activeSeatTokenForClient(room, client);
  if (!token) return;
  // Decline clears both offers — the conversation is over.
  if (!room.rematch.offers.red && !room.rematch.offers.black) return;
  room.rematch.offers = {};
  broadcastDarkMiniXiangqiRematchState(ctx, room);
}

function identitiesMatch(
  originalToken: DarkMiniXiangqiSeatTokenState,
  offer: { tokenHash: string; userId: string | null },
): boolean {
  if (originalToken.tokenHash !== offer.tokenHash) return false;
  if (originalToken.userId !== offer.userId) return false;
  return true;
}

export async function finalizeDarkMiniXiangqiRematchIfReady(
  ctx: DarkMiniXiangqiRematchContext,
  room: DarkMiniXiangqiLiveRoom,
): Promise<DarkMiniXiangqiRuntimeRoom | null> {
  if (!isRematchAllowed(room)) return null;
  const redOffer = room.rematch.offers.red;
  const blackOffer = room.rematch.offers.black;
  if (!redOffer || !blackOffer) return null;

  const redToken = room.seatTokens.red;
  const blackToken = room.seatTokens.black;
  if (!redToken || !blackToken) return null;

  // Identity check: the offers must still come from the players holding the
  // active seat tokens (no rotation), and account-bound users must be unchanged.
  if (!identitiesMatch(redToken, redOffer) || !identitiesMatch(blackToken, blackOffer)) {
    room.rematch.offers = {};
    broadcastDarkMiniXiangqiRematchState(ctx, room);
    return null;
  }

  const created = await ctx.createRoom(room.projection.timeControl);
  if (!created.ok) return null;
  const newRoom = created.room;

  // Mint seat tokens with colors SWAPPED relative to the previous game: the old
  // red player takes black next, and vice versa.
  const newRedSeatToken = await ctx.issueSeatToken(newRoom, 'red', {
    userId: blackToken.userId,
    userHandle: blackToken.userHandle,
    userDisplayName: blackToken.userDisplayName,
  });
  const newBlackSeatToken = await ctx.issueSeatToken(newRoom, 'black', {
    userId: redToken.userId,
    userHandle: redToken.userHandle,
    userDisplayName: redToken.userDisplayName,
  });

  room.rematch.finalizedRoomId = newRoom.id;

  const url = ctx.buildRoomUrl(newRoom.id);
  // Keyed by OLD-room seat so a reconnecting player who missed the live
  // broadcast still lands in the new room with the right (swapped) seat.
  room.rematch.pendingRedirects = {
    red: { roomId: newRoom.id, seat: 'black', rawToken: newBlackSeatToken.rawToken, url },
    black: { roomId: newRoom.id, seat: 'red', rawToken: newRedSeatToken.rawToken, url },
  };

  for (const client of room.clients) {
    const previousToken = activeSeatTokenForClient(room, client);
    if (!previousToken) continue;
    const pending = room.rematch.pendingRedirects[previousToken.seat];
    if (!pending) continue;
    ctx.send(client, {
      type: 'rematch:redirect',
      url: pending.url,
      roomId: pending.roomId,
      seat: pending.seat,
      seatToken: pending.rawToken,
    });
  }

  broadcastDarkMiniXiangqiRematchState(ctx, room);
  return newRoom;
}

// Re-send a previously-finalized redirect to a single client on reconnect, so a
// player who was offline at finalize time still routes to the new room.
export function maybeReplayDarkMiniXiangqiRematchRedirect(
  ctx: DarkMiniXiangqiRematchContext,
  room: DarkMiniXiangqiLiveRoom,
  client: DarkMiniXiangqiLiveClient,
): void {
  const pending = room.rematch.pendingRedirects?.[client.seat];
  if (!pending) return;
  ctx.send(client, {
    type: 'rematch:redirect',
    url: pending.url,
    roomId: pending.roomId,
    seat: pending.seat,
    seatToken: pending.rawToken,
  });
}
