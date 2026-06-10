import { randomBytes, randomUUID } from 'node:crypto';
import type { CrossroadsChessColor } from '@mistboard/game';
import type { CrossroadsChessSeatTokenState } from './crossroads-chess-runtime.js';
import type { UserAccount } from './persistence.js';
import { hashSeatToken } from './server-seat-session.js';

export type CrossroadsChessSeatClient = {
  displaced: boolean;
  seat: CrossroadsChessColor;
  socket: { close(code?: number, reason?: string): unknown };
};

export type CrossroadsChessSeatRoom<
  Client extends CrossroadsChessSeatClient = CrossroadsChessSeatClient,
> = {
  clients: Set<Client>;
  projection: {
    creatorPreference?: CrossroadsChessColor | 'random';
    seats: Partial<Record<CrossroadsChessColor, string>>;
  };
  seatTokens: Partial<Record<CrossroadsChessColor, CrossroadsChessSeatTokenState>>;
};

export type CrossroadsChessSeatAssignment =
  | {
      ok: true;
      seat: CrossroadsChessColor;
      seatToken?: string;
      seatTokenHash: string;
      tokenState: CrossroadsChessSeatTokenState;
      previousTokenState?: CrossroadsChessSeatTokenState;
    }
  | { ok: false; reason: 'private room' };

const SEATS = ['white', 'red'] as const;

export function assignCrossroadsChessSeat(
  room: CrossroadsChessSeatRoom,
  clientId: string,
  rawToken: string | undefined,
  accountUser: UserAccount | null,
): CrossroadsChessSeatAssignment {
  const tokenHash = rawToken ? hashSeatToken(rawToken) : undefined;
  if (tokenHash) {
    for (const color of SEATS) {
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
    for (const color of SEATS) {
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

  const occupiedSeats = new Set<CrossroadsChessColor>(
    [...room.clients].filter((client) => !client.displaced).map((client) => client.seat),
  );
  for (const color of SEATS) {
    if (room.projection.seats[color] || room.seatTokens[color]) occupiedSeats.add(color);
  }
  const seat = nextAvailableSeat(room.projection.creatorPreference, occupiedSeats);
  if (!seat) return { ok: false, reason: 'private room' };

  const seatToken = randomBytes(32).toString('base64url');
  const seatTokenHash = hashSeatToken(seatToken);
  const now = new Date();
  const tokenState: CrossroadsChessSeatTokenState = {
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

// Pre-issue a fresh seat token for a chosen seat (rematch finalize reserves the
// swapped-color seats on the new room before either player connects).
export function mintCrossroadsChessSeatToken(
  room: Pick<CrossroadsChessSeatRoom, 'seatTokens'>,
  seat: CrossroadsChessColor,
  identity: { userId: string | null; userHandle: string | null; userDisplayName: string | null },
): { rawToken: string; state: CrossroadsChessSeatTokenState } {
  const rawToken = randomBytes(32).toString('base64url');
  const now = new Date();
  const state: CrossroadsChessSeatTokenState = {
    clientId: randomUUID(),
    seat,
    tokenHash: hashSeatToken(rawToken),
    userId: identity.userId,
    userHandle: identity.userHandle,
    userDisplayName: identity.userDisplayName,
    issuedAt: now,
    lastSeenAt: now,
    revokedAt: null,
  };
  room.seatTokens[seat] = state;
  return { rawToken, state };
}

function nextAvailableSeat(
  creatorPreference: CrossroadsChessColor | 'random' | undefined,
  occupiedSeats: ReadonlySet<CrossroadsChessColor>,
): CrossroadsChessColor | null {
  if (creatorPreference === 'white' || creatorPreference === 'red') {
    if (!occupiedSeats.has(creatorPreference)) return creatorPreference;
  }
  if (creatorPreference === 'random' && occupiedSeats.size === 0) {
    return randomBytes(1)[0]! < 128 ? 'white' : 'red';
  }
  return !occupiedSeats.has('white') ? 'white' : !occupiedSeats.has('red') ? 'red' : null;
}

export function rollbackCrossroadsChessSeatAssignment(
  room: CrossroadsChessSeatRoom,
  assignment: Extract<CrossroadsChessSeatAssignment, { ok: true }>,
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

export function displaceOlderCrossroadsChessSeatClients<Client extends CrossroadsChessSeatClient>(
  room: CrossroadsChessSeatRoom<Client>,
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
