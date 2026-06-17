/**
 * Server-side PikaJieQi loop for Jieqi (揭棋) PvE.
 *
 * Tier-B: jieqi is driven by a Pikafish-jieqi UCI subprocess (jieqi-engine.ts),
 * the same shape as Crossroads/Fairy-Stockfish — NOT the hidden-info Misty
 * engine-worker. Unlike crossroads (perfect info, replayed from move history),
 * jieqi has hidden identities, so we hand the engine a redacted current-position
 * FEN built by jieqi-fen.ts from canonical state. Engine moves are injected
 * through the same append+broadcast path as human moves, so clocks, persistence,
 * reconnect, and review stay event-sourced.
 *
 * The engine SEAT is whichever projection.seats slot holds an engine clientId
 * (jieqi-engine.ts owns the id set); no dedicated room field, so it survives
 * hydration. The room types come from the generic tenant runtime, kept local to
 * avoid an import cycle with server-ws-jieqi.ts.
 */

import {
  getJieqiLegalMoves,
  isJieqiLegalMove,
  type JieqiColor,
  type JieqiGameState,
  type JieqiMove,
} from '@mistboard/game';
import { isJieqiEngineClientId, jieqiEngineTierFor, jieqiLiveEngineMove } from './jieqi-engine.js';
import {
  jieqiMoveToPikafishUci,
  jieqiStateToPikafishFen,
  pikafishUciToJieqiMove,
} from './jieqi-fen.js';
import type { JieqiEvent, JieqiSpecId } from './jieqi-runtime.js';
import { jieqiTenant } from './jieqi-tenant.js';
import { logger } from './obs.js';
import type { TenantLifecycleContext } from './variant-tenant/lifecycle.js';
import {
  applyTenantEvent,
  replayTenantEvents,
  tenantClockRemainingMs,
} from './variant-tenant/runtime.js';
import type { TenantRoomEvent } from './variant-tenant/tenant.js';
import type { TenantLiveRoom } from './variant-tenant/ws.js';

const CLOCK_SAFETY_MS = 1_000;
const MIN_MOVETIME_MS = 50;

type JieqiEngineRoom = TenantLiveRoom<'jieqi', JieqiColor, JieqiMove, JieqiGameState, JieqiSpecId>;
type JieqiEngineContext = TenantLifecycleContext<
  JieqiColor,
  JieqiMove,
  JieqiGameState,
  JieqiSpecId,
  JieqiEngineRoom
>;

export function jieqiEngineSeatFor(room: JieqiEngineRoom): JieqiColor | null {
  for (const seat of ['red', 'black'] as const) {
    if (isJieqiEngineClientId(room.projection.seats[seat])) return seat;
  }
  return null;
}

function bothSeatsFilled(room: JieqiEngineRoom): boolean {
  return Boolean(room.projection.seats.red && room.projection.seats.black);
}

function engineToMove(room: JieqiEngineRoom, seat: JieqiColor): boolean {
  const status = room.projection.state.status;
  return status.type === 'playing' && status.turn === seat && bothSeatsFilled(room);
}

// Build the repetition WINDOW for PikaJieQi: the redacted FEN at the last irreversible
// move (capture OR reveal) plus the quiet plies since, sent as `position fen <ws> moves
// <...>` so pikafish's is_repeated() (gated on pliesFromNull>=4) activates and honors the
// xiangqi repetition / perpetual-check / perpetual-chase rules. The window must contain NO
// reveal: a reveal flips a dark piece to an identity the engine cannot replay from a UCI
// move (and noCaptureClock only resets on capture, not reveal), so we detect both here by
// replaying move-by-move — capture = target occupied, reveal = moving piece faceDown.
// Within a window every piece's revealed-ness is constant, so the window-start redacted FEN
// plus the quiet moves leak no hidden identity and replay cleanly. Empty window => FEN only.
function jieqiEngineRepWindow(room: JieqiEngineRoom): { fen: string; moves: string[] } {
  const events = room.events as readonly JieqiEvent[];
  const created = events[0];
  if (!created || created.type !== 'room-created') {
    return { fen: jieqiStateToPikafishFen(room.projection.state), moves: [] };
  }
  let proj = replayTenantEvents(jieqiTenant, [created]);
  let startState = proj.state;
  let windowMoves: JieqiMove[] = [];
  for (const event of events.slice(1)) {
    if (event.type !== 'move-played') {
      proj = applyTenantEvent(jieqiTenant, proj, event);
      continue;
    }
    const board = proj.state.board;
    const irreversible = board[event.move.from]?.faceDown === true || board[event.move.to] != null;
    proj = applyTenantEvent(jieqiTenant, proj, event);
    if (irreversible) {
      startState = proj.state;
      windowMoves = [];
    } else {
      windowMoves.push(event.move);
    }
  }
  return {
    fen: jieqiStateToPikafishFen(startState),
    moves: windowMoves.map(jieqiMoveToPikafishUci),
  };
}

export function scheduleJieqiEngineMove(ctx: JieqiEngineContext, room: JieqiEngineRoom): void {
  if (room.engineTimer) return;
  const seat = jieqiEngineSeatFor(room);
  if (seat === null || !engineToMove(room, seat)) return;
  room.engineTimer = setTimeout(() => {
    room.engineTimer = null;
    void playJieqiEngineMoveIfReady(ctx, room).catch((err) => {
      logger.error(
        { kind: 'jieqi_engine_move_failure', room_id: room.id, error: (err as Error).message },
        'Jieqi engine move failure',
      );
    });
  }, 0);
  room.engineTimer.unref();
}

export async function playJieqiEngineMoveIfReady(
  ctx: JieqiEngineContext,
  room: JieqiEngineRoom,
): Promise<void> {
  const seat = jieqiEngineSeatFor(room);
  if (seat === null || !engineToMove(room, seat)) return;
  const engineId = room.projection.seats[seat]!;
  const tier = jieqiEngineTierFor(engineId);
  if (!tier) return;

  const now = ctx.now?.() ?? Date.now();
  const clock = room.projection.clock;
  const remainingMs = clock ? tenantClockRemainingMs(clock, seat, now) : null;
  if (remainingMs !== null && remainingMs <= 0) return;

  const { fen, moves } = jieqiEngineRepWindow(room);
  const movetimeMs =
    remainingMs === null
      ? tier.movetimeMs
      : Math.max(MIN_MOVETIME_MS, Math.min(tier.movetimeMs, remainingMs - CLOCK_SAFETY_MS));

  let uci: string | null = null;
  let fallbackReason: 'request-failed' | 'illegal-move' | 'no-move' | null = null;
  try {
    uci = await jieqiLiveEngineMove(engineId, fen, { movetimeMs, moves });
  } catch (err) {
    logger.error(
      {
        kind: 'jieqi_engine_request_failed',
        room_id: room.id,
        engine_id: engineId,
        error: (err as Error).message,
      },
      'Jieqi engine request failed',
    );
    fallbackReason = 'request-failed';
  }

  // State may have advanced while the engine was thinking (reconnect, resign).
  if (!engineToMove(room, seat)) return;
  const state = room.projection.state;
  const legalMoves = getJieqiLegalMoves(state);
  const parsed = uci ? pikafishUciToJieqiMove(uci) : null;
  let chosen: JieqiMove | null = parsed && isJieqiLegalMove(state, parsed) ? parsed : null;
  if (!chosen) {
    fallbackReason ??= uci ? 'illegal-move' : 'no-move';
    chosen = legalMoves[0] ?? null;
  }
  if (!chosen) {
    logger.error(
      {
        kind: 'jieqi_engine_no_legal_fallback',
        room_id: room.id,
        engine_id: engineId,
        move: uci,
        fallback_reason: fallbackReason,
      },
      'Jieqi engine could not produce a move',
    );
    return;
  }
  if (fallbackReason) {
    logger.warn(
      {
        kind: 'jieqi_engine_fallback_move',
        room_id: room.id,
        engine_id: engineId,
        move: uci,
        fallback_reason: fallbackReason,
      },
      'Jieqi engine used a legal fallback move',
    );
  }

  const event: TenantRoomEvent<JieqiColor, JieqiMove, JieqiSpecId> = {
    type: 'move-played',
    at: Date.now(),
    roomId: room.id,
    color: seat,
    move: chosen,
  };
  const seq = await ctx.appendEvent(room, event);
  ctx.broadcastEventAppended(room, event, seq);
}
