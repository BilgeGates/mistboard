/**
 * Thin adapter over the generic VariantTenant runtime (variant-tenant/) for
 * hidden Dark Crazyhouse — built on the Dark Shogi adapter pattern. Every export
 * delegates to the tenant-generic runtime bound to darkCrazyhouseTenant. Wire
 * parity is pinned by dark-crazyhouse-golden-wire.test.ts.
 */

import type {
  Color,
  CrazyhouseGameState,
  CrazyhouseMove,
  DARK_CRAZYHOUSE_SPEC_ID,
  GameStatus,
  RoomTimeControl,
} from '@mistboard/game';
import {
  DARK_CRAZYHOUSE_ROOM_ID_PREFIX,
  type DarkCrazyhouseWirePlayerView,
  darkCrazyhouseClientEventFor,
  darkCrazyhouseTenant,
  getDarkCrazyhouseClientView,
} from './dark-crazyhouse-tenant.js';
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

export type { DarkCrazyhouseWirePlayerView };
export {
  DARK_CRAZYHOUSE_ROOM_ID_PREFIX,
  darkCrazyhouseClientEventFor,
  getDarkCrazyhouseClientView,
};

type DarkCrazyhouseSpecId = typeof DARK_CRAZYHOUSE_SPEC_ID;

export type DarkCrazyhouseSeat = TenantSeat<Color>;
export type DarkCrazyhouseCreatorPreference = Color | 'random';
export type DarkCrazyhouseClockState = TenantClockState<Color>;
export type DarkCrazyhouseEvent = TenantRoomEvent<Color, CrazyhouseMove, DarkCrazyhouseSpecId>;
export type DarkCrazyhouseClientEvent = TenantClientEvent<
  Color,
  CrazyhouseMove,
  DarkCrazyhouseSpecId
>;
export type DarkCrazyhouseProjection = TenantProjection<
  Color,
  CrazyhouseGameState,
  DarkCrazyhouseSpecId
>;
export type DarkCrazyhouseClientRef = TenantClientRef<Color>;
export type DarkCrazyhouseSeatTokenState = TenantSeatTokenState<Color>;
export type DarkCrazyhouseRuntimeRoom = TenantRuntimeRoom<
  'dark-crazyhouse',
  Color,
  CrazyhouseMove,
  CrazyhouseGameState,
  DarkCrazyhouseSpecId
>;
export type DarkCrazyhouseSnapshotClient = TenantSnapshotClient<Color>;
export type DarkCrazyhouseSnapshotPayload = TenantSnapshotPayload<
  Color,
  CrazyhouseMove,
  DarkCrazyhouseWirePlayerView,
  DarkCrazyhouseSpecId
>;

export type DarkCrazyhouseRoomCreation =
  | { ok: true; room: DarkCrazyhouseRuntimeRoom }
  | { ok: false; error: 'dark_crazyhouse_disabled' };

export type DarkCrazyhouseRoomHydration = TenantRoomHydration<
  'dark-crazyhouse',
  Color,
  CrazyhouseMove,
  CrazyhouseGameState,
  DarkCrazyhouseSpecId
>;

export function isDarkCrazyhouseRoomId(roomId: string): boolean {
  return isTenantRoomId(darkCrazyhouseTenant, roomId);
}

export function createDarkCrazyhouseClock(
  _at: number,
  initialMs: number,
  incrementMs: number,
): DarkCrazyhouseClockState {
  return createTenantClock(darkCrazyhouseTenant, initialMs, incrementMs);
}

export function nextDarkCrazyhouseClockForMove(
  clock: DarkCrazyhouseClockState | undefined,
  at: number,
  movedColor: Color,
  prevMoveNumber: number,
  // Crazyhouse rides the chess GameStatus (which includes a 'pregame' variant the
  // tenant clock never sees); applyMove only ever yields playing/finished here.
  nextStatus: Exclude<GameStatus, { type: 'pregame' }>,
): DarkCrazyhouseClockState | undefined {
  return nextTenantClockForMove(
    darkCrazyhouseTenant,
    clock,
    at,
    movedColor,
    prevMoveNumber,
    nextStatus,
  );
}

export function expireDarkCrazyhouseClock(
  clock: DarkCrazyhouseClockState | undefined,
  at: number,
  color: Color,
): DarkCrazyhouseClockState | undefined {
  return expireTenantClock(clock, at, color);
}

export function freezeDarkCrazyhouseClock(
  clock: DarkCrazyhouseClockState | undefined,
  at: number,
): DarkCrazyhouseClockState | undefined {
  return freezeTenantClock(clock, at);
}

export function darkCrazyhouseClockRemainingMs(
  clock: DarkCrazyhouseClockState,
  color: Color,
  at: number,
): number {
  return tenantClockRemainingMs(clock, color, at);
}

export function createDarkCrazyhouseRuntimeRoom(
  roomId: string,
  options: {
    creatorPreference?: DarkCrazyhouseCreatorPreference;
    now?: number;
    timeControl?: RoomTimeControl;
  } = {},
): DarkCrazyhouseRoomCreation {
  const created = createTenantRuntimeRoom(darkCrazyhouseTenant, roomId, options);
  if (!created.ok) return { ok: false, error: 'dark_crazyhouse_disabled' };
  return created;
}

export function createDarkCrazyhouseRuntimeRoomFromEvents(
  events: readonly DarkCrazyhouseEvent[],
  projection = replayDarkCrazyhouseEvents(events),
): DarkCrazyhouseRoomHydration {
  return createTenantRuntimeRoomFromEvents(darkCrazyhouseTenant, events, projection);
}

export function appendDarkCrazyhouseRuntimeEvent(
  room: DarkCrazyhouseRuntimeRoom,
  event: DarkCrazyhouseEvent,
): number {
  return appendTenantRuntimeEvent(darkCrazyhouseTenant, room, event);
}

export function isDarkCrazyhouseEventLog(
  events: readonly unknown[],
  roomId?: string,
): events is readonly DarkCrazyhouseEvent[] {
  return isTenantEventLog(darkCrazyhouseTenant, events, roomId);
}

export function isDarkCrazyhouseEvent(
  value: unknown,
  roomId?: string,
): value is DarkCrazyhouseEvent {
  return isTenantEvent(darkCrazyhouseTenant, value, roomId);
}

export function replayDarkCrazyhouseEvents(
  events: readonly DarkCrazyhouseEvent[],
): DarkCrazyhouseProjection {
  return replayTenantEvents(darkCrazyhouseTenant, events);
}

export function applyDarkCrazyhouseEvent(
  projection: DarkCrazyhouseProjection,
  event: DarkCrazyhouseEvent,
): DarkCrazyhouseProjection {
  return applyTenantEvent(darkCrazyhouseTenant, projection, event);
}

export function darkCrazyhouseSnapshotPayload(
  room: DarkCrazyhouseRuntimeRoom,
  client: DarkCrazyhouseSnapshotClient,
): DarkCrazyhouseSnapshotPayload {
  return tenantSnapshotPayload(darkCrazyhouseTenant, room, client);
}

export function darkCrazyhouseEventsForClient(
  room: DarkCrazyhouseRuntimeRoom,
  client: DarkCrazyhouseSnapshotClient,
): DarkCrazyhouseClientEvent[] {
  return tenantEventsForClient(darkCrazyhouseTenant, room, client);
}

export function darkCrazyhousePlyAtEventIndex(
  events: readonly DarkCrazyhouseEvent[],
  eventIndex: number,
): number {
  return tenantPlyAtEventIndex(events, eventIndex);
}
