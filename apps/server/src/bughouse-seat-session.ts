import { randomBytes, randomUUID } from 'node:crypto';
import {
  BUGHOUSE_SEAT_ASSIGNMENTS,
  type BughouseSeatId,
  clockPolicyKindFor,
} from '@mistboard/game';
import type { UserAccount } from './persistence.js';
import { hashSeatToken } from './server-seat-session.js';

export const BUGHOUSE_LIVE_SEAT_ORDER = [
  'A:white',
  'A:black',
  'B:white',
  'B:black',
] as const satisfies readonly BughouseSeatId[];

export type BughouseSeatTokenState = {
  clientId: string;
  seat: BughouseSeatId;
  tokenHash: string;
  userId: string | null;
  userHandle: string | null;
  userDisplayName: string | null;
  issuedAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
};

export type BughouseSeatClient = {
  displaced: boolean;
  seat: BughouseSeatId;
  socket: { close(code?: number, reason?: string): unknown };
};

export type BughouseSeatRoom<
  Client extends { displaced: boolean; seat: string } = BughouseSeatClient,
> = {
  clients: Iterable<Client>;
  seats: Partial<Record<BughouseSeatId, string>>;
  seatTokens: Partial<Record<BughouseSeatId, BughouseSeatTokenState>>;
  rated?: boolean;
  timeControl?: { daysPerMove?: number } | null;
};

export type BughouseSeatAssignment =
  | {
      ok: true;
      seat: BughouseSeatId;
      seatToken?: string;
      seatTokenHash: string;
      tokenState: BughouseSeatTokenState;
      previousTokenState?: BughouseSeatTokenState;
    }
  | {
      ok: false;
      reason: 'private room' | 'rated requires account' | 'correspondence requires account';
    };

export function assignBughouseSeat<Client extends { displaced: boolean; seat: string }>(
  room: BughouseSeatRoom<Client>,
  clientId: string,
  rawToken: string | undefined,
  accountUser: UserAccount | null,
): BughouseSeatAssignment {
  const tokenHash = rawToken ? hashSeatToken(rawToken) : undefined;
  if (tokenHash) {
    for (const seat of Object.keys(BUGHOUSE_SEAT_ASSIGNMENTS) as BughouseSeatId[]) {
      const state = room.seatTokens[seat];
      if (state && state.revokedAt === null && state.tokenHash === tokenHash) {
        if (state.userId !== null && state.userId !== accountUser?.id) {
          return { ok: false, reason: 'private room' };
        }
        const tokenState = { ...state, clientId, lastSeenAt: new Date() };
        room.seatTokens[seat] = tokenState;
        return {
          ok: true,
          seat,
          seatTokenHash: tokenHash,
          tokenState,
          previousTokenState: state,
        };
      }
    }
  }

  if (accountUser) {
    for (const seat of Object.keys(BUGHOUSE_SEAT_ASSIGNMENTS) as BughouseSeatId[]) {
      const state = room.seatTokens[seat];
      if (state && state.revokedAt === null && state.userId === accountUser.id) {
        const tokenState = { ...state, clientId, lastSeenAt: new Date() };
        room.seatTokens[seat] = tokenState;
        return {
          ok: true,
          seat,
          seatTokenHash: state.tokenHash,
          tokenState,
          previousTokenState: state,
        };
      }
    }
  }

  const occupiedSeats = new Set<string>(
    [...room.clients].filter((client) => !client.displaced).map((client) => client.seat),
  );
  for (const seat of BUGHOUSE_LIVE_SEAT_ORDER) {
    if (room.seats[seat] || room.seatTokens[seat]) occupiedSeats.add(seat);
  }
  const seat = BUGHOUSE_LIVE_SEAT_ORDER.find((candidate) => !occupiedSeats.has(candidate));
  if (!seat) return { ok: false, reason: 'private room' };
  if (room.rated && !accountUser) return { ok: false, reason: 'rated requires account' };
  if (!accountUser && clockPolicyKindFor(room.timeControl) === 'days-per-move') {
    return { ok: false, reason: 'correspondence requires account' };
  }

  const seatToken = randomBytes(32).toString('base64url');
  const tokenState = createBughouseSeatTokenState(
    seat,
    clientId,
    seatToken,
    accountUser
      ? {
          userId: accountUser.id,
          userHandle: accountUser.handle,
          userDisplayName: accountUser.displayName,
        }
      : null,
  );
  room.seatTokens[seat] = tokenState;
  return {
    ok: true,
    seat,
    seatToken,
    seatTokenHash: tokenState.tokenHash,
    tokenState,
  };
}

export function rollbackBughouseSeatAssignment(
  room: Pick<BughouseSeatRoom, 'seatTokens'>,
  assignment: Extract<BughouseSeatAssignment, { ok: true }>,
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

export function displaceOlderBughouseSeatClients<Client extends BughouseSeatClient>(
  room: { clients: Iterable<Client> },
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

export function mintBughouseSeatToken(
  room: Pick<BughouseSeatRoom, 'seatTokens'>,
  seat: BughouseSeatId,
  identity: { userId: string | null; userHandle: string | null; userDisplayName: string | null },
): { rawToken: string; state: BughouseSeatTokenState } {
  const rawToken = randomBytes(32).toString('base64url');
  const state = createBughouseSeatTokenState(seat, randomUUID(), rawToken, identity);
  room.seatTokens[seat] = state;
  return { rawToken, state };
}

function createBughouseSeatTokenState(
  seat: BughouseSeatId,
  clientId: string,
  rawToken: string,
  identity: {
    userId: string | null;
    userHandle: string | null;
    userDisplayName: string | null;
  } | null,
): BughouseSeatTokenState {
  const now = new Date();
  return {
    clientId,
    seat,
    tokenHash: hashSeatToken(rawToken),
    userId: identity?.userId ?? null,
    userHandle: identity?.userHandle ?? null,
    userDisplayName: identity?.userDisplayName ?? null,
    issuedAt: now,
    lastSeenAt: now,
    revokedAt: null,
  };
}
