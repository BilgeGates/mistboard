/**
 * Server-side MistyBanqi loop for Banqi (半棋) PvE.
 *
 * Tier-B: banqi is driven by our `banqi-engine` UCI subprocess (banqi-engine.ts), the
 * same shape as jieqi/Crossroads — NOT the hidden-info Misty engine-worker. Banqi has
 * hidden piece IDENTITIES, so we hand the engine a redacted current-position FEN built
 * by banqi-fen.ts from canonical state. Engine moves are injected through the same
 * append+broadcast path as human moves, so clocks, persistence, reconnect, and review
 * stay event-sourced.
 *
 * The engine SEAT is whichever projection.seats slot holds an engine clientId
 * (banqi-engine.ts owns the id set); no dedicated room field, so it survives hydration.
 * Mirrors server-jieqi-engine.ts.
 */

import {
  type BanqiGameState,
  type BanqiMove,
  type BanqiSeat,
  getBanqiLegalMoves,
  isBanqiLegalMove,
} from '@mistboard/game';
import { banqiEngineTierFor, banqiLiveEngineMove, isBanqiEngineClientId } from './banqi-engine.js';
import { banqiMoveToEngineUci, banqiStateToEngineFen, engineUciToBanqiMove } from './banqi-fen.js';
import type { BanqiEvent, BanqiSpecId } from './banqi-runtime.js';
import { banqiTenant } from './banqi-tenant.js';
import { logger } from './obs.js';
import type { TenantLifecycleContext } from './variant-tenant/lifecycle.js';
import { replayTenantEvents, tenantClockRemainingMs } from './variant-tenant/runtime.js';
import type { TenantRoomEvent } from './variant-tenant/tenant.js';
import type { TenantLiveRoom } from './variant-tenant/ws.js';

const CLOCK_SAFETY_MS = 1_000;
const MIN_MOVETIME_MS = 50;

type BanqiEngineRoom = TenantLiveRoom<'banqi', BanqiSeat, BanqiMove, BanqiGameState, BanqiSpecId>;
type BanqiEngineContext = TenantLifecycleContext<
  BanqiSeat,
  BanqiMove,
  BanqiGameState,
  BanqiSpecId,
  BanqiEngineRoom
>;

export function banqiEngineSeatFor(room: BanqiEngineRoom): BanqiSeat | null {
  for (const seat of ['red', 'black'] as const) {
    if (isBanqiEngineClientId(room.projection.seats[seat])) return seat;
  }
  return null;
}

function bothSeatsFilled(room: BanqiEngineRoom): boolean {
  return Boolean(room.projection.seats.red && room.projection.seats.black);
}

function engineToMove(room: BanqiEngineRoom, seat: BanqiSeat): boolean {
  const status = room.projection.state.status;
  return status.type === 'playing' && status.turn === seat && bothSeatsFilled(room);
}

// Build the repetition WINDOW the engine needs to detect threefold from GAME history: the
// redacted FEN at the last irreversible move (capture/flip) plus the quiet plies since.
// `noProgressClock` counts exactly those quiet plies, so the last K move-played events are
// the window (a flip/capture would have reset the clock to 0); replaying the event prefix
// before them yields the window-start state. Empty window (clock 0) => current FEN only,
// i.e. prior behavior. The replayed moves are all quiet, which the engine replays safely.
function banqiEngineRepWindow(room: BanqiEngineRoom): { fen: string; moves: string[] } {
  const state = room.projection.state;
  const k = state.noProgressClock;
  if (k <= 0) return { fen: banqiStateToEngineFen(state), moves: [] };
  const moveEvents = (room.events as readonly BanqiEvent[]).filter(
    (e): e is Extract<BanqiEvent, { type: 'move-played' }> => e.type === 'move-played',
  );
  if (k >= moveEvents.length) return { fen: banqiStateToEngineFen(state), moves: [] };
  const firstWindowed = moveEvents[moveEvents.length - k]!;
  const cutoff = room.events.indexOf(firstWindowed);
  const startState = replayTenantEvents(banqiTenant, room.events.slice(0, cutoff)).state;
  return {
    fen: banqiStateToEngineFen(startState),
    moves: moveEvents.slice(moveEvents.length - k).map((e) => banqiMoveToEngineUci(e.move)),
  };
}

export function scheduleBanqiEngineMove(ctx: BanqiEngineContext, room: BanqiEngineRoom): void {
  if (room.engineTimer) return;
  const seat = banqiEngineSeatFor(room);
  if (seat === null || !engineToMove(room, seat)) return;
  room.engineTimer = setTimeout(() => {
    room.engineTimer = null;
    void playBanqiEngineMoveIfReady(ctx, room).catch((err) => {
      logger.error(
        { kind: 'banqi_engine_move_failure', room_id: room.id, error: (err as Error).message },
        'Banqi engine move failure',
      );
    });
  }, 0);
  room.engineTimer.unref();
}

export async function playBanqiEngineMoveIfReady(
  ctx: BanqiEngineContext,
  room: BanqiEngineRoom,
): Promise<void> {
  const seat = banqiEngineSeatFor(room);
  if (seat === null || !engineToMove(room, seat)) return;
  const engineId = room.projection.seats[seat]!;
  const tier = banqiEngineTierFor(engineId);
  if (!tier) return;

  const now = ctx.now?.() ?? Date.now();
  const clock = room.projection.clock;
  const remainingMs = clock ? tenantClockRemainingMs(clock, seat, now) : null;
  if (remainingMs !== null && remainingMs <= 0) return;

  const { fen, moves } = banqiEngineRepWindow(room);
  // Strength = the tier's NODE budget; the movetime CAP bounds latency and is further
  // clamped by the remaining game clock so the engine never overshoots its own time.
  const movetimeCapMs =
    remainingMs === null
      ? tier.movetimeCapMs
      : Math.max(MIN_MOVETIME_MS, Math.min(tier.movetimeCapMs, remainingMs - CLOCK_SAFETY_MS));

  let uci: string | null = null;
  let fallbackReason: 'request-failed' | 'illegal-move' | 'no-move' | null = null;
  try {
    uci = await banqiLiveEngineMove(engineId, fen, { nodes: tier.nodes, movetimeCapMs, moves });
  } catch (err) {
    logger.error(
      {
        kind: 'banqi_engine_request_failed',
        room_id: room.id,
        engine_id: engineId,
        error: (err as Error).message,
      },
      'Banqi engine request failed',
    );
    fallbackReason = 'request-failed';
  }

  // State may have advanced while the engine was thinking (reconnect, resign).
  if (!engineToMove(room, seat)) return;
  const state = room.projection.state;
  const legalMoves = getBanqiLegalMoves(state);
  const parsed = uci ? engineUciToBanqiMove(uci) : null;
  let chosen: BanqiMove | null = parsed && isBanqiLegalMove(state, parsed) ? parsed : null;
  if (!chosen) {
    fallbackReason ??= uci ? 'illegal-move' : 'no-move';
    chosen = legalMoves[0] ?? null;
  }
  if (!chosen) {
    logger.error(
      {
        kind: 'banqi_engine_no_legal_fallback',
        room_id: room.id,
        engine_id: engineId,
        move: uci,
        fallback_reason: fallbackReason,
      },
      'Banqi engine could not produce a move',
    );
    return;
  }
  if (fallbackReason) {
    logger.warn(
      {
        kind: 'banqi_engine_fallback_move',
        room_id: room.id,
        engine_id: engineId,
        move: uci,
        fallback_reason: fallbackReason,
      },
      'Banqi engine used a legal fallback move',
    );
  }

  const event: TenantRoomEvent<BanqiSeat, BanqiMove, BanqiSpecId> = {
    type: 'move-played',
    at: Date.now(),
    roomId: room.id,
    color: seat,
    move: chosen,
  };
  const seq = await ctx.appendEvent(room, event);
  ctx.broadcastEventAppended(room, event, seq);
}
