/**
 * Crossroads Chess VariantTenant — the first PERFECT-INFORMATION migration of
 * the Layer-3 tenant contract (the fog tenants DMX and Dark Xiangqi came
 * first).
 *
 * Crossroads policy that lives here: pass-through event visibility (every
 * seat, spectators included, sees every event; moves gain their ply), the
 * full-board open view for all seats, state-dependent move canonicalization
 * (the appended move is the legal-move object itself, so queen promotion
 * rides along), the legacy 'dual-chess' gameSpecId alias accepted in
 * persisted logs, and the roomMode/pveEngineId/forfeitDeadline/rematch
 * snapshot extras. The in-process Fairy-Stockfish engine has no seat
 * reservation system, so factory engine seats omit reservationId.
 */

import {
  type AbortReason,
  applyCrossroadsChessOpenMove,
  CROSSROADS_CHESS_SPEC_ID,
  type CrossroadsChessColor,
  type CrossroadsChessGameState,
  type CrossroadsChessMove,
  type CrossroadsChessPlayerView,
  createInitialCrossroadsChessState,
  DUAL_CHESS_SPEC_ID,
  getCrossroadsChessOpenLegalMoves,
  getCrossroadsChessOpenView,
  oppositeCrossroadsChessColor,
} from '@mistboard/game';
import {
  crossroadsChessEngineDisplayName,
  crossroadsChessEngineVersion,
  isCrossroadsChessEngineClientId,
} from './crossroads-chess-engine.js';
import { crossroadsChessEnabled } from './feature-flags.js';
import type * as persistence from './persistence.js';
import {
  tenantForfeitDeadlineForClient,
  tenantPveEngineId,
  tenantRematchOfferFlags,
} from './variant-tenant/runtime.js';
import type {
  TenantClientEvent,
  TenantRoomEvent,
  TenantSeat,
  TenantSnapshotClient,
  VariantTenant,
} from './variant-tenant/tenant.js';

export const CROSSROADS_CHESS_ROOM_ID_PREFIX = 'dchess_';

// Persisted room-created events may carry the pre-rename 'dual-chess' alias;
// projections and new rooms always normalize to the canonical id.
export type CrossroadsChessSpecId = typeof CROSSROADS_CHESS_SPEC_ID | typeof DUAL_CHESS_SPEC_ID;

export type CrossroadsChessTenant = VariantTenant<
  'crossroads-chess',
  CrossroadsChessColor,
  CrossroadsChessMove,
  CrossroadsChessGameState,
  CrossroadsChessPlayerView,
  CrossroadsChessSpecId
>;

export function isCrossroadsChessSquare(value: unknown): value is CrossroadsChessMove['from'] {
  return typeof value === 'string' && /^[a-f][1-8]$/.test(value);
}

function isCrossroadsChessColor(value: unknown): value is CrossroadsChessColor {
  return value === 'white' || value === 'red';
}

function isCrossroadsChessMove(value: unknown): value is CrossroadsChessMove {
  if (typeof value !== 'object' || value === null) return false;
  const move = value as Record<string, unknown>;
  if (!isCrossroadsChessSquare(move.from) || !isCrossroadsChessSquare(move.to)) return false;
  return move.promotion === undefined || move.promotion === 'queen';
}

// Resolve a from/to pair to the exact legal-move object to append. Promotion
// is queen-only, so from/to uniquely identify the move and the canonical
// object re-attaches `promotion` the client message never carried.
export function canonicalCrossroadsChessMove(
  state: CrossroadsChessGameState,
  move: CrossroadsChessMove,
): CrossroadsChessMove | null {
  return (
    getCrossroadsChessOpenLegalMoves(state).find(
      (legalMove) => legalMove.from === move.from && legalMove.to === move.to,
    ) ?? null
  );
}

// Perfect-information: every event reaches every seat (spectators included);
// move events gain their ply for the move list.
export function crossroadsChessClientEventFor(
  event: TenantRoomEvent<CrossroadsChessColor, CrossroadsChessMove, CrossroadsChessSpecId>,
  _seat: TenantSeat<CrossroadsChessColor>,
  ply: number,
): TenantClientEvent<CrossroadsChessColor, CrossroadsChessMove, CrossroadsChessSpecId> {
  if (event.type !== 'move-played') return event;
  return { ...event, ply };
}

export function getCrossroadsChessClientView(
  state: CrossroadsChessGameState,
  seat: TenantSeat<CrossroadsChessColor>,
): CrossroadsChessPlayerView {
  const perspective: CrossroadsChessColor = seat === 'red' ? 'red' : 'white';
  return getCrossroadsChessOpenView(state, perspective);
}

export const crossroadsChessTenant: CrossroadsChessTenant = {
  kind: 'crossroads-chess',
  gameSpecId: CROSSROADS_CHESS_SPEC_ID,
  roomIdPrefix: CROSSROADS_CHESS_ROOM_ID_PREFIX,
  colors: ['white', 'red'],
  enabled: crossroadsChessEnabled,
  oppositeColor: oppositeCrossroadsChessColor,
  rules: {
    createInitialState: createInitialCrossroadsChessState,
    applyMove: applyCrossroadsChessOpenMove,
    isLegalMove: (state, move) =>
      getCrossroadsChessOpenLegalMoves(state).some(
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
      if (!isCrossroadsChessSquare(message.from) || !isCrossroadsChessSquare(message.to)) {
        return null;
      }
      return { from: message.from, to: message.to };
    },
    canonicalMove: canonicalCrossroadsChessMove,
  },
  visibility: {
    clientEventFor: crossroadsChessClientEventFor,
    viewForClient: (state, client) => getCrossroadsChessClientView(state, client.seat),
  },
  engine: {
    isEngineClientId: isCrossroadsChessEngineClientId,
    displayName: crossroadsChessEngineDisplayName,
    engineVersion: crossroadsChessEngineVersion,
    // No live reservation system for the in-process FSF engine; the tag only
    // labels release log lines if a reservation ever appears.
    reservationReleaseTag: 'crossroads-chess',
  },
  wire: {
    // roomMode always; pveEngineId only when an engine holds a seat; the
    // per-seat forfeit-deadline gating keeps the "you win in Ns" banner from
    // leaking to the leaver. Shape pinned by the Crossroads golden.
    snapshotExtras: (
      room,
      client: TenantSnapshotClient<CrossroadsChessColor>,
    ): Record<string, unknown> => {
      const extras: Record<string, unknown> = {
        forfeitDeadline: tenantForfeitDeadlineForClient(crossroadsChessTenant, room, client),
        rematch: {
          offers: tenantRematchOfferFlags(crossroadsChessTenant, room),
          finalizedRoomId: room.rematch.finalizedRoomId ?? null,
        },
      };
      const pveEngineId = tenantPveEngineId(crossroadsChessTenant, room);
      if (pveEngineId === null) return { ...extras, roomMode: 'pvp' };
      return { ...extras, roomMode: 'pve', pveEngineId };
    },
    legacyGameSpecIds: [DUAL_CHESS_SPEC_ID],
  },
  persistence: {
    resultForWinner: (winner: CrossroadsChessColor | null): persistence.GameResult => {
      if (winner === 'white') return 'white-wins';
      if (winner === 'red') return 'red-wins';
      return 'draw';
    },
    termination: (reason: string) => reason as persistence.GameTermination,
    logKindPrefix: 'crossroads_chess',
    logLabel: 'Crossroads Chess',
  },
};
