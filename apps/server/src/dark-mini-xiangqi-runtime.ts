/**
 * Thin adapter over the generic VariantTenant runtime (variant-tenant/) for
 * Dark Mini Xiangqi — the P0 reference migration of the Layer-3 extraction.
 *
 * Every export keeps its pre-migration name and signature so call sites and
 * tests are untouched; the implementations delegate to the tenant-generic
 * runtime bound to darkMiniXiangqiTenant. Wire parity with the pre-migration
 * stack is pinned by dark-mini-xiangqi-golden-wire.test.ts. DMX-specific fog
 * policy (event redaction, spectator empty view, lastMove stripping) lives in
 * dark-mini-xiangqi-tenant.ts, not here.
 */

import type {
  DARK_MINI_XIANGQI_SPEC_ID,
  MiniXiangqiColor,
  MiniXiangqiGameState,
  MiniXiangqiGameStatus,
  MiniXiangqiMove,
  MiniXiangqiPlayerView,
  RoomTimeControl,
} from '@mistboard/game';
import {
  DARK_MINI_XIANGQI_ROOM_ID_PREFIX,
  darkMiniXiangqiClientEventFor,
  darkMiniXiangqiTenant,
  getDarkMiniXiangqiClientView,
  isMiniXiangqiSquare,
} from './dark-mini-xiangqi-tenant.js';
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

export {
  DARK_MINI_XIANGQI_ROOM_ID_PREFIX,
  darkMiniXiangqiClientEventFor,
  getDarkMiniXiangqiClientView,
  isMiniXiangqiSquare,
};

type DarkMiniXiangqiSpecId = typeof DARK_MINI_XIANGQI_SPEC_ID;

export type DarkMiniXiangqiSeat = TenantSeat<MiniXiangqiColor>;
export type DarkMiniXiangqiCreatorPreference = MiniXiangqiColor | 'random';
export type DarkMiniXiangqiClockState = TenantClockState<MiniXiangqiColor>;
export type DarkMiniXiangqiEvent = TenantRoomEvent<
  MiniXiangqiColor,
  MiniXiangqiMove,
  DarkMiniXiangqiSpecId
>;
export type DarkMiniXiangqiClientEvent = TenantClientEvent<
  MiniXiangqiColor,
  MiniXiangqiMove,
  DarkMiniXiangqiSpecId
>;
export type DarkMiniXiangqiProjection = TenantProjection<
  MiniXiangqiColor,
  MiniXiangqiGameState,
  DarkMiniXiangqiSpecId
>;
export type DarkMiniXiangqiClientRef = TenantClientRef<MiniXiangqiColor>;
export type DarkMiniXiangqiSeatTokenState = TenantSeatTokenState<MiniXiangqiColor>;
export type DarkMiniXiangqiRematchOffer = TenantRematchOffer;
export type DarkMiniXiangqiRematchPendingRedirect = TenantRematchPendingRedirect<MiniXiangqiColor>;
export type DarkMiniXiangqiRematchState = TenantRematchState<MiniXiangqiColor>;
export type DarkMiniXiangqiRuntimeRoom = TenantRuntimeRoom<
  'dark-mini-xiangqi',
  MiniXiangqiColor,
  MiniXiangqiMove,
  MiniXiangqiGameState,
  DarkMiniXiangqiSpecId
>;
export type DarkMiniXiangqiSnapshotClient = TenantSnapshotClient<MiniXiangqiColor>;
export type DarkMiniXiangqiSnapshotPayload = TenantSnapshotPayload<
  MiniXiangqiColor,
  MiniXiangqiMove,
  MiniXiangqiPlayerView,
  DarkMiniXiangqiSpecId
>;

export type DarkMiniXiangqiRoomCreation =
  | { ok: true; room: DarkMiniXiangqiRuntimeRoom }
  | { ok: false; error: 'dark_mini_xiangqi_disabled' };

export type DarkMiniXiangqiRoomHydration = TenantRoomHydration<
  'dark-mini-xiangqi',
  MiniXiangqiColor,
  MiniXiangqiMove,
  MiniXiangqiGameState,
  DarkMiniXiangqiSpecId
>;

export function isDarkMiniXiangqiRoomId(roomId: string): boolean {
  return isTenantRoomId(darkMiniXiangqiTenant, roomId);
}

export function createDarkMiniXiangqiClock(
  _at: number,
  initialMs: number,
  incrementMs: number,
): DarkMiniXiangqiClockState {
  return createTenantClock(darkMiniXiangqiTenant, initialMs, incrementMs);
}

export function nextDarkMiniXiangqiClockForMove(
  clock: DarkMiniXiangqiClockState | undefined,
  at: number,
  movedColor: MiniXiangqiColor,
  prevMoveNumber: number,
  nextStatus: MiniXiangqiGameStatus,
): DarkMiniXiangqiClockState | undefined {
  return nextTenantClockForMove(
    darkMiniXiangqiTenant,
    clock,
    at,
    movedColor,
    prevMoveNumber,
    nextStatus,
  );
}

export function expireDarkMiniXiangqiClock(
  clock: DarkMiniXiangqiClockState | undefined,
  at: number,
  color: MiniXiangqiColor,
): DarkMiniXiangqiClockState | undefined {
  return expireTenantClock(clock, at, color);
}

export function freezeDarkMiniXiangqiClock(
  clock: DarkMiniXiangqiClockState | undefined,
  at: number,
): DarkMiniXiangqiClockState | undefined {
  return freezeTenantClock(clock, at);
}

export function darkMiniXiangqiClockRemainingMs(
  clock: DarkMiniXiangqiClockState,
  color: MiniXiangqiColor,
  at: number,
): number {
  return tenantClockRemainingMs(clock, color, at);
}

export function createDarkMiniXiangqiRuntimeRoom(
  roomId: string,
  options: {
    creatorPreference?: DarkMiniXiangqiCreatorPreference;
    now?: number;
    rated?: boolean;
    timeControl?: RoomTimeControl;
  } = {},
): DarkMiniXiangqiRoomCreation {
  const created = createTenantRuntimeRoom(darkMiniXiangqiTenant, roomId, options);
  if (!created.ok) return { ok: false, error: 'dark_mini_xiangqi_disabled' };
  return created;
}

export function createDarkMiniXiangqiRuntimeRoomFromEvents(
  events: readonly DarkMiniXiangqiEvent[],
  projection = replayDarkMiniXiangqiEvents(events),
): DarkMiniXiangqiRoomHydration {
  return createTenantRuntimeRoomFromEvents(darkMiniXiangqiTenant, events, projection);
}

export function appendDarkMiniXiangqiRuntimeEvent(
  room: DarkMiniXiangqiRuntimeRoom,
  event: DarkMiniXiangqiEvent,
): number {
  return appendTenantRuntimeEvent(darkMiniXiangqiTenant, room, event);
}

export function replayDarkMiniXiangqiEvents(
  events: readonly DarkMiniXiangqiEvent[],
): DarkMiniXiangqiProjection {
  return replayTenantEvents(darkMiniXiangqiTenant, events);
}

export function applyDarkMiniXiangqiEvent(
  projection: DarkMiniXiangqiProjection,
  event: DarkMiniXiangqiEvent,
): DarkMiniXiangqiProjection {
  return applyTenantEvent(darkMiniXiangqiTenant, projection, event);
}

export function darkMiniXiangqiSnapshotPayload(
  room: DarkMiniXiangqiRuntimeRoom,
  client: DarkMiniXiangqiSnapshotClient,
): DarkMiniXiangqiSnapshotPayload {
  return tenantSnapshotPayload(darkMiniXiangqiTenant, room, client);
}

export function darkMiniXiangqiEventsForClient(
  room: DarkMiniXiangqiRuntimeRoom,
  client: DarkMiniXiangqiSnapshotClient,
): DarkMiniXiangqiClientEvent[] {
  return tenantEventsForClient(darkMiniXiangqiTenant, room, client);
}

export function darkMiniXiangqiPlyAtEventIndex(
  events: readonly DarkMiniXiangqiEvent[],
  eventIndex: number,
): number {
  return tenantPlyAtEventIndex(events, eventIndex);
}

export function isDarkMiniXiangqiEventLog(
  events: readonly unknown[],
  roomId?: string,
): events is readonly DarkMiniXiangqiEvent[] {
  return isTenantEventLog(darkMiniXiangqiTenant, events, roomId);
}

export function isDarkMiniXiangqiEvent(
  value: unknown,
  roomId?: string,
): value is DarkMiniXiangqiEvent {
  return isTenantEvent(darkMiniXiangqiTenant, value, roomId);
}
