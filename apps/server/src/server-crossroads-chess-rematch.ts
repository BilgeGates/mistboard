import type { CrossroadsChessColor, RoomTimeControl } from '@mistboard/game';
import type {
  CrossroadsChessRuntimeRoom,
  CrossroadsChessSeatTokenState,
} from './crossroads-chess-runtime.js';
import type {
  CrossroadsChessLiveClient,
  CrossroadsChessLiveRoom,
} from './server-crossroads-chess-live-room.js';

export type CrossroadsChessRematchContext = {
  send: (client: CrossroadsChessLiveClient, payload: unknown) => void;
  createRoom: (
    timeControl: RoomTimeControl | undefined,
  ) => Promise<{ ok: true; room: CrossroadsChessRuntimeRoom } | { ok: false; error: string }>;
  issueSeatToken: (
    room: CrossroadsChessRuntimeRoom,
    seat: CrossroadsChessColor,
    identity: { userId: string | null; userHandle: string | null; userDisplayName: string | null },
  ) => Promise<{ rawToken: string; state: CrossroadsChessSeatTokenState }>;
  buildRoomUrl: (roomId: string) => string;
};

function activeSeatTokenForClient(
  room: CrossroadsChessLiveRoom,
  client: CrossroadsChessLiveClient,
): CrossroadsChessSeatTokenState | null {
  const token = room.seatTokens[client.seat];
  if (!token) return null;
  if (token.tokenHash !== client.seatTokenHash) return null;
  return token;
}

function isRematchAllowed(room: CrossroadsChessLiveRoom): boolean {
  if (room.projection.state.status.type !== 'finished') return false;
  if (room.rematch.finalizedRoomId) return false;
  return true;
}

export function broadcastCrossroadsChessRematchState(
  ctx: CrossroadsChessRematchContext,
  room: CrossroadsChessLiveRoom,
): void {
  const payload = {
    type: 'rematch:state' as const,
    offers: {
      white: room.rematch.offers.white !== undefined,
      red: room.rematch.offers.red !== undefined,
    },
    finalizedRoomId: room.rematch.finalizedRoomId ?? null,
  };
  for (const client of room.clients) {
    ctx.send(client, payload);
  }
}

export function offerCrossroadsChessRematch(
  ctx: CrossroadsChessRematchContext,
  room: CrossroadsChessLiveRoom,
  client: CrossroadsChessLiveClient,
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
  broadcastCrossroadsChessRematchState(ctx, room);
}

export function cancelCrossroadsChessRematch(
  ctx: CrossroadsChessRematchContext,
  room: CrossroadsChessLiveRoom,
  client: CrossroadsChessLiveClient,
): void {
  const token = activeSeatTokenForClient(room, client);
  if (!token) return;
  if (!room.rematch.offers[token.seat]) return;
  delete room.rematch.offers[token.seat];
  broadcastCrossroadsChessRematchState(ctx, room);
}

export function declineCrossroadsChessRematch(
  ctx: CrossroadsChessRematchContext,
  room: CrossroadsChessLiveRoom,
  client: CrossroadsChessLiveClient,
): void {
  const token = activeSeatTokenForClient(room, client);
  if (!token) return;
  if (!room.rematch.offers.white && !room.rematch.offers.red) return;
  room.rematch.offers = {};
  broadcastCrossroadsChessRematchState(ctx, room);
}

function identitiesMatch(
  originalToken: CrossroadsChessSeatTokenState,
  offer: { tokenHash: string; userId: string | null },
): boolean {
  if (originalToken.tokenHash !== offer.tokenHash) return false;
  if (originalToken.userId !== offer.userId) return false;
  return true;
}

export async function finalizeCrossroadsChessRematchIfReady(
  ctx: CrossroadsChessRematchContext,
  room: CrossroadsChessLiveRoom,
): Promise<CrossroadsChessRuntimeRoom | null> {
  if (!isRematchAllowed(room)) return null;
  const whiteOffer = room.rematch.offers.white;
  const redOffer = room.rematch.offers.red;
  if (!whiteOffer || !redOffer) return null;

  const whiteToken = room.seatTokens.white;
  const redToken = room.seatTokens.red;
  if (!whiteToken || !redToken) return null;

  if (!identitiesMatch(whiteToken, whiteOffer) || !identitiesMatch(redToken, redOffer)) {
    room.rematch.offers = {};
    broadcastCrossroadsChessRematchState(ctx, room);
    return null;
  }

  const created = await ctx.createRoom(room.projection.timeControl);
  if (!created.ok) return null;
  const newRoom = created.room;

  const newWhiteSeatToken = await ctx.issueSeatToken(newRoom, 'white', {
    userId: redToken.userId,
    userHandle: redToken.userHandle,
    userDisplayName: redToken.userDisplayName,
  });
  const newRedSeatToken = await ctx.issueSeatToken(newRoom, 'red', {
    userId: whiteToken.userId,
    userHandle: whiteToken.userHandle,
    userDisplayName: whiteToken.userDisplayName,
  });

  room.rematch.finalizedRoomId = newRoom.id;

  const url = ctx.buildRoomUrl(newRoom.id);
  room.rematch.pendingRedirects = {
    white: { roomId: newRoom.id, seat: 'red', rawToken: newRedSeatToken.rawToken, url },
    red: { roomId: newRoom.id, seat: 'white', rawToken: newWhiteSeatToken.rawToken, url },
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

  broadcastCrossroadsChessRematchState(ctx, room);
  return newRoom;
}

export function maybeReplayCrossroadsChessRematchRedirect(
  ctx: CrossroadsChessRematchContext,
  room: CrossroadsChessLiveRoom,
  client: CrossroadsChessLiveClient,
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
