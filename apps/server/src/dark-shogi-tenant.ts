/**
 * Dark Shogi (9x9, hidden/dev-only) VariantTenant — a fog tenant on the generic
 * Layer-3 contract, built on the Dark Crossroads / Dark Xiangqi pattern.
 *
 * Shogi-specific policy that lives here: the fog player view already carries
 * hands (the viewer's OWN reserve only — the kernel redacts the opponent's, so
 * each side's hand is private under fog) and only pieces on visible squares, so
 * it is wire-safe as-is; per-seat move-played redaction; own-moves-only
 * lastMove; the spectator empty view; and the bare snapshot (no roomMode/rematch
 * extras). PvP-only, no PvE (no bot yet). Win = king-capture (no checkmate).
 *
 * Wire move encoding: the generic move message is chess-shaped
 * ({from, to, promotion}). Shogi rides it without widening the shared contract —
 * a DROP is `from: "*<role>"` (e.g. "*P"), and promotion is `promotion:
 * "promote"`. moveFromMessage decodes both into a real ShogiMove; the event log
 * stores the typed move, not the wire shape.
 */

import {
  type AbortReason,
  applyShogiMove,
  createInitialShogiState,
  DARK_SHOGI_SPEC_ID,
  getShogiPlayerView,
  isLegalShogiMove,
  isShogiDrop,
  opponentOf,
  type ShogiColor,
  type ShogiGameState,
  type ShogiHandRole,
  type ShogiMove,
  type ShogiPlayerView,
  type ShogiSquare,
} from '@mistboard/game';
import { darkShogiEnabled } from './feature-flags.js';
import type * as persistence from './persistence.js';
import type {
  TenantClientEvent,
  TenantRoomEvent,
  TenantSeat,
  TenantSnapshotClient,
  VariantTenant,
} from './variant-tenant/tenant.js';

export const DARK_SHOGI_ROOM_ID_PREFIX = 'dsg_';

type DarkShogiSpecId = typeof DARK_SHOGI_SPEC_ID;

// The fog view is already wire-safe: pieces appear only on visible squares and
// `hand` is the viewer's own reserve (the kernel redacts the opponent's).
export type DarkShogiWirePlayerView = ShogiPlayerView;

export type DarkShogiTenant = VariantTenant<
  'dark-shogi',
  ShogiColor,
  ShogiMove,
  ShogiGameState,
  DarkShogiWirePlayerView,
  DarkShogiSpecId
>;

const SHOGI_SQUARE_RE = /^[1-9][a-i]$/;
const SHOGI_HAND_ROLES: readonly ShogiHandRole[] = ['R', 'B', 'G', 'S', 'N', 'L', 'P'];

function isShogiSquare(value: unknown): value is ShogiSquare {
  return typeof value === 'string' && SHOGI_SQUARE_RE.test(value);
}

function isShogiHandRole(value: unknown): value is ShogiHandRole {
  return typeof value === 'string' && (SHOGI_HAND_ROLES as readonly string[]).includes(value);
}

function isShogiColor(value: unknown): value is ShogiColor {
  return value === 'black' || value === 'white';
}

function isShogiMove(value: unknown): value is ShogiMove {
  if (typeof value !== 'object' || value === null) return false;
  const move = value as Record<string, unknown>;
  if ('drop' in move) return isShogiHandRole(move.drop) && isShogiSquare(move.to);
  if (!isShogiSquare(move.from) || !isShogiSquare(move.to)) return false;
  return move.promote === undefined || typeof move.promote === 'boolean';
}

// Decode the chess-shaped wire message into a ShogiMove. A `*<role>` from is a
// drop; a `promote` promotion flags a promoting board move.
function shogiMoveFromMessage(message: {
  from?: string;
  to?: string;
  promotion?: string;
}): ShogiMove | null {
  if (!isShogiSquare(message.to)) return null;
  if (typeof message.from === 'string' && message.from.startsWith('*')) {
    const role = message.from.slice(1);
    if (!isShogiHandRole(role)) return null;
    return { drop: role, to: message.to };
  }
  if (!isShogiSquare(message.from)) return null;
  return { from: message.from, to: message.to, promote: message.promotion === 'promote' };
}

// Fog rule: only move-played is per-seat (own moves only); every other event
// flows to both seats and spectators. Pinned by the dark-shogi golden fixture.
export function darkShogiClientEventFor(
  event: TenantRoomEvent<ShogiColor, ShogiMove, DarkShogiSpecId>,
  seat: TenantSeat<ShogiColor>,
  ply: number,
): TenantClientEvent<ShogiColor, ShogiMove, DarkShogiSpecId> | null {
  if (event.type !== 'move-played') return event;
  if (seat === 'spectator' || event.color !== seat) return null;
  return { ...event, ply };
}

export function getDarkShogiClientView(
  state: ShogiGameState,
  client: TenantSnapshotClient<ShogiColor>,
  latestVisibleMoveColor?: ShogiColor,
): DarkShogiWirePlayerView {
  const perspective: ShogiColor = client.seat === 'white' ? 'white' : 'black';
  if (client.seat === 'spectator') return emptyDarkShogiView(state, perspective);
  const view = getShogiPlayerView(state, perspective);
  // Strip lastMove unless the latest move was the viewer's own (else the
  // opponent's from/to — possibly outside the viewer's vision — would leak).
  if (latestVisibleMoveColor !== client.seat) return { ...view, lastMove: undefined };
  return view;
}

function latestVisibleShogiMoveColor(
  events: readonly TenantRoomEvent<ShogiColor, ShogiMove, DarkShogiSpecId>[],
  client: TenantSnapshotClient<ShogiColor>,
): ShogiColor | undefined {
  if (client.seat === 'spectator') return undefined;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.type === 'move-played') return event.color === client.seat ? event.color : undefined;
  }
  return undefined;
}

function emptyDarkShogiView(
  state: ShogiGameState,
  perspective: ShogiColor,
): DarkShogiWirePlayerView {
  return {
    id: state.id,
    perspective,
    board: {},
    hand: {},
    visibleSquares: [],
    legalMoves: [],
    status: state.status,
    moveNumber: state.moveNumber,
    lastMove: undefined,
  };
}

function darkShogiResult(winner: ShogiColor | null): persistence.GameResult {
  if (winner === 'black') return 'black-wins';
  if (winner === 'white') return 'white-wins';
  return 'draw';
}

export const darkShogiTenant: DarkShogiTenant = {
  kind: 'dark-shogi',
  gameSpecId: DARK_SHOGI_SPEC_ID,
  roomIdPrefix: DARK_SHOGI_ROOM_ID_PREFIX,
  colors: ['black', 'white'],
  enabled: darkShogiEnabled,
  oppositeColor: opponentOf,
  rules: {
    createInitialState: createInitialShogiState,
    applyMove: applyShogiMove,
    isLegalMove: isLegalShogiMove,
    finish: (state, winner, reason) => ({
      ...state,
      status: { type: 'finished', winner, reason },
    }),
    abort: (state, reason: AbortReason) => ({
      ...state,
      status: { type: 'aborted', reason },
    }),
    isColor: isShogiColor,
    isMove: isShogiMove,
    moveFromMessage: shogiMoveFromMessage,
  },
  visibility: {
    clientEventFor: darkShogiClientEventFor,
    viewForClient: (state, client, events) =>
      getDarkShogiClientView(state, client, latestVisibleShogiMoveColor(events, client)),
  },
  wire: {
    acceptsSeatVacated: true,
    // The parachute bounce: drops are offered from the player's view (so the
    // offer list never leaks fogged occupancy), so a drop may land on a square
    // that is occupied in truth. Reject it and tell ONLY the mover (a probe).
    rejectionFor: (state, move, seat) => {
      if (seat === 'spectator') return null;
      if (!isShogiDrop(move)) return null;
      if (!state.board[move.to]) return null;
      return { type: 'drop-rejected', to: move.to, reason: 'occupied' };
    },
  },
  persistence: {
    resultForWinner: darkShogiResult,
    termination: (reason: string) => reason as persistence.GameTermination,
    logKindPrefix: 'dark_shogi',
    logLabel: 'Dark Shogi',
  },
};
