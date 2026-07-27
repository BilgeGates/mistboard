/**
 * Dark Mini Xiangqi VariantTenant — the P0 reference implementation of the
 * Layer-3 tenant contract (variant-tenant/tenant.ts).
 *
 * Everything fog-specific to DMX lives here: per-seat event redaction (a seat
 * sees only its own moves and its own seat assignment), the spectator policy
 * (empty view — /room/ never reveals), and lastMove stripping (an opponent's
 * move must not be revealed via the view's lastMove echo). The generic
 * runtime/ws/lifecycle modules consume this object and contain no DMX logic.
 */

import {
  type AbortReason,
  applyMiniXiangqiMove,
  createInitialMiniXiangqiState,
  DARK_MINI_XIANGQI_SPEC_ID,
  getMiniXiangqiPlayerView,
  isMiniXiangqiLegalMove,
  type MiniXiangqiColor,
  type MiniXiangqiGameState,
  type MiniXiangqiMove,
  type MiniXiangqiPlayerView,
  oppositeMiniXiangqiColor,
} from '@mistboard/game';
import { engineVersionDisplayName, isDarkMiniXiangqiEngineClientId } from './engines/registry.js';
import { darkMiniXiangqiEnabled } from './feature-flags.js';
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

export const DARK_MINI_XIANGQI_ROOM_ID_PREFIX = 'dmxq_';

export type DarkMiniXiangqiTenant = VariantTenant<
  'dark-mini-xiangqi',
  MiniXiangqiColor,
  MiniXiangqiMove,
  MiniXiangqiGameState,
  MiniXiangqiPlayerView,
  typeof DARK_MINI_XIANGQI_SPEC_ID
>;

export function isMiniXiangqiSquare(value: unknown): value is MiniXiangqiMove['from'] {
  return typeof value === 'string' && /^[a-g][1-7]$/.test(value);
}

function isMiniXiangqiColor(value: unknown): value is MiniXiangqiColor {
  return value === 'red' || value === 'black';
}

function isMiniXiangqiMove(value: unknown): value is MiniXiangqiMove {
  if (typeof value !== 'object' || value === null) return false;
  const move = value as Record<string, unknown>;
  return isMiniXiangqiSquare(move.from) && isMiniXiangqiSquare(move.to);
}

// Fog rule: a seat's event stream contains only its own seat assignment and
// its own moves; spectators get nothing (/room/ never reveals).
export function darkMiniXiangqiClientEventFor(
  event: TenantRoomEvent<MiniXiangqiColor, MiniXiangqiMove, typeof DARK_MINI_XIANGQI_SPEC_ID>,
  seat: TenantSeat<MiniXiangqiColor>,
  ply: number,
): TenantClientEvent<MiniXiangqiColor, MiniXiangqiMove, typeof DARK_MINI_XIANGQI_SPEC_ID> | null {
  if (seat === 'spectator') return null;
  if (event.type === 'seat-assigned') return event.seat === seat ? event : null;
  if (event.type === 'move-played') {
    if (event.color !== seat) return null;
    return { ...event, ply };
  }
  return event;
}

export function getDarkMiniXiangqiClientView(
  state: MiniXiangqiGameState,
  client: TenantSnapshotClient<MiniXiangqiColor>,
  latestVisibleMoveColor?: MiniXiangqiColor,
): MiniXiangqiPlayerView {
  const perspective = client.seat === 'black' ? 'black' : 'red';
  if (client.seat === 'spectator') return emptyDarkMiniXiangqiView(state, perspective);
  const view = getMiniXiangqiPlayerView(state, perspective);
  // The view's lastMove echo would reveal the opponent's latest move under
  // fog — only the seat that just moved keeps it.
  if (latestVisibleMoveColor !== client.seat) return { ...view, lastMove: undefined };
  return view;
}

function latestVisibleMiniXiangqiMoveColor(
  events: readonly TenantRoomEvent<
    MiniXiangqiColor,
    MiniXiangqiMove,
    typeof DARK_MINI_XIANGQI_SPEC_ID
  >[],
  client: TenantSnapshotClient<MiniXiangqiColor>,
): MiniXiangqiColor | undefined {
  if (client.seat === 'spectator') return undefined;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.type === 'move-played') return event.color === client.seat ? event.color : undefined;
  }
  return undefined;
}

function emptyDarkMiniXiangqiView(
  state: MiniXiangqiGameState,
  perspective: MiniXiangqiColor,
): MiniXiangqiPlayerView {
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

export const darkMiniXiangqiTenant: DarkMiniXiangqiTenant = {
  kind: 'dark-mini-xiangqi',
  gameSpecId: DARK_MINI_XIANGQI_SPEC_ID,
  roomIdPrefix: DARK_MINI_XIANGQI_ROOM_ID_PREFIX,
  colors: ['red', 'black'],
  enabled: darkMiniXiangqiEnabled,
  oppositeColor: oppositeMiniXiangqiColor,
  rules: {
    createInitialState: createInitialMiniXiangqiState,
    applyMove: applyMiniXiangqiMove,
    isLegalMove: isMiniXiangqiLegalMove,
    finish: (state, winner, reason) => ({
      ...state,
      status: { type: 'finished', winner, reason },
    }),
    abort: (state, reason: AbortReason) => ({
      ...state,
      status: { type: 'aborted', reason },
    }),
    isColor: isMiniXiangqiColor,
    isMove: isMiniXiangqiMove,
    moveFromMessage: (message) => {
      if (!isMiniXiangqiSquare(message.from) || !isMiniXiangqiSquare(message.to)) return null;
      return { from: message.from, to: message.to };
    },
  },
  visibility: {
    clientEventFor: darkMiniXiangqiClientEventFor,
    viewForClient: (
      state: MiniXiangqiGameState,
      client: TenantSnapshotClient<MiniXiangqiColor>,
      events,
    ) =>
      getDarkMiniXiangqiClientView(
        state,
        client,
        latestVisibleMiniXiangqiMoveColor(events, client),
      ),
  },
  engine: {
    terminalContext: 'fog-observation',
    isEngineClientId: isDarkMiniXiangqiEngineClientId,
    displayName: engineVersionDisplayName,
    reservationColor: (color) => (color === 'red' ? 'white' : 'black'),
    reservationReleaseTag: 'dmx',
  },
  wire: {
    // DMX's snapshot carries the PvE/rated/rematch surface on top of the core
    // payload; the per-seat forfeit-deadline gating keeps the "you win in Ns"
    // banner from leaking to the leaver. Shape pinned by the DMX golden.
    snapshotExtras: (room, client) => {
      const pveEngineId = tenantPveEngineId(darkMiniXiangqiTenant, room);
      return {
        mode: pveEngineId ? 'pve' : 'pvp',
        pveEngineId,
        rated: room.rated,
        forfeitDeadline: tenantForfeitDeadlineForClient(darkMiniXiangqiTenant, room, client),
        rematch: {
          offers: tenantRematchOfferFlags(darkMiniXiangqiTenant, room),
          finalizedRoomId: room.rematch.finalizedRoomId ?? null,
        },
      };
    },
  },
  persistence: {
    resultForWinner: (winner: MiniXiangqiColor | null): persistence.GameResult => {
      if (winner === 'red') return 'red-wins';
      if (winner === 'black') return 'black-wins';
      return 'draw';
    },
    termination: (reason: string) => reason as persistence.GameTermination,
    logKindPrefix: 'dark_mini_xiangqi',
    logLabel: 'Dark Mini Xiangqi',
  },
};
