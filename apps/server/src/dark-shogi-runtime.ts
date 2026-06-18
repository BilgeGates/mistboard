/**
 * Thin adapter over the generic VariantTenant runtime (variant-tenant/) for
 * hidden Dark Shogi (9x9) — built on the Dark Crossroads adapter pattern. Every
 * export delegates to the tenant-generic runtime bound to darkShogiTenant. Wire
 * parity is pinned by dark-shogi-golden-wire.test.ts.
 */

import type {
  DARK_SHOGI_SPEC_ID,
  RoomTimeControl,
  ShogiColor,
  ShogiGameState,
  ShogiGameStatus,
  ShogiMove,
} from '@mistboard/game';
import {
  DARK_SHOGI_ROOM_ID_PREFIX,
  type DarkShogiWirePlayerView,
  darkShogiClientEventFor,
  darkShogiTenant,
  getDarkShogiClientView,
} from './dark-shogi-tenant.js';
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

export type { DarkShogiWirePlayerView };
export { DARK_SHOGI_ROOM_ID_PREFIX, darkShogiClientEventFor, getDarkShogiClientView };

type DarkShogiSpecId = typeof DARK_SHOGI_SPEC_ID;

export type DarkShogiSeat = TenantSeat<ShogiColor>;
export type DarkShogiCreatorPreference = ShogiColor | 'random';
export type DarkShogiClockState = TenantClockState<ShogiColor>;
export type DarkShogiEvent = TenantRoomEvent<ShogiColor, ShogiMove, DarkShogiSpecId>;
export type DarkShogiClientEvent = TenantClientEvent<ShogiColor, ShogiMove, DarkShogiSpecId>;
export type DarkShogiProjection = TenantProjection<ShogiColor, ShogiGameState, DarkShogiSpecId>;
export type DarkShogiClientRef = TenantClientRef<ShogiColor>;
export type DarkShogiSeatTokenState = TenantSeatTokenState<ShogiColor>;
export type DarkShogiRuntimeRoom = TenantRuntimeRoom<
  'dark-shogi',
  ShogiColor,
  ShogiMove,
  ShogiGameState,
  DarkShogiSpecId
>;
export type DarkShogiSnapshotClient = TenantSnapshotClient<ShogiColor>;
export type DarkShogiSnapshotPayload = TenantSnapshotPayload<
  ShogiColor,
  ShogiMove,
  DarkShogiWirePlayerView,
  DarkShogiSpecId
>;

export type DarkShogiRoomCreation =
  | { ok: true; room: DarkShogiRuntimeRoom }
  | { ok: false; error: 'dark_shogi_disabled' };

export type DarkShogiRoomHydration = TenantRoomHydration<
  'dark-shogi',
  ShogiColor,
  ShogiMove,
  ShogiGameState,
  DarkShogiSpecId
>;

export function isDarkShogiRoomId(roomId: string): boolean {
  return isTenantRoomId(darkShogiTenant, roomId);
}

export function createDarkShogiClock(
  _at: number,
  initialMs: number,
  incrementMs: number,
): DarkShogiClockState {
  return createTenantClock(darkShogiTenant, initialMs, incrementMs);
}

export function nextDarkShogiClockForMove(
  clock: DarkShogiClockState | undefined,
  at: number,
  movedColor: ShogiColor,
  prevMoveNumber: number,
  nextStatus: ShogiGameStatus,
): DarkShogiClockState | undefined {
  return nextTenantClockForMove(darkShogiTenant, clock, at, movedColor, prevMoveNumber, nextStatus);
}

export function expireDarkShogiClock(
  clock: DarkShogiClockState | undefined,
  at: number,
  color: ShogiColor,
): DarkShogiClockState | undefined {
  return expireTenantClock(clock, at, color);
}

export function freezeDarkShogiClock(
  clock: DarkShogiClockState | undefined,
  at: number,
): DarkShogiClockState | undefined {
  return freezeTenantClock(clock, at);
}

export function darkShogiClockRemainingMs(
  clock: DarkShogiClockState,
  color: ShogiColor,
  at: number,
): number {
  return tenantClockRemainingMs(clock, color, at);
}

export function createDarkShogiRuntimeRoom(
  roomId: string,
  options: {
    creatorPreference?: DarkShogiCreatorPreference;
    now?: number;
    timeControl?: RoomTimeControl;
  } = {},
): DarkShogiRoomCreation {
  const created = createTenantRuntimeRoom(darkShogiTenant, roomId, options);
  if (!created.ok) return { ok: false, error: 'dark_shogi_disabled' };
  return created;
}

export function createDarkShogiRuntimeRoomFromEvents(
  events: readonly DarkShogiEvent[],
  projection = replayDarkShogiEvents(events),
): DarkShogiRoomHydration {
  return createTenantRuntimeRoomFromEvents(darkShogiTenant, events, projection);
}

export function appendDarkShogiRuntimeEvent(
  room: DarkShogiRuntimeRoom,
  event: DarkShogiEvent,
): number {
  return appendTenantRuntimeEvent(darkShogiTenant, room, event);
}

export function isDarkShogiEventLog(
  events: readonly unknown[],
  roomId?: string,
): events is readonly DarkShogiEvent[] {
  return isTenantEventLog(darkShogiTenant, events, roomId);
}

export function isDarkShogiEvent(value: unknown, roomId?: string): value is DarkShogiEvent {
  return isTenantEvent(darkShogiTenant, value, roomId);
}

export function replayDarkShogiEvents(events: readonly DarkShogiEvent[]): DarkShogiProjection {
  return replayTenantEvents(darkShogiTenant, events);
}

export function applyDarkShogiEvent(
  projection: DarkShogiProjection,
  event: DarkShogiEvent,
): DarkShogiProjection {
  return applyTenantEvent(darkShogiTenant, projection, event);
}

export function darkShogiSnapshotPayload(
  room: DarkShogiRuntimeRoom,
  client: DarkShogiSnapshotClient,
): DarkShogiSnapshotPayload {
  return tenantSnapshotPayload(darkShogiTenant, room, client);
}

export function darkShogiEventsForClient(
  room: DarkShogiRuntimeRoom,
  client: DarkShogiSnapshotClient,
): DarkShogiClientEvent[] {
  return tenantEventsForClient(darkShogiTenant, room, client);
}

export function darkShogiPlyAtEventIndex(
  events: readonly DarkShogiEvent[],
  eventIndex: number,
): number {
  return tenantPlyAtEventIndex(events, eventIndex);
}
