import {
  advanceClock,
  type Chess960Start,
  type Color,
  capturedRoleFor,
  clockRemainingMs,
  createClock,
  expireClock,
  freezeClock,
  type GameEvent,
  type GameProjection,
  isGameEndReason,
  type Move,
  type PieceRole,
  replayGameEvents,
  type Square,
  unfreezeClock,
  variantForId,
} from '@mistboard/game';
import { engineVersionDisplayName, loadEngine } from './engine-registry.js';
import { chooseLiveEngineMove, type LiveEngineFallbackEvent } from './live-engine.js';
import { engineCounters, logger } from './obs.js';
import { eventAppendedPayload, snapshotPayload } from './payloads.js';
import type { GameSummary } from './persistence.js';
import * as persistence from './persistence.js';
import { isServerEngineClient, modeForProjection } from './server-policy.js';
import type { Client, Room, SeatTokenState } from './server-types.js';

export interface RoomManagerContext {
  send: (client: Client, payload: unknown) => void;
  recordPersistenceError: (roomId: string, seq: number, event: GameEvent, err: Error) => void;
  pveBuiltinEngineClientId: string;
  pveEngineMoveDelayMs: number;
  liveEngineTimeoutMs: number;
  liveClockInitialMs: number;
  liveClockIncrementMs: number;
}

export class PersistenceFailure extends Error {
  constructor() {
    super('persistence_failure');
    this.name = 'PersistenceFailure';
  }
}

// ── Pure helpers ───────────────────────────────────────────────────────────

export function offerForColor(projection: GameProjection, color: Color): Chess960Start[] {
  return projection.offers[color] ?? projection.offer;
}

export function roomIdToSeed(roomId: string): number {
  let hash = 0;
  for (const char of roomId) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return hash;
}

export function canClientAct(room: Room, client: Client): boolean {
  if (client.solo) return true;
  if (client.displaced) return false;
  if (client.seat === 'spectator') return false;
  if (isServerEngineClient(client.id)) return room.projection.seats[client.seat] === client.id;
  const token = room.seatTokens[client.seat];
  return token !== undefined && token.tokenHash === client.seatTokenHash;
}

function isPromotionRole(value: string | undefined): value is Exclude<PieceRole, 'king' | 'pawn'> {
  return value === 'queen' || value === 'rook' || value === 'bishop' || value === 'knight';
}

function liveEngineMoveSeed(room: Room): bigint {
  const ply = room.events.filter((event) => event.type === 'move-played').length;
  return (BigInt(roomIdToSeed(room.id) >>> 0) << 16n) + BigInt(ply);
}

async function sleepEngineThinkTime(
  startedAt: number,
  thinkTimeMs: number | undefined,
): Promise<void> {
  if (thinkTimeMs === undefined) return;
  const remainingMs = Math.max(0, Math.round(thinkTimeMs) - (Date.now() - startedAt));
  if (remainingMs <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, remainingMs));
}

export function clearRandomEngineTimer(room: Room): void {
  if (!room.engineTimer) return;
  clearTimeout(room.engineTimer);
  room.engineTimer = null;
}

/**
 * Returns the seat the engine plays for a PvE room ('white' or 'black'),
 * or null if not a PvE room or the engine seat isn't set in the projection yet.
 * Reads from the projection (populated by the seat-assigned event), so it
 * correctly reflects engineColor='white' rooms.
 */
export function engineSeatFor(room: Room): Color | null {
  if (!room.pveEngineId) return null;
  if (room.projection.seats.white === room.pveEngineId) return 'white';
  if (room.projection.seats.black === room.pveEngineId) return 'black';
  return null;
}

// ── Seat token helpers ─────────────────────────────────────────────────────

function persistenceRecordForSeatToken(token: SeatTokenState): persistence.RoomSeatTokenRecord {
  return {
    seat: token.seat,
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

function recordSeatTokenPersistenceError(roomId: string, seat: Color | null, err: Error): void {
  console.error(
    JSON.stringify({
      level: 'error',
      kind: 'seat_token_persistence_failure',
      roomId,
      seat,
      error: err.message,
      at: Date.now(),
    }),
  );
}

export function seatTokenStatesFromPersistence(
  tokens: Partial<Record<Color, persistence.RoomSeatTokenRecord>>,
): Partial<Record<Color, SeatTokenState>> {
  const states: Partial<Record<Color, SeatTokenState>> = {};
  for (const token of Object.values(tokens)) {
    if (!token || token.revokedAt) continue;
    states[token.seat] = {
      clientId: token.clientId,
      seat: token.seat,
      tokenHash: token.tokenHash,
      userId: token.userId,
      userHandle: token.userHandle,
      userDisplayName: token.userDisplayName,
      issuedAt: token.issuedAt,
      lastSeenAt: token.lastSeenAt,
      revokedAt: token.revokedAt,
    };
  }
  return states;
}

export async function persistSeatToken(
  _ctx: RoomManagerContext,
  room: Room,
  token: SeatTokenState,
): Promise<void> {
  if (!persistence.isInitialized()) return;
  try {
    await persistence.upsertRoomSeatToken(room.id, persistenceRecordForSeatToken(token));
  } catch (err) {
    recordSeatTokenPersistenceError(room.id, token.seat, err as Error);
    throw new PersistenceFailure();
  }
}

export async function touchSeatToken(
  _ctx: RoomManagerContext,
  room: Room,
  token: SeatTokenState,
): Promise<void> {
  if (!persistence.isInitialized()) return;
  try {
    await persistence.touchRoomSeatToken(room.id, token.seat, token.tokenHash, token.lastSeenAt);
  } catch (err) {
    recordSeatTokenPersistenceError(room.id, token.seat, err as Error);
    throw new PersistenceFailure();
  }
}

export async function replaceSeatTokens(
  _ctx: RoomManagerContext,
  room: Room,
  seatTokens: Partial<Record<Color, SeatTokenState>>,
): Promise<void> {
  if (!persistence.isInitialized()) return;
  try {
    const tokens: Partial<Record<Color, persistence.RoomSeatTokenRecord>> = {};
    for (const token of Object.values(seatTokens)) {
      if (token) tokens[token.seat] = persistenceRecordForSeatToken(token);
    }
    await persistence.replaceRoomSeatTokens(room.id, tokens);
  } catch (err) {
    recordSeatTokenPersistenceError(room.id, null, err as Error);
    throw new PersistenceFailure();
  }
}

export function reconciledSeatTokens(room: Room): Partial<Record<Color, SeatTokenState>> {
  const tokenByClientId = new Map<string, SeatTokenState>();
  for (const token of Object.values(room.seatTokens)) {
    if (token) tokenByClientId.set(token.clientId, token);
  }

  const nextTokens: Partial<Record<Color, SeatTokenState>> = {};
  for (const seat of ['white', 'black'] as const) {
    const clientId = room.projection.seats[seat];
    if (!clientId) continue;
    const token = tokenByClientId.get(clientId);
    if (!token) continue;
    nextTokens[seat] = { ...token, seat };
  }
  return nextTokens;
}

export async function reconcileClientSeats(ctx: RoomManagerContext, room: Room): Promise<void> {
  const nextTokens = reconciledSeatTokens(room);
  await replaceSeatTokens(ctx, room, nextTokens);
  room.seatTokens = nextTokens;
  for (const client of room.clients) {
    if (room.projection.seats.white === client.id) client.seat = 'white';
    if (room.projection.seats.black === client.id) client.seat = 'black';
  }
}

// ── Game summary ───────────────────────────────────────────────────────────

function inMemoryParticipant(
  color: Color,
  clientId: string | null,
  displayName: string | null,
  mode: persistence.GameMode,
  visibility: persistence.GameVisibility,
  pveBuiltinEngineClientId: string,
): persistence.GameParticipant {
  if (clientId && isServerEngineClient(clientId)) {
    const engineVersionId = clientId === 'random-engine' ? pveBuiltinEngineClientId : clientId;
    return {
      color,
      displayName: displayName ?? engineVersionDisplayName(engineVersionId),
      subjectType: 'engine-version',
      subjectId: engineVersionId,
      visibility,
    };
  }
  if (mode === 'imported' || mode === 'manual') {
    return {
      color,
      displayName: displayName ?? (color === 'white' ? 'White' : 'Black'),
      subjectType: mode,
      subjectId: null,
      visibility,
    };
  }
  return {
    color,
    displayName: displayName ?? 'Guest',
    subjectType: 'guest',
    subjectId: null,
    visibility,
  };
}

function participantForSeatToken(
  color: Color,
  clientId: string | null,
  token: SeatTokenState | undefined,
  mode: persistence.GameMode,
  pveBuiltinEngineClientId: string,
): persistence.GameParticipant {
  if (token?.userId) {
    return {
      color,
      displayName: token.userDisplayName ?? token.userHandle ?? 'Player',
      subjectType: 'user',
      subjectId: token.userId,
      visibility: 'public',
    };
  }
  return inMemoryParticipant(color, clientId, null, mode, 'public', pveBuiltinEngineClientId);
}

export function buildGameSummary(ctx: RoomManagerContext, room: Room): GameSummary {
  const status = room.projection.state.status;
  if (status.type !== 'finished') {
    throw new Error('buildGameSummary called on non-terminal state');
  }
  const result: GameSummary['result'] =
    status.winner === 'white' ? 'white-wins' : status.winner === 'black' ? 'black-wins' : 'draw';

  if (!isGameEndReason(status.reason)) {
    throw new Error(`unknown finished-game reason: ${String(status.reason)}`);
  }
  const termination: GameSummary['termination'] = status.reason;

  const moveEvents = room.events.filter((e) => e.type === 'move-played');
  const firstAt = room.events[0]?.at ?? Date.now();
  const lastAt = room.events[room.events.length - 1]?.at ?? Date.now();

  const participants = [
    participantForSeatToken(
      'white',
      room.projection.seats.white ?? null,
      room.seatTokens.white,
      room.mode,
      ctx.pveBuiltinEngineClientId,
    ),
    participantForSeatToken(
      'black',
      room.projection.seats.black ?? null,
      room.seatTokens.black,
      room.mode,
      ctx.pveBuiltinEngineClientId,
    ),
  ];
  // Rated play is human-vs-human only. Any engine seat forces casual.
  const rated = room.rated && !participants.some((p) => p.subjectType === 'engine-version');

  return {
    variant: room.projection.variant,
    mode: room.mode,
    result,
    termination,
    plyCount: moveEvents.length,
    startedAt: new Date(firstAt),
    endedAt: new Date(lastAt),
    whiteClient: room.projection.seats.white ?? null,
    blackClient: room.projection.seats.black ?? null,
    whiteName: null,
    blackName: null,
    corpusId: null,
    rated,
    initialMs: room.timeControl?.initialMs ?? null,
    incrementMs: room.timeControl?.incrementMs ?? null,
    hiddenDraft960: room.hiddenDraft960,
    participants,
  };
}

// ── Room event infrastructure ──────────────────────────────────────────────

export function seatDisplayNamesForRoom(
  room: Room,
  ctx: RoomManagerContext,
): Partial<Record<Color, string>> {
  const names: Partial<Record<Color, string>> = {};
  for (const color of ['white', 'black'] as Color[]) {
    const clientId = room.projection.seats[color];
    if (!clientId) continue;
    if (isServerEngineClient(clientId)) {
      const engineId = clientId === 'random-engine' ? ctx.pveBuiltinEngineClientId : clientId;
      names[color] = engineVersionDisplayName(engineId);
    } else {
      const token = room.seatTokens[color as Color];
      const name = token?.userDisplayName ?? token?.userHandle ?? null;
      if (name) names[color] = name;
    }
  }
  return names;
}

export function broadcastSnapshot(ctx: RoomManagerContext, room: Room): void {
  const seatDisplayNames = seatDisplayNamesForRoom(room, ctx);
  for (const client of room.clients) {
    ctx.send(client, snapshotPayload({ ...room, seatDisplayNames }, client));
  }
}

// Broadcast a paired-with-appendEvent state change. Sends one event-
// appended frame per newly-appended event in [fromSeq, room.events.length)
// to every connected client. Callers record fromSeq before any appendEvent
// calls; the range catches multi-event flows (selectStart →
// draft-start-selected then optional draft-start-resolved) without
// requiring helpers to thread seq through their signatures.
//
// Game-end transition (status flips to 'finished') falls back to a full
// snapshot for every recipient: a clean final-frame resync at the game
// boundary. Under model A the room stays fogged on finish (no reveal — the
// per-seat filter in payloads.ts applies at every status), so this snapshot
// is a robustness resync, not a reveal channel. The public reveal lives only
// at the /game/:id replay endpoint.
export function broadcastEventAppended(ctx: RoomManagerContext, room: Room, fromSeq: number): void {
  const seatDisplayNames = seatDisplayNamesForRoom(room, ctx);
  const enrichedRoom = { ...room, seatDisplayNames };
  const isGameEnd = room.projection.state.status.type === 'finished';
  for (const client of room.clients) {
    if (isGameEnd) {
      ctx.send(client, snapshotPayload(enrichedRoom, client));
      continue;
    }
    for (let seq = fromSeq; seq < room.events.length; seq += 1) {
      const event = room.events[seq];
      if (!event) continue;
      ctx.send(client, eventAppendedPayload(enrichedRoom, client, event, seq));
    }
  }
}

export async function appendEvent(
  ctx: RoomManagerContext,
  room: Room,
  event: GameEvent,
): Promise<void> {
  // Serialize per-room writes. Chaining onto pendingWrites guarantees
  // sequence assignment is atomic with the persistence write.
  const myWrite = room.pendingWrites.then(async () => {
    const seq = room.events.length;
    if (persistence.isInitialized()) {
      try {
        await persistence.appendEvent(room.id, seq, event);
      } catch (err) {
        ctx.recordPersistenceError(room.id, seq, event, err as Error);
        throw new PersistenceFailure();
      }
    }
    room.events.push(event);
    room.projection = replayGameEvents(room.events);
    room.mode = modeForProjection(room.projection);
    scheduleClockTimeout(ctx, room);
    {
      const engineSeat = engineSeatFor(room);
      if (
        room.projection.state.status.type !== 'playing' ||
        engineSeat === null ||
        room.projection.state.status.turn !== engineSeat
      ) {
        clearRandomEngineTimer(room);
      }
    }

    if (
      persistence.isInitialized() &&
      room.projection.state.status.type === 'finished' &&
      !room.gameEndRecorded
    ) {
      room.gameEndRecorded = true;
      try {
        await persistence.recordGameEnd(room.id, buildGameSummary(ctx, room));
      } catch (err) {
        // Events are durable; the games-row aggregate can be backfilled.
        // Log loudly so it's visible.
        console.error(
          JSON.stringify({
            level: 'error',
            kind: 'game_end_record_failure',
            roomId: room.id,
            error: (err as Error).message,
            at: Date.now(),
          }),
        );
      }
    }
  });
  // Don't break the chain if this write rejects — caller surfaces the error.
  room.pendingWrites = myWrite.catch(() => {});
  await myWrite;
}

export function scheduleClockTimeout(ctx: RoomManagerContext, room: Room): void {
  if (room.clockTimer) clearTimeout(room.clockTimer);
  room.clockTimer = null;

  const { clock, status } = room.projection.state;
  if (!clock || status.type !== 'playing' || !clock.activeColor) return;

  const activeColor = clock.activeColor;
  const delay = clockRemainingMs(clock, activeColor, Date.now());
  room.clockTimer = setTimeout(() => {
    if (room.projection.state.status.type !== 'playing') return;
    if (room.projection.paused) return;
    if (room.projection.state.status.turn !== activeColor) return;
    const fromSeq = room.events.length;
    void expireActiveClock(ctx, room, activeColor, Date.now())
      .then(() => broadcastEventAppended(ctx, room, fromSeq))
      .catch((err) => {
        if (!(err instanceof PersistenceFailure)) {
          console.error(
            JSON.stringify({
              level: 'error',
              kind: 'clock_expire_failure',
              roomId: room.id,
              error: (err as Error).message,
              at: Date.now(),
            }),
          );
        }
      });
  }, delay + 25);
  room.clockTimer.unref();
}

export async function expireActiveClock(
  ctx: RoomManagerContext,
  room: Room,
  color: Color,
  at: number,
): Promise<void> {
  const clock = expireClock(room.projection.state.clock, at, color);
  if (!clock) return;
  await appendEvent(ctx, room, {
    type: 'clock-expired',
    at,
    roomId: room.id,
    color,
    clock,
  });
}

// On hydrating a room post-restart, detect the case where a SIGKILL (or a
// crash before pauseRoomOnShutdown wrote its event) left an in-flight game
// stranded. Returns a possibly-extended events array — if the input ended
// mid-game with a stale last-event, a synthetic 'pause' is appended at
// lastEvent.at + 1 so the clock is frozen at the pre-crash moment (no
// outage-time charged to either player). Otherwise returns the input.
//
// The threshold guards against false positives: a player thinking deeply for
// 30 seconds shouldn't trigger recovery, but a 5-minute gap (longer than any
// realistic bullet/blitz move) almost certainly means the server died.
//
// Pure function — does not touch persistence. Callers persist the returned
// extra event before replaying state.
export function applyOrphanRecoveryIfNeeded(
  events: GameEvent[],
  now: number,
  orphanThresholdMs: number,
): GameEvent[] {
  if (events.length === 0) return events;
  const projection = replayGameEvents(events);
  if (projection.state.status.type !== 'playing') return events;
  if (projection.paused) return events;
  const lastEvent = events[events.length - 1]!;
  if (now - lastEvent.at < orphanThresholdMs) return events;
  // Synth a pause at lastEvent.at + 1. Clock freeze sees only 1ms elapsed
  // since the previous move, which is a rounding-error cost — far better than
  // attributing the entire outage to the active player.
  const pauseAt = lastEvent.at + 1;
  const frozenClock = freezeClock(projection.state.clock, pauseAt);
  const syntheticPause: GameEvent = {
    type: 'pause',
    at: pauseAt,
    roomId: lastEvent.roomId,
    reason: 'shutdown',
    ...(frozenClock ? { clock: frozenClock } : {}),
  };
  return [...events, syntheticPause];
}

// Pause a running room before server shutdown. No-op if not playing or
// already paused. The pause snapshot freezes the active clock so wall-clock
// time during the outage doesn't count against either player.
export async function pauseRoomOnShutdown(
  ctx: RoomManagerContext,
  room: Room,
  at: number,
): Promise<void> {
  if (room.projection.state.status.type !== 'playing') return;
  if (room.projection.paused) return;
  const frozenClock = freezeClock(room.projection.state.clock, at);
  await appendEvent(ctx, room, {
    type: 'pause',
    at,
    roomId: room.id,
    reason: 'shutdown',
    ...(frozenClock ? { clock: frozenClock } : {}),
  });
}

// Append a resume event for a paused room. Clears the pauseGraceTimer if set.
// Caller broadcasts the resulting snapshot.
export async function resumeRoom(
  ctx: RoomManagerContext,
  room: Room,
  at: number,
  reason: 'both-present' | 'grace-elapsed' | 'admin',
): Promise<void> {
  if (!room.projection.paused) return;
  if (room.projection.state.status.type !== 'playing') return;
  const turn = room.projection.state.status.turn;
  const newClock = unfreezeClock(room.projection.state.clock, at, turn);
  await appendEvent(ctx, room, {
    type: 'resume',
    at,
    roomId: room.id,
    reason,
    ...(newClock ? { clock: newClock } : {}),
  });
  if (room.pauseGraceTimer) {
    clearTimeout(room.pauseGraceTimer);
    room.pauseGraceTimer = null;
  }
}

// Fire resume if the room is paused AND every seat is "present." Returns true
// if resume was appended.
//
// Presence rules:
// - Engine seats (isServerEngineClient) are always present while the server is
//   up. Engines are server-controlled — there's no reconnect to wait for.
// - Human seats are present only when a non-displaced client occupies that
//   seat with a matching seat-token hash. The token is the auth boundary; an
//   attacker without the token cannot force-resume by connecting.
//
// Implications by mode:
// - PvP: needs both human seats to have valid tokens — same as before.
// - PvE: resumes the moment the human reconnects (engine is auto-present).
// - EvE: resumes on the first connection of any kind (both engines auto-present).
export async function resumeRoomIfReady(
  ctx: RoomManagerContext,
  room: Room,
  at: number,
): Promise<boolean> {
  if (!room.projection.paused) return false;
  if (room.projection.state.status.type !== 'playing') return false;
  if (!room.projection.seats.white || !room.projection.seats.black) return false;

  const seatPresent = (color: Color): boolean => {
    if (isServerEngineClient(room.projection.seats[color])) return true;
    for (const client of room.clients) {
      if (client.displaced) continue;
      if (client.seat !== color) continue;
      const expected = room.seatTokens[color]?.tokenHash;
      if (!expected || !client.seatTokenHash || client.seatTokenHash !== expected) continue;
      return true;
    }
    return false;
  };

  if (!seatPresent('white') || !seatPresent('black')) return false;
  await resumeRoom(ctx, room, at, 'both-present');
  return true;
}

// ── Game flow ──────────────────────────────────────────────────────────────

export async function startLiveClockIfReady(ctx: RoomManagerContext, room: Room): Promise<void> {
  if (room.projection.variant !== 'dark-chess') return;
  if (room.projection.state.status.type !== 'playing') return;
  if (room.projection.state.clock) return;
  if (!room.projection.seats.white || !room.projection.seats.black) return;

  const now = Date.now();
  const timeControl = room.projection.timeControl;
  const initialClock = timeControl
    ? createClock(now, timeControl.initialMs, timeControl.incrementMs)
    : createClock(now, ctx.liveClockInitialMs, ctx.liveClockIncrementMs);
  // createClock hardcodes activeColor='white'. If the projection has already
  // advanced before clock-started (engineColor='white' rooms: engine plays
  // its first move before both seats are filled), the clock must start for
  // the side actually to move — otherwise the wrong clock ticks down and
  // the active-color UI hints are inverted.
  const clock =
    room.projection.state.status.turn !== initialClock.activeColor
      ? { ...initialClock, activeColor: room.projection.state.status.turn }
      : initialClock;
  await appendEvent(ctx, room, {
    type: 'clock-started',
    at: now,
    roomId: room.id,
    clock,
  });
  // If the game starts with the engine to move (PvE with engineColor='white'),
  // there's otherwise no trigger to kick off the engine's first move — the
  // normal trigger fires after a human plays (line 699 of this file).
  scheduleRandomEngineMove(ctx, room);
}

export async function resolveStartIfReady(ctx: RoomManagerContext, room: Room): Promise<void> {
  if (
    room.projection.resolvedStartId !== null ||
    (room.projection.resolvedStartIds.white !== undefined &&
      room.projection.resolvedStartIds.black !== undefined)
  )
    return;

  const whiteSelection = room.projection.selections.white;
  const blackSelection = room.projection.selections.black;
  if (whiteSelection === undefined || blackSelection === undefined) return;

  const whiteStart = offerForColor(room.projection, 'white').find(
    (start) => start.id === whiteSelection,
  );
  const blackStart = offerForColor(room.projection, 'black').find(
    (start) => start.id === blackSelection,
  );
  if (!whiteStart || !blackStart) return;
  const now = Date.now();

  await appendEvent(ctx, room, {
    type: 'draft-start-resolved',
    at: now,
    roomId: room.id,
    clock: createClock(
      now,
      room.projection.timeControl?.initialMs,
      room.projection.timeControl?.incrementMs,
    ),
    startIds: {
      white: whiteStart.id,
      black: blackStart.id,
    },
  });
}

export async function selectEngineDraftStart(ctx: RoomManagerContext, room: Room): Promise<void> {
  if (room.projection.state.status.type !== 'pregame') return;
  if (!isServerEngineClient(room.projection.seats.black)) return;
  if (room.projection.selections.black !== undefined) return;
  const offer = offerForColor(room.projection, 'black');
  if (offer.length === 0) return;
  const start = offer[Math.abs(roomIdToSeed(`${room.id}:black-draft`)) % offer.length];
  if (!start) return;
  await appendEvent(ctx, room, {
    type: 'draft-start-selected',
    at: Date.now(),
    roomId: room.id,
    color: 'black',
    startId: start.id,
  });
  await resolveStartIfReady(ctx, room);
}

type ClientMoveMessage = {
  type: 'move';
  from: string;
  to: string;
  promotion?: string;
};

export async function playMove(
  ctx: RoomManagerContext,
  room: Room,
  client: Client,
  move: ClientMoveMessage,
): Promise<void> {
  if (room.projection.state.status.type !== 'playing') return;
  if (room.projection.paused) return;
  const now = Date.now();
  const moveColor = room.projection.state.status.turn;
  if (!canClientAct(room, client)) return;
  if (!client.solo && (client.seat === 'spectator' || moveColor !== client.seat)) return;
  if (
    room.projection.state.clock &&
    clockRemainingMs(room.projection.state.clock, moveColor, now) <= 0
  ) {
    const fromSeq = room.events.length;
    await expireActiveClock(ctx, room, moveColor, now);
    broadcastEventAppended(ctx, room, fromSeq);
    return;
  }

  const requestedMove: Move = {
    from: move.from as Square,
    to: move.to as Square,
    promotion: isPromotionRole(move.promotion) ? move.promotion : undefined,
  };
  const nextState = variantForId(room.projection.variant).applyMove(
    room.projection.state,
    requestedMove,
  );
  if (nextState === room.projection.state) return;
  const nextClock = advanceClock(room.projection.state.clock, now, moveColor, nextState.status);
  const captured = capturedRoleFor(room.projection.state, nextState.lastMove ?? requestedMove);

  const fromSeq = room.events.length;
  await appendEvent(ctx, room, {
    type: 'move-played',
    at: now,
    roomId: room.id,
    clock: nextClock,
    color: moveColor,
    move: nextState.lastMove ?? requestedMove,
    ...(captured ? { capturedRole: captured } : {}),
  });
  broadcastEventAppended(ctx, room, fromSeq);
  scheduleRandomEngineMove(ctx, room);
}

type LiveEngineDecisionArtifactInput = {
  contextPly: number;
  durationMs: number;
  engineId: string;
  fallback: boolean;
  fallbackEvent: LiveEngineFallbackEvent | null;
  move: Move;
  requestedEngineId: string;
  scores: Array<{ move: Move; score: number; reason: string }>;
  thinkTimeMs: number;
};

async function recordLiveEngineDecisionArtifact(
  room: Room,
  input: LiveEngineDecisionArtifactInput,
): Promise<void> {
  if (!persistence.isInitialized()) return;
  try {
    await persistence.recordGameDebugArtifact({
      gameId: room.id,
      ply: input.contextPly,
      engineColor: engineSeatFor(room) ?? 'black',
      artifactType: 'live-engine-decision',
      payload: {
        requested_engine_id: input.requestedEngineId,
        engine_id: input.engineId,
        fallback: input.fallback,
        move: input.move,
        think_time_ms: input.thinkTimeMs,
        duration_ms: input.durationMs,
        scores: input.scores,
      },
    });
    if (input.fallbackEvent) {
      await persistence.recordGameDebugArtifact({
        gameId: room.id,
        ply: input.contextPly,
        engineColor: engineSeatFor(room) ?? 'black',
        artifactType: 'live-engine-fallback',
        payload: {
          engine_id: input.fallbackEvent.engineId,
          fallback_engine_id: input.fallbackEvent.fallbackEngineId,
          reason: input.fallbackEvent.reason,
          timeout_ms: input.fallbackEvent.timeoutMs ?? null,
          duration_ms: input.fallbackEvent.durationMs,
          diagnostics: input.fallbackEvent.diagnostics ?? null,
        },
      });
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        kind: 'live_engine_artifact_persistence_failed',
        roomId: room.id,
        ply: input.contextPly,
        error: (err as Error).message,
        at: Date.now(),
      }),
    );
  }
}

export async function playRandomEngineMoveIfReady(
  ctx: RoomManagerContext,
  room: Room,
): Promise<void> {
  if (!room.randomEngine) return;
  const engine = loadEngine(room.pveEngineId ?? ctx.pveBuiltinEngineClientId);
  if (room.projection.variant !== 'dark-chess') return;
  if (room.projection.state.status.type !== 'playing') return;
  if (room.projection.paused) return;
  const engineSeat = engineSeatFor(room);
  if (engineSeat === null) return;
  if (room.projection.state.status.turn !== engineSeat) return;

  const now = Date.now();
  if (
    room.projection.state.clock &&
    clockRemainingMs(room.projection.state.clock, engineSeat, now) <= 0
  ) {
    await expireActiveClock(ctx, room, engineSeat, now);
    return;
  }

  const moves = variantForId(room.projection.variant).getLegalMoves(
    room.projection.state,
    engineSeat,
  );
  if (moves.length === 0) return;
  const clock = room.projection.state.clock;
  const context = {
    baseThinkTimeMs: ctx.pveEngineMoveDelayMs,
    clockRemainingMs: clock ? clockRemainingMs(clock, engineSeat, now) : undefined,
    events: room.events,
    incrementMs: clock?.incrementMs,
    state: room.projection.state,
    color: engineSeat,
    legalMoves: moves,
    roomId: room.id,
    seed: liveEngineMoveSeed(room),
    ply: room.events.filter((event) => event.type === 'move-played').length,
  } as const;
  const startedAt = Date.now();
  let fallbackEvent: LiveEngineFallbackEvent | null = null;
  const result = await chooseLiveEngineMove({
    context,
    engine,
    timeoutMs: ctx.liveEngineTimeoutMs,
    onFallback(event) {
      fallbackEvent = event;
      logger.error(
        {
          kind: 'live_engine_fallback',
          game_id: room.id,
          engine_id: event.engineId,
          fallback_engine_id: event.fallbackEngineId,
          ply: event.ply,
          reason: event.reason,
          timeout_ms: event.timeoutMs,
          duration_ms: event.durationMs,
          diagnostics: event.diagnostics,
        },
        'live engine fallback',
      );
    },
  });
  const computeMs = Date.now() - startedAt;
  const engineThinkTimeMs = result.decision.thinkTimeMs ?? computeMs;
  await sleepEngineThinkTime(startedAt, engineThinkTimeMs);
  const decisionAt = Date.now();
  if (room.projection.state.status.type !== 'playing') return;
  if (room.projection.state.status.turn !== engineSeat) return;
  if (
    room.projection.state.clock &&
    clockRemainingMs(room.projection.state.clock, engineSeat, decisionAt) <= 0
  ) {
    await expireActiveClock(ctx, room, engineSeat, decisionAt);
    return;
  }
  engineCounters.recordMove(result.fallback);
  logger.info(
    {
      kind: 'live_engine_move',
      game_id: room.id,
      requested_engine_id: engine.id,
      engine_id: result.engineId,
      fallback: result.fallback,
      ply: context.ply,
      compute_ms: computeMs,
      total_ms: decisionAt - startedAt,
      think_time_ms: engineThinkTimeMs,
      move: result.decision.move,
    },
    'live engine move',
  );
  const move = result.decision.move;
  if (!move) return;
  const nextState = variantForId(room.projection.variant).applyMove(room.projection.state, move);
  if (nextState === room.projection.state) return;
  const nextClock = advanceClock(
    room.projection.state.clock,
    decisionAt,
    engineSeat,
    nextState.status,
  );
  const captured = capturedRoleFor(room.projection.state, nextState.lastMove ?? move);
  await appendEvent(ctx, room, {
    type: 'move-played',
    at: decisionAt,
    roomId: room.id,
    clock: nextClock,
    color: engineSeat,
    move,
    thinkTimeMs: engineThinkTimeMs,
    ...(captured ? { capturedRole: captured } : {}),
  });
  await recordLiveEngineDecisionArtifact(room, {
    contextPly: context.ply,
    durationMs: Date.now() - startedAt,
    engineId: result.engineId,
    fallback: result.fallback,
    fallbackEvent,
    move,
    requestedEngineId: engine.id,
    scores: result.decision.scores,
    thinkTimeMs: engineThinkTimeMs,
  });
}

export function scheduleRandomEngineMove(ctx: RoomManagerContext, room: Room): void {
  if (room.engineTimer) return;
  if (!room.randomEngine) return;
  if (room.projection.variant !== 'dark-chess') return;
  if (room.projection.state.status.type !== 'playing') return;
  if (room.projection.paused) return;
  const engineSeat = engineSeatFor(room);
  if (engineSeat === null) return;
  if (room.projection.state.status.turn !== engineSeat) return;

  room.engineTimer = setTimeout(() => {
    room.engineTimer = null;
    const fromSeq = room.events.length;
    void playRandomEngineMoveIfReady(ctx, room)
      .then(() => broadcastEventAppended(ctx, room, fromSeq))
      .catch((err) => {
        if (!(err instanceof PersistenceFailure)) {
          console.error(
            JSON.stringify({
              level: 'error',
              kind: 'engine_move_failure',
              roomId: room.id,
              error: (err as Error).message,
              at: Date.now(),
            }),
          );
        }
      });
  }, 0);
  room.engineTimer.unref();
}
