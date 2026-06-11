/**
 * Thin adapter over the generic tenant event writer (variant-tenant/events.ts)
 * for hidden Dark Xiangqi. The persisted GameSummary keeps its legacy shape
 * via darkXiangqiTenant.persistence.buildGameSummary (no time-control fields;
 * guests named by color).
 */

import type {
  DARK_XIANGQI_SPEC_ID,
  XiangqiColor,
  XiangqiGameState,
  XiangqiMove,
} from '@mistboard/game';
import type {
  DarkXiangqiEvent,
  DarkXiangqiRuntimeRoom,
  DarkXiangqiSeatTokenState,
} from './dark-xiangqi-runtime.js';
import {
  buildDarkXiangqiGameSummary as buildDarkXiangqiGameSummaryFromTenant,
  darkXiangqiTenant,
} from './dark-xiangqi-tenant.js';
import type * as persistence from './persistence.js';
import {
  appendTenantEvent,
  appendTenantSeatAssigned,
  recordTenantPersistenceError,
  type TenantEventWriterContext,
  type TenantEventWriterPersistence,
} from './variant-tenant/events.js';

export type DarkXiangqiEventRoom = DarkXiangqiRuntimeRoom;

export type DarkXiangqiEventWriterPersistence = TenantEventWriterPersistence<
  XiangqiColor,
  XiangqiMove,
  typeof DARK_XIANGQI_SPEC_ID
>;

export type DarkXiangqiEventWriterContext = TenantEventWriterContext<
  'dark-xiangqi',
  XiangqiColor,
  XiangqiMove,
  XiangqiGameState,
  typeof DARK_XIANGQI_SPEC_ID
>;

export async function appendDarkXiangqiEvent(
  room: DarkXiangqiEventRoom,
  event: DarkXiangqiEvent,
  ctx: DarkXiangqiEventWriterContext,
): Promise<number> {
  return appendTenantEvent(darkXiangqiTenant, room, event, ctx);
}

export async function appendDarkXiangqiSeatAssigned(
  room: DarkXiangqiEventRoom,
  args: {
    event: Extract<DarkXiangqiEvent, { type: 'seat-assigned' }>;
    tokenState: DarkXiangqiSeatTokenState;
  },
  ctx: DarkXiangqiEventWriterContext,
): Promise<number> {
  return appendTenantSeatAssigned(darkXiangqiTenant, room, args, ctx);
}

export function buildDarkXiangqiGameSummary(room: DarkXiangqiEventRoom): persistence.GameSummary {
  return buildDarkXiangqiGameSummaryFromTenant(room);
}

export function recordDarkXiangqiPersistenceError(
  roomId: string,
  seq: number,
  eventType: string,
  err: Error,
): void {
  recordTenantPersistenceError(darkXiangqiTenant, roomId, seq, eventType, err);
}
