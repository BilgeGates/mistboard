import { randomInt } from 'node:crypto';
import {
  advanceClock,
  type Chess960Start,
  clockRemainingMs,
  createClock,
  expireClock,
  replayGameEvents,
  variantForId,
  type Color,
  type GameEvent,
  type GameProjection,
  type Move,
  type PieceRole,
  type Square,
} from '@mistboard/game';
import * as persistence from './persistence.js';
import type { GameSummary } from './persistence.js';
import { chooseLiveEngineMove, type LiveEngineFallbackEvent } from './live-engine.js';
import { snapshotPayload } from './payloads.js';
import { engineVersionDisplayName, loadEngine } from './engine-registry.js';
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

async function sleepEngineThinkTime(startedAt: number, thinkTimeMs: number | undefined): Promise<void> {
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
  console.error(JSON.stringify({
    level: 'error',
    kind: 'seat_token_persistence_failure',
    roomId,
    seat,
    error: err.message,
    at: Date.now(),
  }));
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

export async function persistSeatToken(ctx: RoomManagerContext, room: Room, token: SeatTokenState): Promise<void> {
  if (!persistence.isInitialized()) return;
  try {
    await persistence.upsertRoomSeatToken(room.id, persistenceRecordForSeatToken(token));
  } catch (err) {
    recordSeatTokenPersistenceError(room.id, token.seat, err as Error);
    throw new PersistenceFailure();
  }
}

export async function touchSeatToken(ctx: RoomManagerContext, room: Room, token: SeatTokenState): Promise<void> {
  if (!persistence.isInitialized()) return;
  try {
    await persistence.touchRoomSeatToken(room.id, token.seat, token.tokenHash, token.lastSeenAt);
  } catch (err) {
    recordSeatTokenPersistenceError(room.id, token.seat, err as Error);
    throw new PersistenceFailure();
  }
}

export async function replaceSeatTokens(
  ctx: RoomManagerContext,
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
  const result: GameSummary['result'] = status.winner === 'white' ? 'white-wins'
    : status.winner === 'black' ? 'black-wins'
    : 'draw';

  // status.reason is loosely typed as string in @mistboard/game; narrow here.
  const termination = status.reason as GameSummary['termination'];

  const moveEvents = room.events.filter((e) => e.type === 'move-played');
  const firstAt = room.events[0]?.at ?? Date.now();
  const lastAt = room.events[room.events.length - 1]?.at ?? Date.now();

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
    participants: [
      participantForSeatToken('white', room.projection.seats.white ?? null, room.seatTokens.white, room.mode, ctx.pveBuiltinEngineClientId),
      participantForSeatToken('black', room.projection.seats.black ?? null, room.seatTokens.black, room.mode, ctx.pveBuiltinEngineClientId),
    ],
  };
}

// ── Room event infrastructure ──────────────────────────────────────────────

export function broadcastSnapshot(ctx: RoomManagerContext, room: Room): void {
  for (const client of room.clients) {
    ctx.send(client, snapshotPayload(room, client));
  }
}

export async function appendEvent(ctx: RoomManagerContext, room: Room, event: GameEvent): Promise<void> {
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
    if (room.projection.state.status.type !== 'playing' || room.projection.state.status.turn !== 'black') {
      clearRandomEngineTimer(room);
    }

    if (
      persistence.isInitialized()
      && room.projection.state.status.type === 'finished'
      && !room.gameEndRecorded
    ) {
      room.gameEndRecorded = true;
      try {
        await persistence.recordGameEnd(room.id, buildGameSummary(ctx, room));
      } catch (err) {
        // Events are durable; the games-row aggregate can be backfilled.
        // Log loudly so it's visible.
        console.error(JSON.stringify({
          level: 'error',
          kind: 'game_end_record_failure',
          roomId: room.id,
          error: (err as Error).message,
          at: Date.now(),
        }));
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
    if (room.projection.state.status.turn !== activeColor) return;
    void expireActiveClock(ctx, room, activeColor, Date.now())
      .then(() => broadcastSnapshot(ctx, room))
      .catch((err) => {
        if (!(err instanceof PersistenceFailure)) {
          console.error(JSON.stringify({
            level: 'error',
            kind: 'clock_expire_failure',
            roomId: room.id,
            error: (err as Error).message,
            at: Date.now(),
          }));
        }
      });
  }, delay + 25);
}

export async function expireActiveClock(ctx: RoomManagerContext, room: Room, color: Color, at: number): Promise<void> {
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

// ── Game flow ──────────────────────────────────────────────────────────────

export async function startLiveClockIfReady(ctx: RoomManagerContext, room: Room): Promise<void> {
  if (room.projection.variant !== 'fog-of-war') return;
  if (room.projection.state.status.type !== 'playing') return;
  if (room.projection.state.clock) return;
  if (!room.projection.seats.white || !room.projection.seats.black) return;

  const now = Date.now();
  const timeControl = room.projection.timeControl;
  await appendEvent(ctx, room, {
    type: 'clock-started',
    at: now,
    roomId: room.id,
    clock: timeControl
      ? createClock(now, timeControl.initialMs, timeControl.incrementMs)
      : createClock(now, ctx.liveClockInitialMs, ctx.liveClockIncrementMs),
  });
}

export async function resolveStartIfReady(ctx: RoomManagerContext, room: Room): Promise<void> {
  if (room.projection.resolvedStartId !== null || (room.projection.resolvedStartIds.white !== undefined && room.projection.resolvedStartIds.black !== undefined)) return;

  const whiteSelection = room.projection.selections.white;
  const blackSelection = room.projection.selections.black;
  if (whiteSelection === undefined || blackSelection === undefined) return;

  const whiteStart = offerForColor(room.projection, 'white').find((start) => start.id === whiteSelection);
  const blackStart = offerForColor(room.projection, 'black').find((start) => start.id === blackSelection);
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

export async function resolveBidIfReady(ctx: RoomManagerContext, room: Room): Promise<void> {
  if (room.projection.variant !== 'bid-for-white') return;
  if (room.projection.state.status.type !== 'pregame') return;

  const whiteBid = room.projection.bids.white;
  const blackBid = room.projection.bids.black;
  if (whiteBid === undefined || blackBid === undefined) return;

  const whiteSeat: Color = whiteBid === blackBid
    ? (randomInt(2) === 0 ? 'white' : 'black')
    : (whiteBid > blackBid ? 'white' : 'black');
  const blackSeat: Color = whiteSeat === 'white' ? 'black' : 'white';
  const winningBidMs = whiteSeat === 'white' ? whiteBid : blackBid;
  const now = Date.now();
  const clock = createClock(now);
  const adjustedClock = {
    ...clock,
    remainingMs: {
      ...clock.remainingMs,
      white: Math.max(0, clock.remainingMs.white - winningBidMs),
    },
  };

  await appendEvent(ctx, room, {
    type: 'bid-resolved',
    at: now,
    roomId: room.id,
    bids: { white: whiteBid, black: blackBid },
    blackSeat,
    clock: adjustedClock,
    winner: whiteBid === blackBid ? null : whiteSeat,
    whiteSeat,
    winningBidMs,
  });
  await reconcileClientSeats(ctx, room);
}

type ClientMoveMessage = {
  type: 'move';
  from: string;
  to: string;
  promotion?: string;
};

export async function playMove(ctx: RoomManagerContext, room: Room, client: Client, move: ClientMoveMessage): Promise<void> {
  if (room.projection.state.status.type !== 'playing') return;
  const now = Date.now();
  const moveColor = room.projection.state.status.turn;
  if (!canClientAct(room, client)) return;
  if (!client.solo && (client.seat === 'spectator' || moveColor !== client.seat)) return;
  if (room.projection.state.clock && clockRemainingMs(room.projection.state.clock, moveColor, now) <= 0) {
    await expireActiveClock(ctx, room, moveColor, now);
    broadcastSnapshot(ctx, room);
    return;
  }

  const requestedMove: Move = {
    from: move.from as Square,
    to: move.to as Square,
    promotion: isPromotionRole(move.promotion) ? move.promotion : undefined,
  };
  const nextState = variantForId(room.projection.variant).applyMove(room.projection.state, requestedMove);
  if (nextState === room.projection.state) return;
  const nextClock = advanceClock(room.projection.state.clock, now, moveColor, nextState.status);

  await appendEvent(ctx, room, {
    type: 'move-played',
    at: now,
    roomId: room.id,
    clock: nextClock,
    color: moveColor,
    move: nextState.lastMove ?? requestedMove,
  });
  broadcastSnapshot(ctx, room);
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
      engineColor: 'black',
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
        engineColor: 'black',
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
    console.error(JSON.stringify({
      level: 'error',
      kind: 'live_engine_artifact_persistence_failed',
      roomId: room.id,
      ply: input.contextPly,
      error: (err as Error).message,
      at: Date.now(),
    }));
  }
}

export async function playRandomEngineMoveIfReady(ctx: RoomManagerContext, room: Room): Promise<void> {
  if (!room.randomEngine) return;
  const engine = loadEngine(room.pveEngineId ?? ctx.pveBuiltinEngineClientId);
  if (room.projection.variant !== 'fog-of-war') return;
  if (room.projection.state.status.type !== 'playing') return;
  if (room.projection.state.status.turn !== 'black') return;

  const now = Date.now();
  if (room.projection.state.clock && clockRemainingMs(room.projection.state.clock, 'black', now) <= 0) {
    await expireActiveClock(ctx, room, 'black', now);
    return;
  }

  const moves = variantForId(room.projection.variant).getLegalMoves(room.projection.state, 'black');
  if (moves.length === 0) return;
  const clock = room.projection.state.clock;
  const context = {
    baseThinkTimeMs: ctx.pveEngineMoveDelayMs,
    clockRemainingMs: clock ? clockRemainingMs(clock, 'black', now) : undefined,
    events: room.events,
    incrementMs: clock?.incrementMs,
    state: room.projection.state,
    color: 'black',
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
      console.error(JSON.stringify({
        level: 'error',
        kind: 'live_engine_fallback',
        roomId: room.id,
        engineId: event.engineId,
        fallbackEngineId: event.fallbackEngineId,
        ply: event.ply,
        reason: event.reason,
        timeoutMs: event.timeoutMs,
        durationMs: event.durationMs,
        diagnostics: event.diagnostics,
        at: Date.now(),
      }));
    },
  });
  const engineThinkTimeMs = result.decision.thinkTimeMs ?? Date.now() - startedAt;
  await sleepEngineThinkTime(startedAt, engineThinkTimeMs);
  const decisionAt = Date.now();
  if (room.projection.state.status.type !== 'playing') return;
  if (room.projection.state.status.turn !== 'black') return;
  if (room.projection.state.clock && clockRemainingMs(room.projection.state.clock, 'black', decisionAt) <= 0) {
    await expireActiveClock(ctx, room, 'black', decisionAt);
    return;
  }
  console.log(JSON.stringify({
    level: 'info',
    kind: 'live_engine_move',
    roomId: room.id,
    requestedEngineId: engine.id,
    engineId: result.engineId,
    fallback: result.fallback,
    ply: context.ply,
    durationMs: Date.now() - startedAt,
    move: result.decision.move,
    at: Date.now(),
  }));
  const move = result.decision.move;
  if (!move) return;
  const nextState = variantForId(room.projection.variant).applyMove(room.projection.state, move);
  if (nextState === room.projection.state) return;
  const nextClock = advanceClock(room.projection.state.clock, decisionAt, 'black', nextState.status);
  await appendEvent(ctx, room, {
    type: 'move-played',
    at: decisionAt,
    roomId: room.id,
    clock: nextClock,
    color: 'black',
    move,
    thinkTimeMs: engineThinkTimeMs,
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
  if (room.projection.variant !== 'fog-of-war') return;
  if (room.projection.state.status.type !== 'playing') return;
  if (room.projection.state.status.turn !== 'black') return;

  room.engineTimer = setTimeout(() => {
    room.engineTimer = null;
    void playRandomEngineMoveIfReady(ctx, room)
      .then(() => broadcastSnapshot(ctx, room))
      .catch((err) => {
        if (!(err instanceof PersistenceFailure)) {
          console.error(JSON.stringify({
            level: 'error',
            kind: 'engine_move_failure',
            roomId: room.id,
            error: (err as Error).message,
            at: Date.now(),
          }));
        }
      });
  }, 0);
}
