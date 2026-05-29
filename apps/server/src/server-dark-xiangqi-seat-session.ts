import { randomBytes } from 'node:crypto';
import type { XiangqiColor } from '@mistboard/game';
import type { DarkXiangqiSeatTokenState } from './dark-xiangqi-runtime.js';
import type { UserAccount } from './persistence.js';
import { hashSeatToken } from './server-seat-session.js';

export type DarkXiangqiSeatClient = {
  displaced: boolean;
  seat: XiangqiColor;
  socket: { close(code?: number, reason?: string): unknown };
};

export type DarkXiangqiSeatRoom<Client extends DarkXiangqiSeatClient = DarkXiangqiSeatClient> = {
  clients: Set<Client>;
  projection: { seats: Partial<Record<XiangqiColor, string>> };
  seatTokens: Partial<Record<XiangqiColor, DarkXiangqiSeatTokenState>>;
};

export type DarkXiangqiSeatAssignment =
  | {
      ok: true;
      seat: XiangqiColor;
      seatToken?: string;
      seatTokenHash: string;
      tokenState: DarkXiangqiSeatTokenState;
      previousTokenState?: DarkXiangqiSeatTokenState;
    }
  | { ok: false; reason: 'private room' };

export function assignDarkXiangqiSeat(
  room: DarkXiangqiSeatRoom,
  clientId: string,
  rawToken: string | undefined,
  accountUser: UserAccount | null,
): DarkXiangqiSeatAssignment {
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

  const occupiedSeats = new Set<XiangqiColor>(
    [...room.clients].filter((client) => !client.displaced).map((client) => client.seat),
  );
  for (const color of ['red', 'black'] as const) {
    if (room.projection.seats[color] || room.seatTokens[color]) occupiedSeats.add(color);
  }
  const seat: XiangqiColor | null = !occupiedSeats.has('red')
    ? 'red'
    : !occupiedSeats.has('black')
      ? 'black'
      : null;
  if (!seat) return { ok: false, reason: 'private room' };

  const seatToken = randomBytes(32).toString('base64url');
  const seatTokenHash = hashSeatToken(seatToken);
  const now = new Date();
  const tokenState: DarkXiangqiSeatTokenState = {
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

export function rollbackDarkXiangqiSeatAssignment(
  room: DarkXiangqiSeatRoom,
  assignment: Extract<DarkXiangqiSeatAssignment, { ok: true }>,
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

export function displaceOlderDarkXiangqiSeatClients<Client extends DarkXiangqiSeatClient>(
  room: DarkXiangqiSeatRoom<Client>,
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
