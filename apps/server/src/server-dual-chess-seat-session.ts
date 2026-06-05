import { randomBytes, randomUUID } from 'node:crypto';
import type { DualChessColor } from '@mistboard/game';
import type { DualChessSeatTokenState } from './dual-chess-runtime.js';
import type { UserAccount } from './persistence.js';
import { hashSeatToken } from './server-seat-session.js';

export type DualChessSeatClient = {
  displaced: boolean;
  seat: DualChessColor;
  socket: { close(code?: number, reason?: string): unknown };
};

export type DualChessSeatRoom<Client extends DualChessSeatClient = DualChessSeatClient> = {
  clients: Set<Client>;
  projection: {
    creatorPreference?: DualChessColor | 'random';
    seats: Partial<Record<DualChessColor, string>>;
  };
  seatTokens: Partial<Record<DualChessColor, DualChessSeatTokenState>>;
};

export type DualChessSeatAssignment =
  | {
      ok: true;
      seat: DualChessColor;
      seatToken?: string;
      seatTokenHash: string;
      tokenState: DualChessSeatTokenState;
      previousTokenState?: DualChessSeatTokenState;
    }
  | { ok: false; reason: 'private room' };

const SEATS = ['white', 'red'] as const;

export function assignDualChessSeat(
  room: DualChessSeatRoom,
  clientId: string,
  rawToken: string | undefined,
  accountUser: UserAccount | null,
): DualChessSeatAssignment {
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

  const occupiedSeats = new Set<DualChessColor>(
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
  const tokenState: DualChessSeatTokenState = {
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
export function mintDualChessSeatToken(
  room: Pick<DualChessSeatRoom, 'seatTokens'>,
  seat: DualChessColor,
  identity: { userId: string | null; userHandle: string | null; userDisplayName: string | null },
): { rawToken: string; state: DualChessSeatTokenState } {
  const rawToken = randomBytes(32).toString('base64url');
  const now = new Date();
  const state: DualChessSeatTokenState = {
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
  creatorPreference: DualChessColor | 'random' | undefined,
  occupiedSeats: ReadonlySet<DualChessColor>,
): DualChessColor | null {
  if (creatorPreference === 'white' || creatorPreference === 'red') {
    if (!occupiedSeats.has(creatorPreference)) return creatorPreference;
  }
  if (creatorPreference === 'random' && occupiedSeats.size === 0) {
    return randomBytes(1)[0]! < 128 ? 'white' : 'red';
  }
  return !occupiedSeats.has('white') ? 'white' : !occupiedSeats.has('red') ? 'red' : null;
}

export function rollbackDualChessSeatAssignment(
  room: DualChessSeatRoom,
  assignment: Extract<DualChessSeatAssignment, { ok: true }>,
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

export function displaceOlderDualChessSeatClients<Client extends DualChessSeatClient>(
  room: DualChessSeatRoom<Client>,
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
