/**
 * Dark Crossroads Chess (6x8, hidden/dev-only) VariantTenant — the fog sibling
 * of the perfect-information Crossroads Chess tenant. Built on the generic
 * Layer-3 contract, mirroring the Dark Xiangqi fog policy (NOT the
 * crossroads-chess-tenant.ts perfect-info policy).
 *
 * Dark Crossroads policy that lives here: per-seat move-played redaction (you
 * only ever receive your OWN moves on the wire — the opponent's from/to never
 * leaves the server), the fog player view (shrouded silhouettes already carry
 * color-only, no piece identity — the rules-level view is wire-safe as-is,
 * unlike Dark Xiangqi which re-encodes), lastMove stripped to own-moves-only
 * (so the opponent's last destination is never highlighted), the spectator
 * empty view, and the bare snapshot core payload (no roomMode/rematch extras).
 * PvP-only, no PvE engine (Fairy-Stockfish is perfect-info and cannot play
 * fog crossroads), no rematch flow. Win conditions come straight from the dark
 * rules kernel: king-capture, the Race ("Try"), stalemate-as-loss, repetition,
 * and the no-progress clock.
 */

import {
  type AbortReason,
  applyCrossroadsChessMove,
  type CrossroadsChessColor,
  type CrossroadsChessGameState,
  type CrossroadsChessMove,
  type CrossroadsChessPlayerView,
  type CrossroadsChessSquare,
  createInitialCrossroadsChessState,
  DARK_CROSSROADS_CHESS_SPEC_ID,
  getCrossroadsChessLegalMoves,
  getCrossroadsChessPlayerView,
  oppositeCrossroadsChessColor,
} from '@mistboard/game';
import { darkCrossroadsChessEnabled } from './feature-flags.js';
import type * as persistence from './persistence.js';
import type {
  TenantClientEvent,
  TenantRoomEvent,
  TenantSeat,
  TenantSnapshotClient,
  VariantTenant,
} from './variant-tenant/tenant.js';

export const DARK_CROSSROADS_CHESS_ROOM_ID_PREFIX = 'ddchess_';

type DarkCrossroadsChessSpecId = typeof DARK_CROSSROADS_CHESS_SPEC_ID;

// The fog player view is already wire-safe: shrouded silhouettes carry only
// {color, shrouded:true}, never piece identity, so no extra redaction layer is
// needed (Dark Xiangqi's rules view kept full pieces and had to strip them).
export type DarkCrossroadsChessWirePlayerView = CrossroadsChessPlayerView;

export type DarkCrossroadsChessTenant = VariantTenant<
  'dark-crossroads-chess',
  CrossroadsChessColor,
  CrossroadsChessMove,
  CrossroadsChessGameState,
  DarkCrossroadsChessWirePlayerView,
  DarkCrossroadsChessSpecId
>;

export function isDarkCrossroadsChessSquare(value: unknown): value is CrossroadsChessSquare {
  return typeof value === 'string' && /^[a-f][1-8]$/.test(value);
}

function isCrossroadsChessColor(value: unknown): value is CrossroadsChessColor {
  return value === 'white' || value === 'red';
}

function isCrossroadsChessMove(value: unknown): value is CrossroadsChessMove {
  if (typeof value !== 'object' || value === null) return false;
  const move = value as Record<string, unknown>;
  if (!isDarkCrossroadsChessSquare(move.from) || !isDarkCrossroadsChessSquare(move.to)) {
    return false;
  }
  return move.promotion === undefined || move.promotion === 'queen';
}

// Resolve a from/to pair to the exact legal-move object to append. Promotion is
// queen-only, so from/to uniquely identify the move and the canonical object
// re-attaches `promotion` the client message never carried.
export function canonicalDarkCrossroadsChessMove(
  state: CrossroadsChessGameState,
  move: CrossroadsChessMove,
): CrossroadsChessMove | null {
  return (
    getCrossroadsChessLegalMoves(state).find(
      (legalMove) => legalMove.from === move.from && legalMove.to === move.to,
    ) ?? null
  );
}

// Fog rule: only move-played is per-seat (own moves only); every other event
// flows to both seats and spectators. Identical to the Dark Xiangqi policy —
// pinned by the dark-crossroads golden wire fixture.
export function darkCrossroadsChessClientEventFor(
  event: TenantRoomEvent<CrossroadsChessColor, CrossroadsChessMove, DarkCrossroadsChessSpecId>,
  seat: TenantSeat<CrossroadsChessColor>,
  ply: number,
): TenantClientEvent<CrossroadsChessColor, CrossroadsChessMove, DarkCrossroadsChessSpecId> | null {
  if (event.type !== 'move-played') return event;
  if (seat === 'spectator' || event.color !== seat) return null;
  return { ...event, ply };
}

export function getDarkCrossroadsChessClientView(
  state: CrossroadsChessGameState,
  client: TenantSnapshotClient<CrossroadsChessColor>,
  latestVisibleMoveColor?: CrossroadsChessColor,
): DarkCrossroadsChessWirePlayerView {
  const perspective: CrossroadsChessColor = client.seat === 'red' ? 'red' : 'white';
  if (client.seat === 'spectator') return emptyDarkCrossroadsChessView(state, perspective);
  const view = getCrossroadsChessPlayerView(state, perspective);
  // Strip lastMove unless the most recent move was the viewer's own; otherwise
  // the opponent's from/to (possibly outside the viewer's vision) would leak.
  if (latestVisibleMoveColor !== client.seat) return { ...view, lastMove: undefined };
  return view;
}

function latestVisibleCrossroadsChessMoveColor(
  events: readonly TenantRoomEvent<
    CrossroadsChessColor,
    CrossroadsChessMove,
    DarkCrossroadsChessSpecId
  >[],
  client: TenantSnapshotClient<CrossroadsChessColor>,
): CrossroadsChessColor | undefined {
  if (client.seat === 'spectator') return undefined;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.type === 'move-played') return event.color === client.seat ? event.color : undefined;
  }
  return undefined;
}

function emptyDarkCrossroadsChessView(
  state: CrossroadsChessGameState,
  perspective: CrossroadsChessColor,
): DarkCrossroadsChessWirePlayerView {
  return {
    id: state.id,
    perspective,
    board: {},
    visibleSquares: [],
    legalMoves: [],
    status: state.status,
    moveNumber: state.moveNumber,
    lastMove: undefined,
  };
}

function darkCrossroadsChessResult(winner: CrossroadsChessColor | null): persistence.GameResult {
  if (winner === 'white') return 'white-wins';
  if (winner === 'red') return 'red-wins';
  return 'draw';
}

export const darkCrossroadsChessTenant: DarkCrossroadsChessTenant = {
  kind: 'dark-crossroads-chess',
  gameSpecId: DARK_CROSSROADS_CHESS_SPEC_ID,
  roomIdPrefix: DARK_CROSSROADS_CHESS_ROOM_ID_PREFIX,
  colors: ['white', 'red'],
  enabled: darkCrossroadsChessEnabled,
  oppositeColor: oppositeCrossroadsChessColor,
  rules: {
    createInitialState: createInitialCrossroadsChessState,
    applyMove: applyCrossroadsChessMove,
    isLegalMove: (state, move) =>
      getCrossroadsChessLegalMoves(state).some(
        (legalMove) =>
          legalMove.from === move.from &&
          legalMove.to === move.to &&
          (legalMove.promotion ?? null) === (move.promotion ?? null),
      ),
    finish: (state, winner, reason) => ({
      ...state,
      status: { type: 'finished', winner, reason },
    }),
    abort: (state, reason: AbortReason) => ({
      ...state,
      status: { type: 'aborted', reason },
    }),
    isColor: isCrossroadsChessColor,
    isMove: isCrossroadsChessMove,
    moveFromMessage: (message) => {
      if (!isDarkCrossroadsChessSquare(message.from) || !isDarkCrossroadsChessSquare(message.to)) {
        return null;
      }
      return { from: message.from, to: message.to };
    },
    canonicalMove: canonicalDarkCrossroadsChessMove,
  },
  visibility: {
    clientEventFor: darkCrossroadsChessClientEventFor,
    viewForClient: (state, client, events) =>
      getDarkCrossroadsChessClientView(
        state,
        client,
        latestVisibleCrossroadsChessMoveColor(events, client),
      ),
  },
  wire: {
    acceptsSeatVacated: true,
  },
  persistence: {
    resultForWinner: darkCrossroadsChessResult,
    termination: (reason: string) => reason as persistence.GameTermination,
    logKindPrefix: 'dark_crossroads_chess',
    logLabel: 'Dark Crossroads Chess',
  },
};
