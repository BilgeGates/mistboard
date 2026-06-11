/**
 * Thin adapter over the generic tenant event writer (variant-tenant/events.ts)
 * for Dark Mini Xiangqi. Exports keep their pre-migration names/signatures;
 * persistence log kinds and the GameSummary mapping come from
 * darkMiniXiangqiTenant.
 */

import type {
  DARK_MINI_XIANGQI_SPEC_ID,
  MiniXiangqiColor,
  MiniXiangqiGameState,
  MiniXiangqiMove,
} from '@mistboard/game';
import type {
  DarkMiniXiangqiEvent,
  DarkMiniXiangqiRuntimeRoom,
  DarkMiniXiangqiSeatTokenState,
} from './dark-mini-xiangqi-runtime.js';
import { darkMiniXiangqiTenant } from './dark-mini-xiangqi-tenant.js';
import type * as persistence from './persistence.js';
import {
  appendTenantEvent,
  appendTenantSeatAssigned,
  buildTenantGameSummary,
  persistenceRecordForTenantSeatToken,
  recordTenantPersistenceError,
  type TenantEventWriterContext,
  type TenantEventWriterPersistence,
} from './variant-tenant/events.js';

export type DarkMiniXiangqiEventRoom = DarkMiniXiangqiRuntimeRoom;

export type DarkMiniXiangqiEventWriterPersistence = TenantEventWriterPersistence<
  MiniXiangqiColor,
  MiniXiangqiMove,
  typeof DARK_MINI_XIANGQI_SPEC_ID
>;

export type DarkMiniXiangqiEventWriterContext = TenantEventWriterContext<
  'dark-mini-xiangqi',
  MiniXiangqiColor,
  MiniXiangqiMove,
  MiniXiangqiGameState,
  typeof DARK_MINI_XIANGQI_SPEC_ID
>;

export async function appendDarkMiniXiangqiEvent(
  room: DarkMiniXiangqiEventRoom,
  event: DarkMiniXiangqiEvent,
  ctx: DarkMiniXiangqiEventWriterContext = {},
): Promise<number> {
  return appendTenantEvent(darkMiniXiangqiTenant, room, event, ctx);
}

export async function appendDarkMiniXiangqiSeatAssigned(
  room: DarkMiniXiangqiEventRoom,
  args: {
    event: Extract<DarkMiniXiangqiEvent, { type: 'seat-assigned' }>;
    tokenState: DarkMiniXiangqiSeatTokenState;
  },
  ctx: DarkMiniXiangqiEventWriterContext = {},
): Promise<number> {
  return appendTenantSeatAssigned(darkMiniXiangqiTenant, room, args, ctx);
}

export function buildDarkMiniXiangqiGameSummary(
  room: DarkMiniXiangqiEventRoom,
): persistence.GameSummary {
  return buildTenantGameSummary(darkMiniXiangqiTenant, room);
}

export function recordDarkMiniXiangqiPersistenceError(
  roomId: string,
  seq: number,
  eventType: string,
  err: Error,
): void {
  recordTenantPersistenceError(darkMiniXiangqiTenant, roomId, seq, eventType, err);
}

export function persistenceRecordForDarkMiniXiangqiSeatToken(
  token: DarkMiniXiangqiSeatTokenState,
): persistence.RoomSeatTokenRecord<MiniXiangqiColor> {
  return persistenceRecordForTenantSeatToken(token);
}
