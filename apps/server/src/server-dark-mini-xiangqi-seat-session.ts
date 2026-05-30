import { randomBytes } from 'node:crypto';
import type { MiniXiangqiColor } from '@mistboard/game';
import type { DarkMiniXiangqiSeatTokenState } from './dark-mini-xiangqi-runtime.js';
import type { UserAccount } from './persistence.js';
import { hashSeatToken } from './server-seat-session.js';

export type DarkMiniXiangqiSeatClient = {
  displaced: boolean;
  seat: MiniXiangqiColor;
  socket: { close(code?: number, reason?: string): unknown };
};

export type DarkMiniXiangqiSeatRoom<
  Client extends DarkMiniXiangqiSeatClient = DarkMiniXiangqiSeatClient,
> = {
  clients: Set<Client>;
  projection: {
    creatorPreference?: MiniXiangqiColor | 'random';
    seats: Partial<Record<MiniXiangqiColor, string>>;
  };
  seatTokens: Partial<Record<MiniXiangqiColor, DarkMiniXiangqiSeatTokenState>>;
};

export type DarkMiniXiangqiSeatAssignment =
  | {
      ok: true;
      seat: MiniXiangqiColor;
      seatToken?: string;
      seatTokenHash: string;
      tokenState: DarkMiniXiangqiSeatTokenState;
      previousTokenState?: DarkMiniXiangqiSeatTokenState;
    }
  | { ok: false; reason: 'private room' };

export function assignDarkMiniXiangqiSeat(
  room: DarkMiniXiangqiSeatRoom,
  clientId: string,
  rawToken: string | undefined,
  accountUser: UserAccount | null,
): DarkMiniXiangqiSeatAssignment {
  const tokenHash = rawToken ? hashSeatToken(rawToken) : undefined;
  if (tokenHash) {
    for (const color of ['red', 'black'] as const) {
      const state = room.seatTokens[color];
      if (state && state.revokedAt === null && state.tokenHash === tokenHash) {
        if (state.userId !== null && state.userId !== accountUser?.id) {
          return { ok: false, reason: 'private room' };
        }
        const tokenState = { ...state, clientId, lastSeenAt: new Date() };
        room.seatTokens[color] = tokenState;
        return {
          ok: true,
          seat: color,
          seatTokenHash: tokenHash,
          tokenState,
          previousTokenState: state,
        };
      }
    }
  }

  if (accountUser) {
    for (const color of ['red', 'black'] as const) {
      const state = room.seatTokens[color];
      if (state && state.revokedAt === null && state.userId === accountUser.id) {
        const tokenState = { ...state, clientId, lastSeenAt: new Date() };
        room.seatTokens[color] = tokenState;
        return {
          ok: true,
          seat: color,
          seatTokenHash: state.tokenHash,
          tokenState,
          previousTokenState: state,
        };
      }
    }
  }

  const occupiedSeats = new Set<MiniXiangqiColor>(
    [...room.clients].filter((client) => !client.displaced).map((client) => client.seat),
  );
  for (const color of ['red', 'black'] as const) {
    if (room.projection.seats[color] || room.seatTokens[color]) occupiedSeats.add(color);
  }
  const seat = nextAvailableSeat(room.projection.creatorPreference, occupiedSeats);
  if (!seat) return { ok: false, reason: 'private room' };

  const seatToken = randomBytes(32).toString('base64url');
  const seatTokenHash = hashSeatToken(seatToken);
  const now = new Date();
  const tokenState: DarkMiniXiangqiSeatTokenState = {
    clientId,
    seat,
    tokenHash: seatTokenHash,
    userId: accountUser?.id ?? null,
    userHandle: accountUser?.handle ?? null,
    userDisplayName: accountUser?.displayName ?? null,
    issuedAt: now,
    lastSeenAt: now,
    revokedAt: null,
  };
  room.seatTokens[seat] = tokenState;
  return { ok: true, seat, seatToken, seatTokenHash, tokenState };
}

function nextAvailableSeat(
  creatorPreference: MiniXiangqiColor | 'random' | undefined,
  occupiedSeats: ReadonlySet<MiniXiangqiColor>,
): MiniXiangqiColor | null {
  if (creatorPreference === 'red' || creatorPreference === 'black') {
    if (!occupiedSeats.has(creatorPreference)) return creatorPreference;
  }
  if (creatorPreference === 'random' && occupiedSeats.size === 0) {
    return randomBytes(1)[0]! < 128 ? 'red' : 'black';
  }
  return !occupiedSeats.has('red') ? 'red' : !occupiedSeats.has('black') ? 'black' : null;
}

export function rollbackDarkMiniXiangqiSeatAssignment(
  room: DarkMiniXiangqiSeatRoom,
  assignment: Extract<DarkMiniXiangqiSeatAssignment, { ok: true }>,
): void {
  const current = room.seatTokens[assignment.seat];
  if (
    !current ||
    current.clientId !== assignment.tokenState.clientId ||
    current.tokenHash !== assignment.tokenState.tokenHash
  ) {
    return;
  }
  if (assignment.previousTokenState) {
    room.seatTokens[assignment.seat] = assignment.previousTokenState;
    return;
  }
  delete room.seatTokens[assignment.seat];
}

export function displaceOlderDarkMiniXiangqiSeatClients<Client extends DarkMiniXiangqiSeatClient>(
  room: DarkMiniXiangqiSeatRoom<Client>,
  newest: Client,
): void {
  for (const client of room.clients) {
    if (client === newest) continue;
    if (client.displaced) continue;
    if (client.seat !== newest.seat) continue;
    client.displaced = true;
    try {
      client.socket.close(4000, 'duplicate session');
    } catch {
      /* socket already closed */
    }
  }
}
