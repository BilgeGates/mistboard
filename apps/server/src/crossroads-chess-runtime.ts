/**
 * Thin adapter over the generic VariantTenant runtime (variant-tenant/) for
 * perfect-information Crossroads Chess — the P1 migration after Dark Xiangqi.
 *
 * Every export keeps its pre-migration name and signature; implementations
 * delegate to the tenant-generic runtime bound to crossroadsChessTenant. Wire
 * parity is pinned by crossroads-chess-golden-wire.test.ts (recorded before
 * the migration), including the Crossroads-specific shapes: pass-through
 * event visibility, the roomMode/pveEngineId/forfeitDeadline/rematch snapshot
 * extras (the old runtime/transport payload split collapsed into the one
 * tenant payload), and the legacy 'dual-chess' gameSpecId alias.
 */

import type {
  CrossroadsChessColor,
  CrossroadsChessGameState,
  CrossroadsChessGameStatus,
  CrossroadsChessMove,
  RoomTimeControl,
} from '@mistboard/game';
import {
  CROSSROADS_CHESS_ROOM_ID_PREFIX,
  type CrossroadsChessSpecId,
  crossroadsChessClientEventFor,
  crossroadsChessTenant,
  getCrossroadsChessClientView,
  isCrossroadsChessSquare,
} from './crossroads-chess-tenant.js';
import {
  appendTenantRuntimeEvent,
  applyTenantEvent,
  createTenantClock,
  createTenantRuntimeRoom,
  createTenantRuntimeRoomFromEvents,
  expireTenantClock,
  freezeTenantClock,
  isTenantEvent,
  isTenantEventLog,
  isTenantRoomId,
  nextTenantClockForMove,
  replayTenantEvents,
  type TenantRoomHydration,
  type TenantSnapshotPayload,
  tenantClockRemainingMs,
  tenantEventsForClient,
  tenantPlyAtEventIndex,
  tenantSnapshotPayload,
} from './variant-tenant/runtime.js';
import type {
  TenantClientEvent,
  TenantClientRef,
  TenantClockState,
  TenantProjection,
  TenantRematchOffer,
  TenantRematchPendingRedirect,
  TenantRematchState,
  TenantRoomEvent,
  TenantRuntimeRoom,
  TenantSeat,
  TenantSeatTokenState,
  TenantSnapshotClient,
} from './variant-tenant/tenant.js';

export { CROSSROADS_CHESS_ROOM_ID_PREFIX, getCrossroadsChessClientView, isCrossroadsChessSquare };

export type CrossroadsChessSeat = TenantSeat<CrossroadsChessColor>;
export type CrossroadsChessCreatorPreference = CrossroadsChessColor | 'random';
export type CrossroadsChessClockState = TenantClockState<CrossroadsChessColor>;
export type CrossroadsChessEvent = TenantRoomEvent<
  CrossroadsChessColor,
  CrossroadsChessMove,
  CrossroadsChessSpecId
>;
export type CrossroadsChessClientEvent = TenantClientEvent<
  CrossroadsChessColor,
  CrossroadsChessMove,
  CrossroadsChessSpecId
>;
export type CrossroadsChessProjection = TenantProjection<
  CrossroadsChessColor,
  CrossroadsChessGameState,
  CrossroadsChessSpecId
>;
export type CrossroadsChessClientRef = TenantClientRef<CrossroadsChessColor>;
export type CrossroadsChessSeatTokenState = TenantSeatTokenState<CrossroadsChessColor>;
export type CrossroadsChessRematchOffer = TenantRematchOffer;
export type CrossroadsChessRematchPendingRedirect =
  TenantRematchPendingRedirect<CrossroadsChessColor>;
export type CrossroadsChessRematchState = TenantRematchState<CrossroadsChessColor>;
export type CrossroadsChessRuntimeRoom = TenantRuntimeRoom<
  'crossroads-chess',
  CrossroadsChessColor,
  CrossroadsChessMove,
  CrossroadsChessGameState,
  CrossroadsChessSpecId
>;
export type CrossroadsChessSnapshotClient = TenantSnapshotClient<CrossroadsChessColor>;
// The full Crossroads wire snapshot: tenant core payload + the extras
// (forfeitDeadline/rematch/roomMode/pveEngineId) — golden-pinned.
export type CrossroadsChessSnapshotPayload = TenantSnapshotPayload<
  CrossroadsChessColor,
  CrossroadsChessMove,
  ReturnType<typeof getCrossroadsChessClientView>,
  CrossroadsChessSpecId
> &
  Record<string, unknown>;

export type CrossroadsChessRoomCreation =
  | { ok: true; room: CrossroadsChessRuntimeRoom }
  | { ok: false; error: 'crossroads_chess_disabled' };

export type CrossroadsChessRoomHydration = TenantRoomHydration<
  'crossroads-chess',
  CrossroadsChessColor,
  CrossroadsChessMove,
  CrossroadsChessGameState,
  CrossroadsChessSpecId
>;

export function isCrossroadsChessRoomId(roomId: string): boolean {
  return isTenantRoomId(crossroadsChessTenant, roomId);
}

export function createCrossroadsChessClock(
  _at: number,
  initialMs: number,
  incrementMs: number,
): CrossroadsChessClockState {
  return createTenantClock(crossroadsChessTenant, initialMs, incrementMs);
}

export function nextCrossroadsChessClockForMove(
  clock: CrossroadsChessClockState | undefined,
  at: number,
  movedColor: CrossroadsChessColor,
  prevMoveNumber: number,
  nextStatus: CrossroadsChessGameStatus,
): CrossroadsChessClockState | undefined {
  return nextTenantClockForMove(
    crossroadsChessTenant,
    clock,
    at,
    movedColor,
    prevMoveNumber,
    nextStatus,
  );
}

export function expireCrossroadsChessClock(
  clock: CrossroadsChessClockState | undefined,
  at: number,
  color: CrossroadsChessColor,
): CrossroadsChessClockState | undefined {
  return expireTenantClock(clock, at, color);
}

export function freezeCrossroadsChessClock(
  clock: CrossroadsChessClockState | undefined,
  at: number,
): CrossroadsChessClockState | undefined {
  return freezeTenantClock(clock, at);
}

export function crossroadsChessClockRemainingMs(
  clock: CrossroadsChessClockState,
  color: CrossroadsChessColor,
  at: number,
): number {
  return tenantClockRemainingMs(clock, color, at);
}

export function createCrossroadsChessRuntimeRoom(
  roomId: string,
  options: {
    creatorPreference?: CrossroadsChessCreatorPreference;
    now?: number;
    timeControl?: RoomTimeControl;
  } = {},
): CrossroadsChessRoomCreation {
  const created = createTenantRuntimeRoom(crossroadsChessTenant, roomId, options);
  if (!created.ok) return { ok: false, error: 'crossroads_chess_disabled' };
  return created;
}

export function createCrossroadsChessRuntimeRoomFromEvents(
  events: readonly CrossroadsChessEvent[],
  projection = replayCrossroadsChessEvents(events),
): CrossroadsChessRoomHydration {
  return createTenantRuntimeRoomFromEvents(crossroadsChessTenant, events, projection);
}

export function appendCrossroadsChessRuntimeEvent(
  room: CrossroadsChessRuntimeRoom,
  event: CrossroadsChessEvent,
): number {
  return appendTenantRuntimeEvent(crossroadsChessTenant, room, event);
}

export function replayCrossroadsChessEvents(
  events: readonly CrossroadsChessEvent[],
): CrossroadsChessProjection {
  return replayTenantEvents(crossroadsChessTenant, events);
}

export function applyCrossroadsChessEvent(
  projection: CrossroadsChessProjection,
  event: CrossroadsChessEvent,
): CrossroadsChessProjection {
  return applyTenantEvent(crossroadsChessTenant, projection, event);
}

// Perfect-info: the per-seat policy is seat-independent (everyone sees every
// event), so the pre-migration signature without a client survives.
export function crossroadsChessEventsForClient(
  room: CrossroadsChessRuntimeRoom,
): CrossroadsChessClientEvent[] {
  return tenantEventsForClient(crossroadsChessTenant, room, {
    id: 'events-for-client',
    seat: 'spectator',
    solo: false,
  });
}

export function crossroadsChessSnapshotPayload(
  room: CrossroadsChessRuntimeRoom,
  client: CrossroadsChessSnapshotClient,
): CrossroadsChessSnapshotPayload {
  return tenantSnapshotPayload(crossroadsChessTenant, room, client);
}

export function crossroadsChessPlyAtEventIndex(
  events: readonly CrossroadsChessEvent[],
  eventIndex: number,
): number {
  return tenantPlyAtEventIndex(events, eventIndex);
}

export function isCrossroadsChessEventLog(
  events: readonly unknown[],
  roomId?: string,
): events is readonly CrossroadsChessEvent[] {
  return isTenantEventLog(crossroadsChessTenant, events, roomId);
}

export function isCrossroadsChessEvent(
  value: unknown,
  roomId?: string,
): value is CrossroadsChessEvent {
  return isTenantEvent(crossroadsChessTenant, value, roomId);
}

export { crossroadsChessClientEventFor };
