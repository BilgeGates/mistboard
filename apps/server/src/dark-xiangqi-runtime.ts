/**
 * Thin adapter over the generic VariantTenant runtime (variant-tenant/) for
 * hidden Dark Xiangqi (9x10) — the P1 near-copy migration after DMX.
 *
 * Every export keeps its pre-migration name and signature; implementations
 * delegate to the tenant-generic runtime bound to darkXiangqiTenant. Wire
 * parity is pinned by dark-xiangqi-golden-wire.test.ts (recorded before the
 * migration), including the dxq-specific shapes: snapshot = the tenant core
 * payload with NO extras, looser non-move event redaction, the
 * shrouded-piece wire board, and seat-vacated acceptance. The ws handler and
 * transport module are untouched and consume these adapters.
 */

import type {
  DARK_XIANGQI_SPEC_ID,
  RoomTimeControl,
  XiangqiColor,
  XiangqiGameState,
  XiangqiGameStatus,
  XiangqiMove,
} from '@mistboard/game';
import {
  DARK_XIANGQI_ROOM_ID_PREFIX,
  type DarkXiangqiWirePlayerView,
  darkXiangqiClientEventFor,
  darkXiangqiTenant,
  getDarkXiangqiClientView,
} from './dark-xiangqi-tenant.js';
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
  TenantRoomEvent,
  TenantRuntimeRoom,
  TenantSeat,
  TenantSeatTokenState,
  TenantSnapshotClient,
} from './variant-tenant/tenant.js';

export type { DarkXiangqiWirePlayerView };
export { DARK_XIANGQI_ROOM_ID_PREFIX, darkXiangqiClientEventFor, getDarkXiangqiClientView };

type DarkXiangqiSpecId = typeof DARK_XIANGQI_SPEC_ID;

export type DarkXiangqiSeat = TenantSeat<XiangqiColor>;
export type DarkXiangqiCreatorPreference = XiangqiColor | 'random';
export type DarkXiangqiClockState = TenantClockState<XiangqiColor>;
export type DarkXiangqiEvent = TenantRoomEvent<XiangqiColor, XiangqiMove, DarkXiangqiSpecId>;
export type DarkXiangqiClientEvent = TenantClientEvent<
  XiangqiColor,
  XiangqiMove,
  DarkXiangqiSpecId
>;
export type DarkXiangqiProjection = TenantProjection<
  XiangqiColor,
  XiangqiGameState,
  DarkXiangqiSpecId
>;
export type DarkXiangqiClientRef = TenantClientRef<XiangqiColor>;
export type DarkXiangqiSeatTokenState = TenantSeatTokenState<XiangqiColor>;
export type DarkXiangqiRuntimeRoom = TenantRuntimeRoom<
  'dark-xiangqi',
  XiangqiColor,
  XiangqiMove,
  XiangqiGameState,
  DarkXiangqiSpecId
>;
export type DarkXiangqiSnapshotClient = TenantSnapshotClient<XiangqiColor>;
// Dark Xiangqi's snapshot is exactly the tenant core payload — no extras
// (golden-pinned: no mode/pveEngineId/rated/forfeitDeadline/rematch keys).
export type DarkXiangqiSnapshotPayload = TenantSnapshotPayload<
  XiangqiColor,
  XiangqiMove,
  DarkXiangqiWirePlayerView,
  DarkXiangqiSpecId
>;

export type DarkXiangqiRoomCreation =
  | { ok: true; room: DarkXiangqiRuntimeRoom }
  | { ok: false; error: 'dark_xiangqi_disabled' };

export type DarkXiangqiRoomHydration = TenantRoomHydration<
  'dark-xiangqi',
  XiangqiColor,
  XiangqiMove,
  XiangqiGameState,
  DarkXiangqiSpecId
>;

export function isDarkXiangqiRoomId(roomId: string): boolean {
  return isTenantRoomId(darkXiangqiTenant, roomId);
}

export function createDarkXiangqiClock(
  _at: number,
  initialMs: number,
  incrementMs: number,
): DarkXiangqiClockState {
  return createTenantClock(darkXiangqiTenant, initialMs, incrementMs);
}

export function nextDarkXiangqiClockForMove(
  clock: DarkXiangqiClockState | undefined,
  at: number,
  movedColor: XiangqiColor,
  prevMoveNumber: number,
  nextStatus: XiangqiGameStatus,
): DarkXiangqiClockState | undefined {
  return nextTenantClockForMove(
    darkXiangqiTenant,
    clock,
    at,
    movedColor,
    prevMoveNumber,
    nextStatus,
  );
}

export function expireDarkXiangqiClock(
  clock: DarkXiangqiClockState | undefined,
  at: number,
  color: XiangqiColor,
): DarkXiangqiClockState | undefined {
  return expireTenantClock(clock, at, color);
}

export function freezeDarkXiangqiClock(
  clock: DarkXiangqiClockState | undefined,
  at: number,
): DarkXiangqiClockState | undefined {
  return freezeTenantClock(clock, at);
}

export function darkXiangqiClockRemainingMs(
  clock: DarkXiangqiClockState,
  color: XiangqiColor,
  at: number,
): number {
  return tenantClockRemainingMs(clock, color, at);
}

export function createDarkXiangqiRuntimeRoom(
  roomId: string,
  options: {
    creatorPreference?: DarkXiangqiCreatorPreference;
    now?: number;
    timeControl?: RoomTimeControl;
  } = {},
): DarkXiangqiRoomCreation {
  const created = createTenantRuntimeRoom(darkXiangqiTenant, roomId, options);
  if (!created.ok) return { ok: false, error: 'dark_xiangqi_disabled' };
  return created;
}

export function createDarkXiangqiRuntimeRoomFromEvents(
  events: readonly DarkXiangqiEvent[],
  projection = replayDarkXiangqiEvents(events),
): DarkXiangqiRoomHydration {
  return createTenantRuntimeRoomFromEvents(darkXiangqiTenant, events, projection);
}

export function appendDarkXiangqiRuntimeEvent(
  room: DarkXiangqiRuntimeRoom,
  event: DarkXiangqiEvent,
): number {
  return appendTenantRuntimeEvent(darkXiangqiTenant, room, event);
}

export function isDarkXiangqiEventLog(
  events: readonly unknown[],
  roomId?: string,
): events is readonly DarkXiangqiEvent[] {
  return isTenantEventLog(darkXiangqiTenant, events, roomId);
}

export function isDarkXiangqiEvent(value: unknown, roomId?: string): value is DarkXiangqiEvent {
  return isTenantEvent(darkXiangqiTenant, value, roomId);
}

export function replayDarkXiangqiEvents(
  events: readonly DarkXiangqiEvent[],
): DarkXiangqiProjection {
  return replayTenantEvents(darkXiangqiTenant, events);
}

export function applyDarkXiangqiEvent(
  projection: DarkXiangqiProjection,
  event: DarkXiangqiEvent,
): DarkXiangqiProjection {
  return applyTenantEvent(darkXiangqiTenant, projection, event);
}

export function darkXiangqiSnapshotPayload(
  room: DarkXiangqiRuntimeRoom,
  client: DarkXiangqiSnapshotClient,
): DarkXiangqiSnapshotPayload {
  return tenantSnapshotPayload(darkXiangqiTenant, room, client);
}

export function darkXiangqiEventsForClient(
  room: DarkXiangqiRuntimeRoom,
  client: DarkXiangqiSnapshotClient,
): DarkXiangqiClientEvent[] {
  return tenantEventsForClient(darkXiangqiTenant, room, client);
}

export function darkXiangqiPlyAtEventIndex(
  events: readonly DarkXiangqiEvent[],
  eventIndex: number,
): number {
  return tenantPlyAtEventIndex(events, eventIndex);
}
