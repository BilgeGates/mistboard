/**
 * Server-side Fairy-Stockfish loop for Crossroads Chess PvE.
 *
 * Crossroads is perfect-information, so it can use FSF directly instead of the
 * hidden-info Misty engine-worker protocol. The engine seat is stored as a
 * normal seat-assigned event. Engine moves are injected through the same
 * append+broadcast path as human moves so clocks, persistence, reconnect, and
 * review remain event-sourced.
 */

import {
  applyCrossroadsChessOpenMove,
  type CrossroadsChessColor,
  type CrossroadsChessGameState,
  type CrossroadsChessMove,
  getCrossroadsChessOpenLegalMoves,
} from '@mistboard/game';
import {
  crossroadsChessEngineTierFor,
  crossroadsChessLiveEngineMove,
  isCrossroadsChessEngineClientId,
} from './crossroads-chess-engine.js';
import {
  type CrossroadsChessEvent,
  crossroadsChessClockRemainingMs,
} from './crossroads-chess-runtime.js';
import { logger } from './obs.js';
import type { CrossroadsChessLiveRoom } from './server-crossroads-chess-live-room.js';

const CLOCK_SAFETY_MS = 1_000;
const MIN_MOVETIME_MS = 50;

export type CrossroadsChessEngineContext = {
  appendEvent(room: CrossroadsChessLiveRoom, event: CrossroadsChessEvent): Promise<number>;
  broadcastEventAppended(
    room: CrossroadsChessLiveRoom,
    event: CrossroadsChessEvent,
    seq: number,
  ): void;
  engineMove?(
    engineId: string,
    moves: string[],
    opts: { movetimeMs: number },
  ): Promise<string | null>;
  now?(): number;
};

export function crossroadsChessEngineSeatFor(
  room: CrossroadsChessLiveRoom,
): CrossroadsChessColor | null {
  for (const seat of ['white', 'red'] as const) {
    if (isCrossroadsChessEngineClientId(room.projection.seats[seat])) return seat;
  }
  return null;
}

export function scheduleCrossroadsChessEngineMove(
  ctx: CrossroadsChessEngineContext,
  room: CrossroadsChessLiveRoom,
): void {
  if (room.engineTimer) return;
  const seat = crossroadsChessEngineSeatFor(room);
  if (seat === null || !engineToMove(room, seat)) return;
  room.engineTimer = setTimeout(() => {
    room.engineTimer = null;
    void playCrossroadsChessEngineMoveIfReady(ctx, room).catch((err) => {
      logger.error(
        {
          kind: 'crossroads_chess_engine_move_failure',
          room_id: room.id,
          error: (err as Error).message,
        },
        'Crossroads Chess engine move failure',
      );
    });
  }, 0);
  room.engineTimer.unref();
}

export async function playCrossroadsChessEngineMoveIfReady(
  ctx: CrossroadsChessEngineContext,
  room: CrossroadsChessLiveRoom,
): Promise<void> {
  const seat = crossroadsChessEngineSeatFor(room);
  if (seat === null || !engineToMove(room, seat)) return;
  const engineId = room.projection.seats[seat]!;
  const tier = crossroadsChessEngineTierFor(engineId);
  if (!tier) return;

  const now = ctx.now?.() ?? Date.now();
  const clock = room.projection.clock;
  const remainingMs = clock ? crossroadsChessClockRemainingMs(clock, seat, now) : null;
  if (remainingMs !== null && remainingMs <= 0) return;

  const history = crossroadsChessUciHistory(room.events);
  const movetimeMs =
    remainingMs === null
      ? tier.movetimeMs
      : Math.max(MIN_MOVETIME_MS, Math.min(tier.movetimeMs, remainingMs - CLOCK_SAFETY_MS));

  let uci: string | null = null;
  let fallbackReason: 'request-failed' | 'illegal-move' | 'no-move' | null = null;
  try {
    uci = await (ctx.engineMove ?? crossroadsChessLiveEngineMove)(engineId, history, {
      movetimeMs,
    });
  } catch (err) {
    logger.error(
      {
        kind: 'crossroads_chess_engine_request_failed',
        room_id: room.id,
        engine_id: engineId,
        error: (err as Error).message,
      },
      'Crossroads Chess engine request failed',
    );
    fallbackReason = 'request-failed';
  }

  if (!engineToMove(room, seat)) return;
  const legalMoves = getCrossroadsChessOpenLegalMoves(room.projection.state);
  let chosen = uci ? legalMoveForUci(legalMoves, uci) : null;
  if (!chosen) {
    fallbackReason ??= uci ? 'illegal-move' : 'no-move';
    chosen = legalMoves[0] ?? null;
  }
  if (!chosen) {
    logger.error(
      {
        kind: 'crossroads_chess_engine_no_legal_fallback',
        room_id: room.id,
        engine_id: engineId,
        move: uci,
        fallback_reason: fallbackReason,
      },
      'Crossroads Chess engine could not produce a move',
    );
    return;
  }
  if (fallbackReason) {
    logger.warn(
      {
        kind: 'crossroads_chess_engine_fallback_move',
        room_id: room.id,
        engine_id: engineId,
        move: uci,
        fallback_reason: fallbackReason,
        fallback_move: crossroadsChessMoveToUci(chosen),
      },
      'Crossroads Chess engine used a legal fallback move',
    );
  }
  const guarded = guardCrossroadsChessEngineMove(room.projection.state, chosen, legalMoves);
  if (guarded.move !== chosen) {
    logger.warn(
      {
        kind: 'crossroads_chess_engine_immediate_loss_guard',
        room_id: room.id,
        engine_id: engineId,
        move: crossroadsChessMoveToUci(chosen),
        replacement_move: crossroadsChessMoveToUci(guarded.move),
      },
      'Crossroads Chess engine immediate-loss guard replaced an avoidable losing move',
    );
    chosen = guarded.move;
  }

  const event: CrossroadsChessEvent = {
    type: 'move-played',
    at: Date.now(),
    roomId: room.id,
    color: seat,
    move: chosen,
  };
  const seq = await ctx.appendEvent(room, event);
  ctx.broadcastEventAppended(room, event, seq);
}

function bothSeatsFilled(room: CrossroadsChessLiveRoom): boolean {
  return Boolean(room.projection.seats.white && room.projection.seats.red);
}

function engineToMove(room: CrossroadsChessLiveRoom, seat: CrossroadsChessColor): boolean {
  const status = room.projection.state.status;
  return status.type === 'playing' && status.turn === seat && bothSeatsFilled(room);
}

function legalMoveForUci(
  legalMoves: readonly CrossroadsChessMove[],
  uci: string,
): CrossroadsChessMove | null {
  const parsed = crossroadsChessMoveFromUci(uci);
  if (!parsed) return null;
  return (
    legalMoves.find(
      (move) =>
        move.from === parsed.from &&
        move.to === parsed.to &&
        (move.promotion ?? null) === (parsed.promotion ?? null),
    ) ?? null
  );
}

function guardCrossroadsChessEngineMove(
  state: CrossroadsChessGameState,
  chosen: CrossroadsChessMove,
  legalMoves: readonly CrossroadsChessMove[],
): { move: CrossroadsChessMove } {
  if (!allowsImmediateOpponentWin(state, chosen)) return { move: chosen };
  return {
    move: legalMoves.find((move) => !allowsImmediateOpponentWin(state, move)) ?? chosen,
  };
}

function allowsImmediateOpponentWin(
  state: CrossroadsChessGameState,
  move: CrossroadsChessMove,
): boolean {
  if (state.status.type !== 'playing') return false;
  const mover = state.status.turn;
  const opponent = mover === 'white' ? 'red' : 'white';
  const after = applyCrossroadsChessOpenMove(state, move, { progressClockLimit: Infinity });
  if (after === state || after.status.type !== 'playing') return false;
  return getCrossroadsChessOpenLegalMoves(after).some((reply) => {
    const afterReply = applyCrossroadsChessOpenMove(after, reply, {
      progressClockLimit: Infinity,
    });
    return afterReply.status.type === 'finished' && afterReply.status.winner === opponent;
  });
}

function crossroadsChessUciHistory(events: readonly CrossroadsChessEvent[]): string[] {
  return events
    .filter(
      (event): event is Extract<CrossroadsChessEvent, { type: 'move-played' }> =>
        event.type === 'move-played',
    )
    .map((event) => crossroadsChessMoveToUci(event.move));
}

function crossroadsChessMoveToUci(move: CrossroadsChessMove): string {
  return `${move.from}${move.to}${move.promotion === 'queen' ? 'q' : ''}`;
}

function crossroadsChessMoveFromUci(uci: string): CrossroadsChessMove | null {
  const match = uci.match(/^([a-f][1-8])([a-f][1-8])(q)?$/);
  if (!match) return null;
  return {
    from: match[1] as CrossroadsChessMove['from'],
    to: match[2] as CrossroadsChessMove['to'],
    ...(match[3] ? { promotion: 'queen' as const } : {}),
  };
}
