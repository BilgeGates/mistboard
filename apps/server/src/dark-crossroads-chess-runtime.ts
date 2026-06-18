/**
 * Thin adapter over the generic VariantTenant runtime (variant-tenant/) for
 * hidden Dark Crossroads Chess (6x8) — the fog sibling of perfect-information
 * Crossroads Chess, built on the Dark Xiangqi adapter pattern.
 *
 * Every export delegates to the tenant-generic runtime bound to
 * darkCrossroadsChessTenant. Wire parity is pinned by
 * dark-crossroads-chess-golden-wire.test.ts: snapshot = the tenant core
 * payload with NO extras, per-seat move-played redaction, the fog player view
 * (color-only shrouded silhouettes), own-moves-only lastMove, and seat-vacated
 * acceptance.
 */

import type {
  CrossroadsChessColor,
  CrossroadsChessGameState,
  CrossroadsChessGameStatus,
  CrossroadsChessMove,
  DARK_CROSSROADS_CHESS_SPEC_ID,
  RoomTimeControl,
} from '@mistboard/game';
import {
  DARK_CROSSROADS_CHESS_ROOM_ID_PREFIX,
  type DarkCrossroadsChessWirePlayerView,
  darkCrossroadsChessClientEventFor,
  darkCrossroadsChessTenant,
  getDarkCrossroadsChessClientView,
} from './dark-crossroads-chess-tenant.js';
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

export type { DarkCrossroadsChessWirePlayerView };
export {
  DARK_CROSSROADS_CHESS_ROOM_ID_PREFIX,
  darkCrossroadsChessClientEventFor,
  getDarkCrossroadsChessClientView,
};

type DarkCrossroadsChessSpecId = typeof DARK_CROSSROADS_CHESS_SPEC_ID;

export type DarkCrossroadsChessSeat = TenantSeat<CrossroadsChessColor>;
export type DarkCrossroadsChessCreatorPreference = CrossroadsChessColor | 'random';
export type DarkCrossroadsChessClockState = TenantClockState<CrossroadsChessColor>;
export type DarkCrossroadsChessEvent = TenantRoomEvent<
  CrossroadsChessColor,
  CrossroadsChessMove,
  DarkCrossroadsChessSpecId
>;
export type DarkCrossroadsChessClientEvent = TenantClientEvent<
  CrossroadsChessColor,
  CrossroadsChessMove,
  DarkCrossroadsChessSpecId
>;
export type DarkCrossroadsChessProjection = TenantProjection<
  CrossroadsChessColor,
  CrossroadsChessGameState,
  DarkCrossroadsChessSpecId
>;
export type DarkCrossroadsChessClientRef = TenantClientRef<CrossroadsChessColor>;
export type DarkCrossroadsChessSeatTokenState = TenantSeatTokenState<CrossroadsChessColor>;
export type DarkCrossroadsChessRuntimeRoom = TenantRuntimeRoom<
  'dark-crossroads-chess',
  CrossroadsChessColor,
  CrossroadsChessMove,
  CrossroadsChessGameState,
  DarkCrossroadsChessSpecId
>;
export type DarkCrossroadsChessSnapshotClient = TenantSnapshotClient<CrossroadsChessColor>;
// Dark Crossroads' snapshot is exactly the tenant core payload — no extras
// (golden-pinned: no mode/pveEngineId/rated/forfeitDeadline/rematch keys).
export type DarkCrossroadsChessSnapshotPayload = TenantSnapshotPayload<
  CrossroadsChessColor,
  CrossroadsChessMove,
  DarkCrossroadsChessWirePlayerView,
  DarkCrossroadsChessSpecId
>;

export type DarkCrossroadsChessRoomCreation =
  | { ok: true; room: DarkCrossroadsChessRuntimeRoom }
  | { ok: false; error: 'dark_crossroads_chess_disabled' };

export type DarkCrossroadsChessRoomHydration = TenantRoomHydration<
  'dark-crossroads-chess',
  CrossroadsChessColor,
  CrossroadsChessMove,
  CrossroadsChessGameState,
  DarkCrossroadsChessSpecId
>;

export function isDarkCrossroadsChessRoomId(roomId: string): boolean {
  return isTenantRoomId(darkCrossroadsChessTenant, roomId);
}

export function createDarkCrossroadsChessClock(
  _at: number,
  initialMs: number,
  incrementMs: number,
): DarkCrossroadsChessClockState {
  return createTenantClock(darkCrossroadsChessTenant, initialMs, incrementMs);
}

export function nextDarkCrossroadsChessClockForMove(
  clock: DarkCrossroadsChessClockState | undefined,
  at: number,
  movedColor: CrossroadsChessColor,
  prevMoveNumber: number,
  nextStatus: CrossroadsChessGameStatus,
): DarkCrossroadsChessClockState | undefined {
  return nextTenantClockForMove(
    darkCrossroadsChessTenant,
    clock,
    at,
    movedColor,
    prevMoveNumber,
    nextStatus,
  );
}

export function expireDarkCrossroadsChessClock(
  clock: DarkCrossroadsChessClockState | undefined,
  at: number,
  color: CrossroadsChessColor,
): DarkCrossroadsChessClockState | undefined {
  return expireTenantClock(clock, at, color);
}

export function freezeDarkCrossroadsChessClock(
  clock: DarkCrossroadsChessClockState | undefined,
  at: number,
): DarkCrossroadsChessClockState | undefined {
  return freezeTenantClock(clock, at);
}

export function darkCrossroadsChessClockRemainingMs(
  clock: DarkCrossroadsChessClockState,
  color: CrossroadsChessColor,
  at: number,
): number {
  return tenantClockRemainingMs(clock, color, at);
}

export function createDarkCrossroadsChessRuntimeRoom(
  roomId: string,
  options: {
    creatorPreference?: DarkCrossroadsChessCreatorPreference;
    now?: number;
    timeControl?: RoomTimeControl;
  } = {},
): DarkCrossroadsChessRoomCreation {
  const created = createTenantRuntimeRoom(darkCrossroadsChessTenant, roomId, options);
  if (!created.ok) return { ok: false, error: 'dark_crossroads_chess_disabled' };
  return created;
}

export function createDarkCrossroadsChessRuntimeRoomFromEvents(
  events: readonly DarkCrossroadsChessEvent[],
  projection = replayDarkCrossroadsChessEvents(events),
): DarkCrossroadsChessRoomHydration {
  return createTenantRuntimeRoomFromEvents(darkCrossroadsChessTenant, events, projection);
}

export function appendDarkCrossroadsChessRuntimeEvent(
  room: DarkCrossroadsChessRuntimeRoom,
  event: DarkCrossroadsChessEvent,
): number {
  return appendTenantRuntimeEvent(darkCrossroadsChessTenant, room, event);
}

export function isDarkCrossroadsChessEventLog(
  events: readonly unknown[],
  roomId?: string,
): events is readonly DarkCrossroadsChessEvent[] {
  return isTenantEventLog(darkCrossroadsChessTenant, events, roomId);
}

export function isDarkCrossroadsChessEvent(
  value: unknown,
  roomId?: string,
): value is DarkCrossroadsChessEvent {
  return isTenantEvent(darkCrossroadsChessTenant, value, roomId);
}

export function replayDarkCrossroadsChessEvents(
  events: readonly DarkCrossroadsChessEvent[],
): DarkCrossroadsChessProjection {
  return replayTenantEvents(darkCrossroadsChessTenant, events);
}

export function applyDarkCrossroadsChessEvent(
  projection: DarkCrossroadsChessProjection,
  event: DarkCrossroadsChessEvent,
): DarkCrossroadsChessProjection {
  return applyTenantEvent(darkCrossroadsChessTenant, projection, event);
}

export function darkCrossroadsChessSnapshotPayload(
  room: DarkCrossroadsChessRuntimeRoom,
  client: DarkCrossroadsChessSnapshotClient,
): DarkCrossroadsChessSnapshotPayload {
  return tenantSnapshotPayload(darkCrossroadsChessTenant, room, client);
}

export function darkCrossroadsChessEventsForClient(
  room: DarkCrossroadsChessRuntimeRoom,
  client: DarkCrossroadsChessSnapshotClient,
): DarkCrossroadsChessClientEvent[] {
  return tenantEventsForClient(darkCrossroadsChessTenant, room, client);
}

export function darkCrossroadsChessPlyAtEventIndex(
  events: readonly DarkCrossroadsChessEvent[],
  eventIndex: number,
): number {
  return tenantPlyAtEventIndex(events, eventIndex);
}
