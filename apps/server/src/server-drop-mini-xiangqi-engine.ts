/**
 * Server-side Fairy-Stockfish loop for Drop Mini Xiangqi PvE.
 *
 * Drop Mini is perfect-information (7x7 Mini Xiangqi + crazyhouse-style drops),
 * so it uses FSF directly via a custom variants.ini (drop-mini-xiangqi.ini), the
 * same way Mini Xiangqi uses the built-in `minixiangqi` variant. This replaces
 * the previous in-process minimax heuristic; engine ids follow the
 * fairy-stockfish-drop-mini-xiangqi-* naming (matching Mini Xiangqi / Crossroads).
 *
 * Structurally this mirrors the Mini Xiangqi engine loop. The only Drop-Mini
 * specifics are the UCI translation: a drop move {drop,to} maps to "<L>@<to>"
 * (L = C/N/R/P for cannon/horse/chariot/soldier) and a board move {from,to} to
 * "<from><to>", matching FSF's `minixiangqi` coordinates (files a-g, ranks 1-7,
 * red on rank 1, red to move first).
 *
 * Engine moves are injected through the same append+broadcast path as human moves
 * so clocks, persistence, reconnect, and review stay event-sourced.
 */

import {
  applyDropMiniXiangqiMove,
  type DROP_MINI_XIANGQI_SPEC_ID,
  type DropMiniXiangqiDropRole,
  type DropMiniXiangqiGameState,
  type DropMiniXiangqiMove,
  getLegalDropMiniXiangqiMoves,
  isDropMiniXiangqiDropMove,
  isDropMiniXiangqiGeneralInCheck,
  type MiniXiangqiColor,
  type MiniXiangqiSquare,
} from '@mistboard/game';
import { getBuildInfo } from './build-info.js';
import {
  DROP_MINI_XIANGQI_ENGINE_VERSION,
  type DropMiniXiangqiEngineTier,
  dropMiniXiangqiEngineTierFor,
  dropMiniXiangqiLiveEngineMove,
  isDropMiniXiangqiEngineClientId,
} from './drop-mini-xiangqi-fsf-engine.js';
import { type EngineAlertEmailPayload, sendEngineAlertNotification } from './engine-alert-email.js';
import { engineCounters, logger } from './obs.js';
import type { TenantLifecycleContext } from './variant-tenant/lifecycle.js';
import { tenantClockRemainingMs } from './variant-tenant/runtime.js';
import type { TenantRoomEvent } from './variant-tenant/tenant.js';
import type { TenantLiveRoom } from './variant-tenant/ws.js';

// Re-export the engine metadata so existing importers (tenant, registration,
// rooms route) keep resolving these from this module after the heuristic swap.
export {
  DROP_MINI_XIANGQI_DEFAULT_ENGINE_ID,
  DROP_MINI_XIANGQI_ENGINE_VERSION,
  DROP_MINI_XIANGQI_PLAYABLE_ENGINES,
  type DropMiniXiangqiEngineTier,
  dropMiniXiangqiEngineDisplayName,
  dropMiniXiangqiEngineVersion,
  isDropMiniXiangqiEngineClientId,
} from './drop-mini-xiangqi-fsf-engine.js';

const CLOCK_SAFETY_MS = 1_000;
const MIN_MOVETIME_MS = 50;

// Bounded retries before failing closed. A fresh FSF process can diverge (FSF is
// nondeterministic), so a transient bad output often clears on the second try.
const ENGINE_MOVE_MAX_ATTEMPTS = 2;

type EngineMoveRejectReason = 'request-failed' | 'illegal-move' | 'no-move';

type EngineMoveAttempt = {
  attempt: number;
  uci: string | null;
  error: string | null;
  reason: EngineMoveRejectReason | null;
};

// Complete, replayable record of a failed-closed decision. `history` + the tier
// fields are sufficient to reproduce the exact FSF call offline
// (scripts/variant-lab/replay-drop-mini-xiangqi-decision.ts).
type DropMiniXiangqiDecisionRecord = {
  variant: 'drop-mini-xiangqi';
  room_id: string;
  engine_id: string;
  engine_version: string;
  revision: string | null;
  tier_skill: number;
  tier_nodes: number;
  tier_movetime_ms: number;
  movetime_ms: number;
  ply: number;
  to_move: MiniXiangqiColor;
  in_check: boolean;
  history: string;
  legal_moves: string;
  legal_count: number;
  attempts: number;
  reject_reason: EngineMoveRejectReason | null;
  last_output: string;
  attempts_detail: string;
};

const DROP_ROLE_TO_FSF_LETTER: Record<DropMiniXiangqiDropRole, string> = {
  cannon: 'C',
  horse: 'N',
  chariot: 'R',
  soldier: 'P',
};
const FSF_LETTER_TO_DROP_ROLE: Record<string, DropMiniXiangqiDropRole> = {
  C: 'cannon',
  N: 'horse',
  R: 'chariot',
  P: 'soldier',
};

type DropMiniXiangqiEngineRoom = TenantLiveRoom<
  'drop-mini-xiangqi',
  MiniXiangqiColor,
  DropMiniXiangqiMove,
  DropMiniXiangqiGameState,
  typeof DROP_MINI_XIANGQI_SPEC_ID
>;
type DropMiniXiangqiEngineContext = TenantLifecycleContext<
  MiniXiangqiColor,
  DropMiniXiangqiMove,
  DropMiniXiangqiGameState,
  typeof DROP_MINI_XIANGQI_SPEC_ID,
  DropMiniXiangqiEngineRoom
>;

export function dropMiniXiangqiEngineSeatFor(
  room: DropMiniXiangqiEngineRoom,
): MiniXiangqiColor | null {
  for (const seat of ['red', 'black'] as const) {
    if (isDropMiniXiangqiEngineClientId(room.projection.seats[seat])) return seat;
  }
  return null;
}

export function scheduleDropMiniXiangqiEngineMove(
  ctx: DropMiniXiangqiEngineContext,
  room: DropMiniXiangqiEngineRoom,
): void {
  if (room.engineTimer) return;
  const seat = dropMiniXiangqiEngineSeatFor(room);
  if (seat === null || !engineToMove(room, seat)) return;
  room.engineTimer = setTimeout(() => {
    room.engineTimer = null;
    void playDropMiniXiangqiEngineMoveIfReady(ctx, room).catch((err) => {
      logger.error(
        {
          kind: 'drop_mini_xiangqi_engine_move_failure',
          room_id: room.id,
          error: (err as Error).message,
        },
        'Drop Mini Xiangqi engine move failure',
      );
    });
  }, 0);
  room.engineTimer.unref();
}

export type DropMiniXiangqiEngineMoveProvider = (
  engineId: string,
  moves: string[],
  opts: { movetimeMs?: number },
) => Promise<string | null>;

export async function playDropMiniXiangqiEngineMoveIfReady(
  ctx: DropMiniXiangqiEngineContext,
  room: DropMiniXiangqiEngineRoom,
  moveProvider: DropMiniXiangqiEngineMoveProvider = dropMiniXiangqiLiveEngineMove,
): Promise<void> {
  const seat = dropMiniXiangqiEngineSeatFor(room);
  if (seat === null || !engineToMove(room, seat)) return;
  const engineId = room.projection.seats[seat]!;
  const tier = dropMiniXiangqiEngineTierFor(engineId);
  if (!tier) return;

  const now = ctx.now?.() ?? Date.now();
  const clock = room.projection.clock;
  const remainingMs = clock ? tenantClockRemainingMs(clock, seat, now) : null;
  if (remainingMs !== null && remainingMs <= 0) return;

  const history = dropMiniXiangqiUciHistory(room.events);
  const movetimeMs =
    remainingMs === null
      ? tier.movetimeMs
      : Math.max(MIN_MOVETIME_MS, Math.min(tier.movetimeMs, remainingMs - CLOCK_SAFETY_MS));

  // Engine-move boundary contract: attempt with bounded retries, validate every
  // output against the game kernel, and FAIL CLOSED (resign + page) rather than
  // silently substituting a threat-blind legal move. Until 2026-06, a rejected
  // FSF move silently became `legalMoves[0]` — invisible (logged `warn`, never
  // counted, no position captured), which is how weak-move ghosts kept recurring.
  const attempts: EngineMoveAttempt[] = [];
  let chosen: DropMiniXiangqiMove | null = null;
  for (let attempt = 1; attempt <= ENGINE_MOVE_MAX_ATTEMPTS && chosen === null; attempt += 1) {
    if (!engineToMove(room, seat)) return;
    let uci: string | null = null;
    let error: string | null = null;
    try {
      uci = await moveProvider(engineId, history, { movetimeMs });
    } catch (err) {
      error = (err as Error).message;
    }
    if (!engineToMove(room, seat)) return;
    const legalNow = getLegalDropMiniXiangqiMoves(room.projection.state);
    const match = !error && uci ? legalMoveForUci(legalNow, uci) : null;
    const reason: EngineMoveRejectReason | null = match
      ? null
      : error
        ? 'request-failed'
        : uci
          ? 'illegal-move'
          : 'no-move';
    attempts.push({ attempt, uci, error, reason });
    if (match) {
      chosen = match;
      break;
    }
    // Bad output (FSF error, kernel-illegal move, or "(none)"). A fresh FSF
    // process can diverge (FSF is nondeterministic), so retry within budget.
    logger.warn(
      {
        kind: 'drop_mini_xiangqi_engine_move_rejected',
        room_id: room.id,
        engine_id: engineId,
        attempt,
        max_attempts: ENGINE_MOVE_MAX_ATTEMPTS,
        uci,
        reject_reason: reason,
        error,
      },
      'Drop Mini Xiangqi engine output rejected by kernel; retrying',
    );
  }

  if (!engineToMove(room, seat)) return;

  if (chosen === null) {
    // FAIL CLOSED. After retries the engine cannot produce a kernel-legal move:
    // capture a complete, replayable decision record, page, and resign the engine
    // seat. Never enter a fabricated move into a rated game.
    const record = buildDropMiniXiangqiDecisionRecord({
      roomId: room.id,
      engineId,
      tier,
      history,
      movetimeMs,
      attempts,
      state: room.projection.state,
      seat,
    });
    engineCounters.recordMove(true);
    logger.error(
      { kind: 'drop_mini_xiangqi_engine_failed_closed', ...record },
      'Drop Mini Xiangqi engine failed closed: no kernel-legal move after retries; resigning the engine seat',
    );
    void sendEngineAlertNotification(dropMiniXiangqiFailClosedAlert(record)).catch(() => {});
    const resign: TenantRoomEvent<
      MiniXiangqiColor,
      DropMiniXiangqiMove,
      typeof DROP_MINI_XIANGQI_SPEC_ID
    > = { type: 'seat-resigned', at: Date.now(), roomId: room.id, color: seat };
    const seq = await ctx.appendEvent(room, resign);
    ctx.broadcastEventAppended(room, resign, seq);
    return;
  }

  engineCounters.recordMove(false);
  const legalMoves = getLegalDropMiniXiangqiMoves(room.projection.state);
  const guarded = guardDropMiniXiangqiEngineMove(room.projection.state, chosen, legalMoves);
  if (guarded !== chosen) {
    logger.warn(
      {
        kind: 'drop_mini_xiangqi_engine_immediate_loss_guard',
        room_id: room.id,
        engine_id: engineId,
        move: dropMiniXiangqiMoveToUci(chosen),
        replacement_move: dropMiniXiangqiMoveToUci(guarded),
      },
      'Drop Mini Xiangqi engine immediate-loss guard replaced an avoidable losing move',
    );
    chosen = guarded;
  }

  const event: TenantRoomEvent<
    MiniXiangqiColor,
    DropMiniXiangqiMove,
    typeof DROP_MINI_XIANGQI_SPEC_ID
  > = {
    type: 'move-played',
    at: Date.now(),
    roomId: room.id,
    color: seat,
    move: chosen,
  };
  const seq = await ctx.appendEvent(room, event);
  ctx.broadcastEventAppended(room, event, seq);
}

function bothSeatsFilled(room: DropMiniXiangqiEngineRoom): boolean {
  return Boolean(room.projection.seats.red && room.projection.seats.black);
}

function engineToMove(room: DropMiniXiangqiEngineRoom, seat: MiniXiangqiColor): boolean {
  const status = room.projection.state.status;
  return status.type === 'playing' && status.turn === seat && bothSeatsFilled(room);
}

function dropMiniXiangqiUciHistory(
  events: readonly TenantRoomEvent<
    MiniXiangqiColor,
    DropMiniXiangqiMove,
    typeof DROP_MINI_XIANGQI_SPEC_ID
  >[],
): string[] {
  return events
    .filter(
      (
        event,
      ): event is Extract<
        TenantRoomEvent<MiniXiangqiColor, DropMiniXiangqiMove, typeof DROP_MINI_XIANGQI_SPEC_ID>,
        { type: 'move-played' }
      > => event.type === 'move-played',
    )
    .map((event) => dropMiniXiangqiMoveToUci(event.move));
}

export function dropMiniXiangqiMoveToUci(move: DropMiniXiangqiMove): string {
  if (isDropMiniXiangqiDropMove(move)) {
    return `${DROP_ROLE_TO_FSF_LETTER[move.drop]}@${move.to}`;
  }
  return `${move.from}${move.to}`;
}

export function legalMoveForUci(
  legalMoves: readonly DropMiniXiangqiMove[],
  uci: string,
): DropMiniXiangqiMove | null {
  const drop = uci.match(/^([CNRP])@([a-g][1-7])$/);
  if (drop) {
    const role = FSF_LETTER_TO_DROP_ROLE[drop[1]!];
    const to = drop[2] as MiniXiangqiSquare;
    return (
      legalMoves.find(
        (move) => isDropMiniXiangqiDropMove(move) && move.drop === role && move.to === to,
      ) ?? null
    );
  }
  const board = uci.match(/^([a-g][1-7])([a-g][1-7])$/);
  if (board) {
    const from = board[1] as MiniXiangqiSquare;
    const to = board[2] as MiniXiangqiSquare;
    return (
      legalMoves.find(
        (move) => !isDropMiniXiangqiDropMove(move) && move.from === from && move.to === to,
      ) ?? null
    );
  }
  return null;
}

function buildDropMiniXiangqiDecisionRecord(input: {
  roomId: string;
  engineId: string;
  tier: DropMiniXiangqiEngineTier;
  history: string[];
  movetimeMs: number;
  attempts: EngineMoveAttempt[];
  state: DropMiniXiangqiGameState;
  seat: MiniXiangqiColor;
}): DropMiniXiangqiDecisionRecord {
  const legal = getLegalDropMiniXiangqiMoves(input.state).map(dropMiniXiangqiMoveToUci);
  const last = input.attempts[input.attempts.length - 1];
  return {
    variant: 'drop-mini-xiangqi',
    room_id: input.roomId,
    engine_id: input.engineId,
    engine_version: DROP_MINI_XIANGQI_ENGINE_VERSION,
    revision: getBuildInfo().revision,
    tier_skill: input.tier.skill,
    tier_nodes: input.tier.nodes,
    tier_movetime_ms: input.tier.movetimeMs,
    movetime_ms: input.movetimeMs,
    ply: input.history.length,
    to_move: input.seat,
    in_check: isDropMiniXiangqiGeneralInCheck(input.state, input.seat),
    history: input.history.join(' '),
    legal_moves: legal.join(' '),
    legal_count: legal.length,
    attempts: input.attempts.length,
    reject_reason: last?.reason ?? null,
    last_output: last?.uci ?? last?.error ?? '(none)',
    attempts_detail: input.attempts
      .map((a) => `${a.attempt}:${a.uci ?? a.error ?? '(none)'}:${a.reason ?? 'ok'}`)
      .join(' | '),
  };
}

function dropMiniXiangqiFailClosedAlert(
  record: DropMiniXiangqiDecisionRecord,
): EngineAlertEmailPayload {
  return {
    severity: 'critical',
    kind: 'drop_mini_xiangqi_engine_failed_closed',
    variant: record.variant,
    room_id: record.room_id,
    engine_id: record.engine_id,
    engine_version: record.engine_version,
    revision: record.revision ?? 'unknown',
    ply: record.ply,
    to_move: record.to_move,
    reject_reason: record.reject_reason ?? 'unknown',
    last_output: record.last_output,
    history: record.history || '(startpos)',
  };
}

/**
 * Replace a move that lets the opponent win on the immediate reply with any legal
 * move that does not — a cheap king-safety backstop matching the Mini Xiangqi loop.
 */
function guardDropMiniXiangqiEngineMove(
  state: DropMiniXiangqiGameState,
  chosen: DropMiniXiangqiMove,
  legalMoves: readonly DropMiniXiangqiMove[],
): DropMiniXiangqiMove {
  if (!allowsImmediateOpponentWin(state, chosen)) return chosen;
  return legalMoves.find((move) => !allowsImmediateOpponentWin(state, move)) ?? chosen;
}

function allowsImmediateOpponentWin(
  state: DropMiniXiangqiGameState,
  move: DropMiniXiangqiMove,
): boolean {
  if (state.status.type !== 'playing') return false;
  const mover = state.status.turn;
  const opponent = mover === 'red' ? 'black' : 'red';
  const after = applyDropMiniXiangqiMove(state, move);
  if (after.status.type !== 'playing') return false;
  return getLegalDropMiniXiangqiMoves(after).some((reply) => {
    const afterReply = applyDropMiniXiangqiMove(after, reply);
    return afterReply.status.type === 'finished' && afterReply.status.winner === opponent;
  });
}
