import type { Color } from '@mistboard/game';
import type { Seat } from './payloads.js';
import type { SeatTokenState } from './server-types.js';

// Pure seat-authorization decisions. Kept side-effect-free so the security
// rules can be unit-tested without spinning a server. See the identity-bound
// seats design: anonymous seats are owned by a bearer token; logged-in seats
// are bound to an account `userId` and a leaked token alone can never take or
// displace them.

export type SeatAuthDecision =
  | { kind: 'grant'; seat: Color; tokenHash: string }
  | { kind: 'deny' }
  | { kind: 'fallthrough' };

// Authorize a claim on an EXISTING seat by credential. Two ways in:
//   1. A valid seat token. For an account-bound seat (`userId !== null`) the
//      connecting session must be that same user — a leaked token alone is
//      denied. Anonymous (token-bound, `userId === null`) seats are token-only.
//   2. Account identity, with no token at all: a logged-in user reclaims their
//      own account-bound seat from any device (new device, cleared storage,
//      re-login after logout).
// Returns `fallthrough` when no credential matches an existing seat, so the
// caller proceeds to its clientId-match / new-seat-assignment paths unchanged.
export function authorizeExistingSeat(
  seatTokens: Partial<Record<Color, SeatTokenState>>,
  tokenSeat: SeatTokenState | null,
  accountUserId: string | null,
): SeatAuthDecision {
  if (tokenSeat) {
    if (tokenSeat.userId !== null && tokenSeat.userId !== accountUserId) {
      return { kind: 'deny' };
    }
    return { kind: 'grant', seat: tokenSeat.seat, tokenHash: tokenSeat.tokenHash };
  }
  if (accountUserId !== null) {
    for (const seat of ['white', 'black'] as const) {
      const state = seatTokens[seat];
      if (state && state.userId === accountUserId) {
        return { kind: 'grant', seat, tokenHash: state.tokenHash };
      }
    }
  }
  return { kind: 'fallthrough' };
}

// Do two live connections represent the same authority over a seat, such that
// the newer one displaces the older? Account identity wins first (same user
// across devices/tokens — e.g. token on the laptop, identity-reclaim on the
// phone), then the bearer token hash (anonymous single-session), then the
// server-engine client id. `userId` must be non-null on both to match by
// identity, so two anonymous clients never collide on a null userId.
export function seatsShareAuthority(
  left: { seat: Seat; userId?: string | null; seatTokenHash?: string; id: string },
  right: { seat: Seat; userId?: string | null; seatTokenHash?: string; id: string },
  isServerEngineClient: (id: string) => boolean,
): boolean {
  if (left.seat !== right.seat) return false;
  if (left.seat === 'spectator') return false;
  if (left.userId && right.userId && left.userId === right.userId) return true;
  if (left.seatTokenHash && right.seatTokenHash) return left.seatTokenHash === right.seatTokenHash;
  return isServerEngineClient(left.id) && left.id === right.id;
}
