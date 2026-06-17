/**
 * Generic event writer for tenant rooms: persistence-first append serialized
 * through room.pendingWrites, lifecycle re-arming, engine-reservation release
 * on game end, and the terminal GameSummary build. Persistence kinds/labels
 * come from the tenant so structured logs keep their per-variant identity.
 */

import { clockPolicyKindFor } from '@mistboard/game';
import { logger } from '../obs.js';
import * as persistence from '../persistence.js';
import { releaseLiveEngineReservation } from '../server-live-engine-reservations.js';
import { tenantDurableDeadlineFor } from './lifecycle.js';
import { appendTenantRuntimeEvent } from './runtime.js';
import type {
  TenantGameStateLike,
  TenantRoomEvent,
  TenantRuntimeRoom,
  TenantSeatTokenState,
  VariantTenant,
} from './tenant.js';

export type TenantEventWriterPersistence<C extends string, M, Spec extends string = string> = {
  abortRunningGame(
    roomId: string,
    options: { abortedReason: string; endedAt?: Date; termination: 'abandoned' },
  ): Promise<boolean>;
  appendRoomEvent(roomId: string, seq: number, event: TenantRoomEvent<C, M, Spec>): Promise<void>;
  deleteRoomDeadline(roomId: string): Promise<void>;
  isInitialized(): boolean;
  recordGameEnd(roomId: string, summary: persistence.GameSummary): Promise<void>;
  upsertRoomDeadline(record: {
    roomId: string;
    gameSpecId: string;
    seat: string;
    seatUserId: string | null;
    dueAt: Date;
  }): Promise<void>;
  upsertRoomSeatToken(
    roomId: string,
    token: persistence.RoomSeatTokenRecord<C & persistence.RoomSeatTokenSeat>,
  ): Promise<void>;
};

export type TenantEventWriterContext<
  Kind extends string,
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  Spec extends string = string,
> = {
  logDeadlineRowFailure?(roomId: string, err: Error): void;
  logGameAbortRecordFailure?(roomId: string, err: Error): void;
  logGameEndRecordFailure?(roomId: string, err: Error): void;
  persistence?: TenantEventWriterPersistence<C, M, Spec>;
  scheduleLifecycleTimers?(room: TenantRuntimeRoom<Kind, C, M, State, Spec>): void;
};

export async function appendTenantEvent<
  Kind extends string,
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  View,
  Spec extends string,
>(
  tenant: VariantTenant<Kind, C, M, State, View, Spec>,
  room: TenantRuntimeRoom<Kind, C, M, State, Spec>,
  event: TenantRoomEvent<C, M, Spec>,
  ctx: TenantEventWriterContext<Kind, C, M, State, Spec> = {},
): Promise<number> {
  const writer = contextWithDefaults(tenant, ctx);
  const write = room.pendingWrites.then(async () => {
    const seq = room.events.length;
    if (writer.persistence.isInitialized()) {
      await writer.persistence.appendRoomEvent(room.id, seq, event);
    }
    const appendedSeq = appendTenantRuntimeEvent(tenant, room, event);
    writer.scheduleLifecycleTimers(room);
    // PvE: free the engine seat reservation the moment the game ends, so a
    // finished/aborted game doesn't tie up a global engine seat until its TTL.
    // Idempotent via the null guard; harmless for PvP (no reservation).
    const endStatus = room.projection.state.status.type;
    if ((endStatus === 'finished' || endStatus === 'aborted') && room.engineReservationId) {
      releaseLiveEngineReservation(
        room.engineReservationId,
        `${tenant.engine?.reservationReleaseTag ?? tenant.kind}-${endStatus}`,
      );
      room.engineReservationId = null;
    }
    if (
      writer.persistence.isInitialized() &&
      room.projection.state.status.type === 'finished' &&
      !room.gameEndRecorded
    ) {
      // Claim the record up front so a concurrent event can't double-write, but
      // RETRY the write itself: the games row is the only record of a finished
      // game's result, so a single transient DB hiccup must not silently drop it
      // forever (a finished game emits no further events to trigger a re-attempt).
      room.gameEndRecorded = true;
      const summary =
        tenant.persistence.buildGameSummary?.(room) ?? buildTenantGameSummary(tenant, room);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await writer.persistence.recordGameEnd(room.id, summary);
          break;
        } catch (err) {
          if (attempt === 2) {
            writer.logGameEndRecordFailure(room.id, err as Error);
          } else {
            await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
          }
        }
      }
    }
    if (room.projection.state.status.type === 'aborted' && !room.gameEndRecorded) {
      room.gameEndRecorded = true;
      // Aborts flip the running games row (status='aborted', no result)
      // instead of recordGameEnd — mirrors the chess stack. No-op for rooms
      // that never recorded a game start.
      if (writer.persistence.isInitialized()) {
        try {
          await writer.persistence.abortRunningGame(room.id, {
            abortedReason: room.projection.state.status.reason,
            termination: 'abandoned',
          });
        } catch (err) {
          writer.logGameAbortRecordFailure(room.id, err as Error);
        }
      }
    }
    await maintainTenantDeadlineRow(tenant, room, writer);
    return appendedSeq;
  });
  room.pendingWrites = write.then(
    () => undefined,
    () => undefined,
  );
  return write;
}

export async function appendTenantSeatAssigned<
  Kind extends string,
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  View,
  Spec extends string,
>(
  tenant: VariantTenant<Kind, C, M, State, View, Spec>,
  room: TenantRuntimeRoom<Kind, C, M, State, Spec>,
  args: {
    event: Extract<TenantRoomEvent<C, M, Spec>, { type: 'seat-assigned' }>;
    tokenState: TenantSeatTokenState<C>;
  },
  ctx: TenantEventWriterContext<Kind, C, M, State, Spec> = {},
): Promise<number> {
  const writer = contextWithDefaults(tenant, ctx);
  const write = room.pendingWrites.then(async () => {
    const seq = room.events.length;
    if (writer.persistence.isInitialized()) {
      await writer.persistence.appendRoomEvent(room.id, seq, args.event);
      await writer.persistence.upsertRoomSeatToken(
        room.id,
        persistenceRecordForTenantSeatToken(args.tokenState),
      );
    }
    const appendedSeq = appendTenantRuntimeEvent(tenant, room, args.event);
    room.seatTokens[args.event.seat] = args.tokenState;
    writer.scheduleLifecycleTimers(room);
    // A seat fill can open the first-move window (the room becomes fully
    // seated), so the durable deadline row is maintained here too.
    await maintainTenantDeadlineRow(tenant, room, writer);
    return appendedSeq;
  });
  room.pendingWrites = write.then(
    () => undefined,
    () => undefined,
  );
  return write;
}

export function buildTenantGameSummary<
  Kind extends string,
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  View,
  Spec extends string,
>(
  tenant: VariantTenant<Kind, C, M, State, View, Spec>,
  room: TenantRuntimeRoom<Kind, C, M, State, Spec>,
): persistence.GameSummary {
  const status = room.projection.state.status;
  if (status.type !== 'finished') {
    throw new Error(`buildTenantGameSummary called on non-terminal ${tenant.kind} state`);
  }
  const moveEvents = room.events.filter((event) => event.type === 'move-played');
  const firstAt = room.events[0]?.at ?? Date.now();
  const lastAt = room.events[room.events.length - 1]?.at ?? Date.now();
  const engineSeat = tenantEngineSeat(tenant, room);
  const mode = engineSeat ? 'pve' : 'pvp';
  const visibility: persistence.GameVisibility = mode === 'pve' ? 'public' : 'private';
  const participants = tenant.colors.map((color) =>
    tenantParticipant(tenant, color, room, visibility),
  );
  const rated =
    room.rated &&
    !engineSeat &&
    participants.every((participant) => participant.subjectType === 'user');
  return {
    variant: tenant.gameSpecId,
    mode,
    result: tenant.persistence.resultForWinner(status.winner),
    termination: tenant.persistence.termination(status.reason),
    plyCount: moveEvents.length,
    startedAt: new Date(firstAt),
    endedAt: new Date(lastAt),
    whiteClient: null,
    blackClient: null,
    whiteName: null,
    blackName: null,
    corpusId: null,
    initialMs: room.projection.timeControl?.initialMs ?? null,
    incrementMs: room.projection.timeControl?.incrementMs ?? null,
    rated,
    visibility,
    participants,
  };
}

export function recordTenantPersistenceError(
  tenant: { persistence: { logKindPrefix: string; logLabel: string } },
  roomId: string,
  seq: number,
  eventType: string,
  err: Error,
): void {
  logger.error(
    {
      kind: `${tenant.persistence.logKindPrefix}_persistence_failure`,
      room_id: roomId,
      seq,
      event_type: eventType,
      error: err.message,
    },
    `${tenant.persistence.logLabel} persistence failure`,
  );
}

function contextWithDefaults<
  Kind extends string,
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  Spec extends string,
>(
  tenant: { persistence: { logKindPrefix: string; logLabel: string } },
  ctx: TenantEventWriterContext<Kind, C, M, State, Spec>,
): Required<TenantEventWriterContext<Kind, C, M, State, Spec>> {
  return {
    logDeadlineRowFailure: (roomId, err) => logTenantDeadlineRowFailure(tenant, roomId, err),
    logGameAbortRecordFailure: (roomId, err) =>
      logTenantGameAbortRecordFailure(tenant, roomId, err),
    logGameEndRecordFailure: (roomId, err) => logTenantGameEndRecordFailure(tenant, roomId, err),
    persistence,
    scheduleLifecycleTimers: () => {},
    ...ctx,
  };
}

// Maintain the durable room_deadlines row for days-per-move rooms: upsert
// while the room has an enforceable deadline, delete once it doesn't
// (terminal, or back to waiting on a seat). Best-effort by design — the
// event log is the source of truth and the sweeper re-derives before acting,
// so a failed row write must never fail the move that caused it.
async function maintainTenantDeadlineRow<
  Kind extends string,
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  View,
  Spec extends string,
>(
  tenant: VariantTenant<Kind, C, M, State, View, Spec>,
  room: TenantRuntimeRoom<Kind, C, M, State, Spec>,
  writer: Required<TenantEventWriterContext<Kind, C, M, State, Spec>>,
): Promise<void> {
  if (!writer.persistence.isInitialized()) return;
  if (clockPolicyKindFor(room.projection.timeControl) !== 'days-per-move') return;
  try {
    const deadline = tenantDurableDeadlineFor(tenant, room);
    if (deadline) {
      await writer.persistence.upsertRoomDeadline({
        roomId: room.id,
        gameSpecId: room.gameSpecId,
        seat: deadline.seat,
        seatUserId: room.seatTokens[deadline.seat]?.userId ?? null,
        dueAt: new Date(deadline.dueAt),
      });
    } else {
      await writer.persistence.deleteRoomDeadline(room.id);
    }
  } catch (err) {
    writer.logDeadlineRowFailure(room.id, err as Error);
  }
}

function logTenantDeadlineRowFailure(
  tenant: { persistence: { logKindPrefix: string; logLabel: string } },
  roomId: string,
  err: Error,
): void {
  logger.error(
    {
      kind: `${tenant.persistence.logKindPrefix}_deadline_row_failure`,
      room_id: roomId,
      error: err.message,
      at: Date.now(),
    },
    `${tenant.persistence.logLabel} deadline row failure`,
  );
}

function logTenantGameAbortRecordFailure(
  tenant: { persistence: { logKindPrefix: string; logLabel: string } },
  roomId: string,
  err: Error,
): void {
  logger.error(
    {
      kind: `${tenant.persistence.logKindPrefix}_game_abort_record_failure`,
      room_id: roomId,
      error: err.message,
      at: Date.now(),
    },
    `${tenant.persistence.logLabel} game abort record failure`,
  );
}

function logTenantGameEndRecordFailure(
  tenant: { persistence: { logKindPrefix: string; logLabel: string } },
  roomId: string,
  err: Error,
): void {
  logger.error(
    {
      kind: `${tenant.persistence.logKindPrefix}_game_end_record_failure`,
      room_id: roomId,
      error: err.message,
      at: Date.now(),
    },
    `${tenant.persistence.logLabel} game end record failure`,
  );
}

function tenantParticipant<
  Kind extends string,
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  View,
  Spec extends string,
>(
  tenant: VariantTenant<Kind, C, M, State, View, Spec>,
  color: C,
  room: TenantRuntimeRoom<Kind, C, M, State, Spec>,
  visibility: persistence.GameVisibility,
): persistence.GameParticipant {
  const seatedClientId = room.projection.seats[color];
  if (seatedClientId && tenant.engine?.isEngineClientId(seatedClientId)) {
    return {
      color: color as persistence.GameParticipantColor,
      displayName: tenant.engine.displayName(seatedClientId),
      subjectType: 'engine-version',
      subjectId: seatedClientId,
      visibility,
    };
  }
  const token = room.seatTokens[color];
  if (token?.userId) {
    return {
      color: color as persistence.GameParticipantColor,
      displayName: token.userDisplayName ?? token.userHandle ?? 'Player',
      subjectType: 'user',
      subjectId: token.userId,
      visibility,
    };
  }
  return {
    color: color as persistence.GameParticipantColor,
    displayName: 'Guest',
    subjectType: 'guest',
    subjectId: null,
    visibility,
  };
}

function tenantEngineSeat<
  Kind extends string,
  C extends string,
  M,
  State extends TenantGameStateLike<C>,
  View,
  Spec extends string,
>(
  tenant: VariantTenant<Kind, C, M, State, View, Spec>,
  room: TenantRuntimeRoom<Kind, C, M, State, Spec>,
): C | null {
  if (!tenant.engine) return null;
  for (const color of tenant.colors) {
    if (tenant.engine.isEngineClientId(room.projection.seats[color])) return color;
  }
  return null;
}

export function persistenceRecordForTenantSeatToken<C extends string>(
  token: TenantSeatTokenState<C>,
): persistence.RoomSeatTokenRecord<C & persistence.RoomSeatTokenSeat> {
  return {
    seat: token.seat as C & persistence.RoomSeatTokenSeat,
    clientId: token.clientId,
    tokenHash: token.tokenHash,
    userId: token.userId,
    userHandle: token.userHandle,
    userDisplayName: token.userDisplayName,
    issuedAt: token.issuedAt,
    lastSeenAt: token.lastSeenAt,
    revokedAt: token.revokedAt,
  };
}
