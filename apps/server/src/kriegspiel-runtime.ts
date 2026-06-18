/**
 * Thin adapter over the generic VariantTenant runtime (variant-tenant/) for
 * hidden Kriegspiel — built on the Dark Shogi / Dark Crossroads adapter pattern.
 * Every export delegates to the tenant-generic runtime bound to
 * kriegspielTenant. Wire parity is pinned by kriegspiel-golden-wire.test.ts.
 */

import type {
  Color,
  KRIEGSPIEL_SPEC_ID,
  KriegspielGameState,
  KriegspielGameStatus,
  RoomTimeControl,
} from '@mistboard/game';
import {
  getKriegspielClientView,
  KRIEGSPIEL_ROOM_ID_PREFIX,
  type KriegspielWireMove,
  type KriegspielWirePlayerView,
  kriegspielClientEventFor,
  kriegspielTenant,
} from './kriegspiel-tenant.js';
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

export type { KriegspielWirePlayerView };
export { getKriegspielClientView, KRIEGSPIEL_ROOM_ID_PREFIX, kriegspielClientEventFor };

type KriegspielSpecId = typeof KRIEGSPIEL_SPEC_ID;

export type KriegspielSeat = TenantSeat<Color>;
export type KriegspielCreatorPreference = Color | 'random';
export type KriegspielClockState = TenantClockState<Color>;
export type KriegspielEvent = TenantRoomEvent<Color, KriegspielWireMove, KriegspielSpecId>;
export type KriegspielClientEvent = TenantClientEvent<Color, KriegspielWireMove, KriegspielSpecId>;
export type KriegspielProjection = TenantProjection<Color, KriegspielGameState, KriegspielSpecId>;
export type KriegspielClientRef = TenantClientRef<Color>;
export type KriegspielSeatTokenState = TenantSeatTokenState<Color>;
export type KriegspielRuntimeRoom = TenantRuntimeRoom<
  'kriegspiel',
  Color,
  KriegspielWireMove,
  KriegspielGameState,
  KriegspielSpecId
>;
export type KriegspielSnapshotClient = TenantSnapshotClient<Color>;
export type KriegspielSnapshotPayload = TenantSnapshotPayload<
  Color,
  KriegspielWireMove,
  KriegspielWirePlayerView,
  KriegspielSpecId
>;

export type KriegspielRoomCreation =
  | { ok: true; room: KriegspielRuntimeRoom }
  | { ok: false; error: 'kriegspiel_disabled' };

export type KriegspielRoomHydration = TenantRoomHydration<
  'kriegspiel',
  Color,
  KriegspielWireMove,
  KriegspielGameState,
  KriegspielSpecId
>;

export function isKriegspielRoomId(roomId: string): boolean {
  return isTenantRoomId(kriegspielTenant, roomId);
}

export function createKriegspielClock(
  _at: number,
  initialMs: number,
  incrementMs: number,
): KriegspielClockState {
  return createTenantClock(kriegspielTenant, initialMs, incrementMs);
}

export function nextKriegspielClockForMove(
  clock: KriegspielClockState | undefined,
  at: number,
  movedColor: Color,
  prevMoveNumber: number,
  nextStatus: KriegspielGameStatus,
): KriegspielClockState | undefined {
  return nextTenantClockForMove(
    kriegspielTenant,
    clock,
    at,
    movedColor,
    prevMoveNumber,
    nextStatus,
  );
}

export function expireKriegspielClock(
  clock: KriegspielClockState | undefined,
  at: number,
  color: Color,
): KriegspielClockState | undefined {
  return expireTenantClock(clock, at, color);
}

export function freezeKriegspielClock(
  clock: KriegspielClockState | undefined,
  at: number,
): KriegspielClockState | undefined {
  return freezeTenantClock(clock, at);
}

export function kriegspielClockRemainingMs(
  clock: KriegspielClockState,
  color: Color,
  at: number,
): number {
  return tenantClockRemainingMs(clock, color, at);
}

export function createKriegspielRuntimeRoom(
  roomId: string,
  options: {
    creatorPreference?: KriegspielCreatorPreference;
    now?: number;
    timeControl?: RoomTimeControl;
  } = {},
): KriegspielRoomCreation {
  const created = createTenantRuntimeRoom(kriegspielTenant, roomId, options);
  if (!created.ok) return { ok: false, error: 'kriegspiel_disabled' };
  return created;
}

export function createKriegspielRuntimeRoomFromEvents(
  events: readonly KriegspielEvent[],
  projection = replayKriegspielEvents(events),
): KriegspielRoomHydration {
  return createTenantRuntimeRoomFromEvents(kriegspielTenant, events, projection);
}

export function appendKriegspielRuntimeEvent(
  room: KriegspielRuntimeRoom,
  event: KriegspielEvent,
): number {
  return appendTenantRuntimeEvent(kriegspielTenant, room, event);
}

export function isKriegspielEventLog(
  events: readonly unknown[],
  roomId?: string,
): events is readonly KriegspielEvent[] {
  return isTenantEventLog(kriegspielTenant, events, roomId);
}

export function isKriegspielEvent(value: unknown, roomId?: string): value is KriegspielEvent {
  return isTenantEvent(kriegspielTenant, value, roomId);
}

export function replayKriegspielEvents(events: readonly KriegspielEvent[]): KriegspielProjection {
  return replayTenantEvents(kriegspielTenant, events);
}

export function applyKriegspielEvent(
  projection: KriegspielProjection,
  event: KriegspielEvent,
): KriegspielProjection {
  return applyTenantEvent(kriegspielTenant, projection, event);
}

export function kriegspielSnapshotPayload(
  room: KriegspielRuntimeRoom,
  client: KriegspielSnapshotClient,
): KriegspielSnapshotPayload {
  return tenantSnapshotPayload(kriegspielTenant, room, client);
}

export function kriegspielEventsForClient(
  room: KriegspielRuntimeRoom,
  client: KriegspielSnapshotClient,
): KriegspielClientEvent[] {
  return tenantEventsForClient(kriegspielTenant, room, client);
}

export function kriegspielPlyAtEventIndex(
  events: readonly KriegspielEvent[],
  eventIndex: number,
): number {
  return tenantPlyAtEventIndex(events, eventIndex);
}
