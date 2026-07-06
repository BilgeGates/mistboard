/**
 * Luzhanqi VariantTenant — computer-refereed two-player dark Junqi.
 *
 * This tenant is intentionally not registered for live room creation yet. It pins
 * the event model the live surface will use: a room starts in setup, each seat
 * submits a private formation via setup-submitted, and play starts only once both
 * formations are locked. Setup payloads and battle identities are server truth;
 * live wire views reveal only a seat's own ranks plus explicit Marshal-loss flag
 * reveals.
 */

import {
  type AbortReason,
  applyLuzhanqiMove,
  createPendingLuzhanqiState,
  getLuzhanqiPlayerView,
  isLuzhanqiFormation,
  isLuzhanqiLegalMove,
  isLuzhanqiSquare,
  LUZHANQI_COLORS,
  LUZHANQI_SPEC_ID,
  type LuzhanqiColor,
  type LuzhanqiFormation,
  type LuzhanqiGameState,
  type LuzhanqiMove,
  type LuzhanqiPlayerView,
  oppositeLuzhanqiColor,
  submitLuzhanqiFormation,
} from '@mistboard/game';
import { luzhanqiEnabled } from './feature-flags.js';
import type * as persistence from './persistence.js';
import type {
  TenantClientEvent,
  TenantRoomEvent,
  TenantSeat,
  TenantSnapshotClient,
  VariantTenant,
} from './variant-tenant/tenant.js';

export const LUZHANQI_ROOM_ID_PREFIX = 'lzq_';

export type LuzhanqiTenant = VariantTenant<
  'luzhanqi',
  LuzhanqiColor,
  LuzhanqiMove,
  LuzhanqiGameState,
  LuzhanqiPlayerView,
  typeof LUZHANQI_SPEC_ID
>;

function isLuzhanqiColor(value: unknown): value is LuzhanqiColor {
  return value === 'red' || value === 'black';
}

function isLuzhanqiMove(value: unknown): value is LuzhanqiMove {
  if (typeof value !== 'object' || value === null) return false;
  const move = value as Record<string, unknown>;
  return isLuzhanqiSquare(move.from) && isLuzhanqiSquare(move.to);
}

function formationFromMessage(message: { setup?: unknown }): LuzhanqiFormation | null {
  return isLuzhanqiFormation(message.setup) ? message.setup : null;
}

export function luzhanqiClientEventFor(
  event: TenantRoomEvent<LuzhanqiColor, LuzhanqiMove, typeof LUZHANQI_SPEC_ID>,
  seat: TenantSeat<LuzhanqiColor>,
  ply: number,
): TenantClientEvent<LuzhanqiColor, LuzhanqiMove, typeof LUZHANQI_SPEC_ID> | null {
  if (seat === 'spectator') return null;
  if (event.type === 'setup-submitted') {
    if (event.color !== seat) {
      return {
        type: 'setup-submitted',
        at: event.at,
        roomId: event.roomId,
        color: event.color,
        setup: 'submitted',
      };
    }
    return event;
  }
  if (event.type === 'move-played') return { ...event, ply };
  return event;
}

function emptyLuzhanqiView(state: LuzhanqiGameState): LuzhanqiPlayerView {
  return {
    id: state.id,
    perspective: 'red',
    board: {},
    legalMoves: [],
    status: state.status,
    moveNumber: state.moveNumber,
    ply: state.ply,
    revealedFlags: state.revealedFlags,
    lastMove: undefined,
  };
}

export function getLuzhanqiClientView(
  state: LuzhanqiGameState,
  client: TenantSnapshotClient<LuzhanqiColor>,
): LuzhanqiPlayerView {
  if (client.seat === 'spectator') return emptyLuzhanqiView(state);
  return getLuzhanqiPlayerView(state, client.seat);
}

export const luzhanqiTenant: LuzhanqiTenant = {
  kind: 'luzhanqi',
  gameSpecId: LUZHANQI_SPEC_ID,
  roomIdPrefix: LUZHANQI_ROOM_ID_PREFIX,
  colors: LUZHANQI_COLORS,
  enabled: luzhanqiEnabled,
  oppositeColor: oppositeLuzhanqiColor,
  rules: {
    createInitialState: (roomId) => createPendingLuzhanqiState(roomId),
    applyMove: (state, move) => applyLuzhanqiMove(state, move),
    isLegalMove: isLuzhanqiLegalMove,
    finish: (state, winner, reason) => ({
      ...state,
      status: { type: 'finished', winner, reason },
    }),
    abort: (state, reason: AbortReason) => ({
      ...state,
      status: { type: 'aborted', reason },
    }),
    isColor: isLuzhanqiColor,
    isMove: isLuzhanqiMove,
    moveFromMessage: (message) => {
      if (!isLuzhanqiSquare(message.from) || !isLuzhanqiSquare(message.to)) return null;
      return { from: message.from, to: message.to };
    },
  },
  setupSubmission: {
    applySetup: (state, color, setup) =>
      isLuzhanqiFormation(setup) ? submitLuzhanqiFormation(state, color, setup) : state,
    isSetup: isLuzhanqiFormation,
    setupFromMessage: formationFromMessage,
  },
  visibility: {
    clientEventFor: luzhanqiClientEventFor,
    viewForClient: (state, client) => getLuzhanqiClientView(state, client),
  },
  persistence: {
    resultForWinner: (winner: LuzhanqiColor | null): persistence.GameResult => {
      if (winner === 'red') return 'red-wins';
      if (winner === 'black') return 'black-wins';
      return 'draw';
    },
    termination: (reason: string): persistence.GameTermination =>
      reason === 'flag-captured'
        ? 'general-captured'
        : reason === 'mobile-force-eliminated'
          ? 'no-legal-moves'
          : (reason as persistence.GameTermination),
    logKindPrefix: 'luzhanqi',
    logLabel: 'Luzhanqi',
  },
};
