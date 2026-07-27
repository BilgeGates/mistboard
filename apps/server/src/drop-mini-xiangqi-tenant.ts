/**
 * Drop Mini Xiangqi VariantTenant — perfect-information 7x7 mini xiangqi with
 * crazyhouse-style reserves. Unlike Dark Mini Xiangqi, events and board state
 * are public to both seats and spectators; the only variant-specific wire
 * shape is that a move may be a board move ({from,to}) or a drop ({drop,to}).
 */

import {
  type AbortReason,
  applyDropMiniXiangqiMove,
  createInitialDropMiniXiangqiState,
  DROP_MINI_XIANGQI_DROP_ROLES,
  DROP_MINI_XIANGQI_SPEC_ID,
  type DropMiniXiangqiDropMove,
  type DropMiniXiangqiDropRole,
  type DropMiniXiangqiGameState,
  type DropMiniXiangqiMove,
  type DropMiniXiangqiPlayerView,
  getDropMiniXiangqiPlayerView,
  isLegalDropMiniXiangqiMove,
  type MiniXiangqiColor,
  type MiniXiangqiSquare,
  oppositeMiniXiangqiColor,
} from '@mistboard/game';
import { dropMiniXiangqiEnabled } from './feature-flags.js';
import type * as persistence from './persistence.js';
import {
  dropMiniXiangqiEngineDisplayName,
  dropMiniXiangqiEngineVersion,
  isDropMiniXiangqiEngineClientId,
} from './server-drop-mini-xiangqi-engine.js';
import { tenantForfeitDeadlineForClient, tenantPveEngineId } from './variant-tenant/runtime.js';
import type {
  TenantClientEvent,
  TenantRoomEvent,
  TenantSeat,
  TenantSnapshotClient,
  VariantTenant,
} from './variant-tenant/tenant.js';

export const DROP_MINI_XIANGQI_ROOM_ID_PREFIX = 'dmxqd_';

export type DropMiniXiangqiEvent = TenantRoomEvent<
  MiniXiangqiColor,
  DropMiniXiangqiMove,
  typeof DROP_MINI_XIANGQI_SPEC_ID
>;

export type DropMiniXiangqiClientEvent = TenantClientEvent<
  MiniXiangqiColor,
  DropMiniXiangqiMove,
  typeof DROP_MINI_XIANGQI_SPEC_ID
>;

export type DropMiniXiangqiTenant = VariantTenant<
  'drop-mini-xiangqi',
  MiniXiangqiColor,
  DropMiniXiangqiMove,
  DropMiniXiangqiGameState,
  DropMiniXiangqiPlayerView,
  typeof DROP_MINI_XIANGQI_SPEC_ID
>;

export function isDropMiniXiangqiSquare(value: unknown): value is MiniXiangqiSquare {
  return typeof value === 'string' && /^[a-g][1-7]$/.test(value);
}

function isDropMiniXiangqiColor(value: unknown): value is MiniXiangqiColor {
  return value === 'red' || value === 'black';
}

function isDropMiniXiangqiDropRole(value: unknown): value is DropMiniXiangqiDropRole {
  return (
    typeof value === 'string' && (DROP_MINI_XIANGQI_DROP_ROLES as readonly string[]).includes(value)
  );
}

function isDropMiniXiangqiDropMove(value: unknown): value is DropMiniXiangqiDropMove {
  if (typeof value !== 'object' || value === null) return false;
  const move = value as Record<string, unknown>;
  return isDropMiniXiangqiDropRole(move.drop) && isDropMiniXiangqiSquare(move.to);
}

function isDropMiniXiangqiBoardMove(
  value: unknown,
): value is Extract<DropMiniXiangqiMove, { from: MiniXiangqiSquare; to: MiniXiangqiSquare }> {
  if (typeof value !== 'object' || value === null) return false;
  const move = value as Record<string, unknown>;
  return isDropMiniXiangqiSquare(move.from) && isDropMiniXiangqiSquare(move.to);
}

function isDropMiniXiangqiMove(value: unknown): value is DropMiniXiangqiMove {
  return isDropMiniXiangqiBoardMove(value) || isDropMiniXiangqiDropMove(value);
}

export function dropMiniXiangqiClientEventFor(
  event: DropMiniXiangqiEvent,
  _seat: TenantSeat<MiniXiangqiColor>,
  ply: number,
): DropMiniXiangqiClientEvent {
  if (event.type !== 'move-played') return event;
  return { ...event, ply };
}

export function getDropMiniXiangqiClientView(
  state: DropMiniXiangqiGameState,
  client: TenantSnapshotClient<MiniXiangqiColor>,
): DropMiniXiangqiPlayerView {
  const perspective = client.seat === 'black' ? 'black' : 'red';
  return getDropMiniXiangqiPlayerView(state, perspective);
}

export const dropMiniXiangqiTenant: DropMiniXiangqiTenant = {
  kind: 'drop-mini-xiangqi',
  gameSpecId: DROP_MINI_XIANGQI_SPEC_ID,
  roomIdPrefix: DROP_MINI_XIANGQI_ROOM_ID_PREFIX,
  colors: ['red', 'black'],
  enabled: dropMiniXiangqiEnabled,
  oppositeColor: oppositeMiniXiangqiColor,
  rules: {
    createInitialState: createInitialDropMiniXiangqiState,
    applyMove: applyDropMiniXiangqiMove,
    isLegalMove: isLegalDropMiniXiangqiMove,
    finish: (state, winner, reason) => ({
      ...state,
      status: { type: 'finished', winner, reason },
    }),
    abort: (state, reason: AbortReason) => ({
      ...state,
      status: { type: 'aborted', reason },
    }),
    isColor: isDropMiniXiangqiColor,
    isMove: isDropMiniXiangqiMove,
    moveFromMessage: (message) => {
      if (isDropMiniXiangqiDropRole(message.drop) && isDropMiniXiangqiSquare(message.to)) {
        return { drop: message.drop, to: message.to };
      }
      if (!isDropMiniXiangqiSquare(message.from) || !isDropMiniXiangqiSquare(message.to)) {
        return null;
      }
      return { from: message.from, to: message.to };
    },
  },
  visibility: {
    clientEventFor: dropMiniXiangqiClientEventFor,
    viewForClient: (state, client) => getDropMiniXiangqiClientView(state, client),
  },
  engine: {
    terminalContext: 'full-history',
    isEngineClientId: isDropMiniXiangqiEngineClientId,
    displayName: dropMiniXiangqiEngineDisplayName,
    engineVersion: dropMiniXiangqiEngineVersion,
    reservationReleaseTag: 'drop-mini-xiangqi',
  },
  wire: {
    snapshotExtras: (room, client) => {
      const pveEngineId = tenantPveEngineId(dropMiniXiangqiTenant, room);
      return {
        roomMode: pveEngineId === null ? 'pvp' : 'pve',
        ...(pveEngineId === null ? {} : { pveEngineId }),
        rated: room.rated,
        forfeitDeadline: tenantForfeitDeadlineForClient(dropMiniXiangqiTenant, room, client),
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
    logKindPrefix: 'drop_mini_xiangqi',
    logLabel: 'Drop Mini Xiangqi',
  },
};
