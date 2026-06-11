/**
 * Thin adapter over the generic tenant event writer (variant-tenant/events.ts)
 * for Crossroads Chess. The persisted GameSummary uses the generic builder
 * unchanged (engine-version participants, pve→public visibility, time-control
 * fields) — the pre-migration Crossroads builder matched it field for field.
 */

import type {
  CrossroadsChessColor,
  CrossroadsChessGameState,
  CrossroadsChessMove,
} from '@mistboard/game';
import type {
  CrossroadsChessEvent,
  CrossroadsChessRuntimeRoom,
  CrossroadsChessSeatTokenState,
} from './crossroads-chess-runtime.js';
import { type CrossroadsChessSpecId, crossroadsChessTenant } from './crossroads-chess-tenant.js';
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

export type CrossroadsChessEventRoom = CrossroadsChessRuntimeRoom;

export type CrossroadsChessEventWriterPersistence = TenantEventWriterPersistence<
  CrossroadsChessColor,
  CrossroadsChessMove,
  CrossroadsChessSpecId
>;

export type CrossroadsChessEventWriterContext = TenantEventWriterContext<
  'crossroads-chess',
  CrossroadsChessColor,
  CrossroadsChessMove,
  CrossroadsChessGameState,
  CrossroadsChessSpecId
>;

export async function appendCrossroadsChessEvent(
  room: CrossroadsChessEventRoom,
  event: CrossroadsChessEvent,
  ctx: CrossroadsChessEventWriterContext = {},
): Promise<number> {
  return appendTenantEvent(crossroadsChessTenant, room, event, ctx);
}

export async function appendCrossroadsChessSeatAssigned(
  room: CrossroadsChessEventRoom,
  args: {
    event: Extract<CrossroadsChessEvent, { type: 'seat-assigned' }>;
    tokenState: CrossroadsChessSeatTokenState;
  },
  ctx: CrossroadsChessEventWriterContext = {},
): Promise<number> {
  return appendTenantSeatAssigned(crossroadsChessTenant, room, args, ctx);
}

export function buildCrossroadsChessGameSummary(
  room: CrossroadsChessEventRoom,
): persistence.GameSummary {
  return buildTenantGameSummary(crossroadsChessTenant, room);
}

export function recordCrossroadsChessPersistenceError(
  roomId: string,
  seq: number,
  eventType: string,
  err: Error,
): void {
  recordTenantPersistenceError(crossroadsChessTenant, roomId, seq, eventType, err);
}

export function persistenceRecordForCrossroadsChessSeatToken(
  token: CrossroadsChessSeatTokenState,
): persistence.RoomSeatTokenRecord<CrossroadsChessColor> {
  return persistenceRecordForTenantSeatToken(token);
}
