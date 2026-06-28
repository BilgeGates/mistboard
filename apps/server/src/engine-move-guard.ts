/**
 * Shared engine-move boundary for variant PvE engines.
 *
 * Every variant engine (FSF subprocess or internal FoW engine) must, on a bad
 * move, be VISIBLE and FAIL CLOSED — never silently substitute a threat-blind
 * `legalMoves[0]`. Before this existed each engine reimplemented (or skipped)
 * that, and the `engine_fallback_rate` page in obs.ts was blind to all of them,
 * which is how "engine plays weak live, can't reproduce" kept recurring.
 *
 * This module owns the three things that must always happen together:
 *   1. count the move (engineCounters → fallback-rate page),
 *   2. capture a complete, replayable decision record,
 *   3. alert on a fail-closed event.
 * plus a generic retry+validate loop for the FSF/UCI engines.
 *
 * Terminal action stays per-engine (perfect-info → resign; fog → forfeit/observe)
 * because an illegal move means different things under perfect vs imperfect info.
 */
import { getBuildInfo } from './build-info.js';
import { type EngineAlertEmailPayload, sendEngineAlertNotification } from './engine-alert-email.js';
import { engineCounters, logger } from './obs.js';

export type EngineMoveRejectReason = 'request-failed' | 'illegal-move' | 'no-move';

export type EngineMoveAttempt = {
  attempt: number;
  uci: string | null;
  error: string | null;
  reason: EngineMoveRejectReason | null;
};

// Flat, log-and-replay friendly. `history` + the tier fields determine the exact
// engine call; replay tools reconstruct from this alone.
export type EngineDecisionRecord = {
  variant: string;
  room_id: string;
  engine_id: string;
  engine_version: string;
  revision: string | null;
  movetime_ms: number;
  tier_skill: number | null;
  tier_nodes: number | null;
  tier_movetime_ms: number | null;
  ply: number;
  to_move: string;
  in_check: boolean;
  // FEN of the position, for engines fed a FEN (banqi/jieqi). null for engines
  // replayed purely from move history (drop-mini, mini-xiangqi).
  fen: string | null;
  history: string;
  legal_moves: string;
  legal_count: number;
  attempts: number;
  reject_reason: EngineMoveRejectReason | null;
  last_output: string;
  attempts_detail: string;
};

export function buildEngineDecisionRecord(input: {
  variant: string;
  roomId: string;
  engineId: string;
  engineVersion: string;
  movetimeMs: number;
  tier?: { skill?: number; nodes?: number; movetimeMs?: number } | null;
  ply: number;
  toMove: string;
  inCheck: boolean;
  fen?: string | null;
  history: string[];
  legalUci: string[];
  attempts: EngineMoveAttempt[];
}): EngineDecisionRecord {
  const last = input.attempts[input.attempts.length - 1];
  return {
    variant: input.variant,
    room_id: input.roomId,
    engine_id: input.engineId,
    engine_version: input.engineVersion,
    revision: getBuildInfo().revision,
    movetime_ms: input.movetimeMs,
    tier_skill: input.tier?.skill ?? null,
    tier_nodes: input.tier?.nodes ?? null,
    tier_movetime_ms: input.tier?.movetimeMs ?? null,
    ply: input.ply,
    to_move: input.toMove,
    in_check: input.inCheck,
    fen: input.fen ?? null,
    history: input.history.join(' '),
    legal_moves: input.legalUci.join(' '),
    legal_count: input.legalUci.length,
    attempts: input.attempts.length,
    reject_reason: last?.reason ?? null,
    last_output: last?.uci ?? last?.error ?? '(none)',
    attempts_detail: input.attempts
      .map((a) => `${a.attempt}:${a.uci ?? a.error ?? '(none)'}:${a.reason ?? 'ok'}`)
      .join(' | '),
  };
}

function engineFailClosedAlert(record: EngineDecisionRecord): EngineAlertEmailPayload {
  return {
    severity: 'critical',
    kind: 'engine_failed_closed',
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
 * A move was accepted: count it as a non-fallback move so the fallback-rate
 * denominator includes this engine.
 */
export function reportEngineMoveOk(): void {
  engineCounters.recordMove(false);
}

/**
 * The engine could not produce an acceptable move. Count it as a fallback, log
 * the full record at error, and page immediately. For perfect-information
 * engines where a rejected move is unambiguously a bug. The caller still
 * performs the terminal action (resign / forfeit).
 */
export function reportEngineFallback(
  record: EngineDecisionRecord,
  logKind: string,
  message: string,
): void {
  engineCounters.recordMove(true);
  logger.error({ kind: logKind, ...record }, message);
  void sendEngineAlertNotification(engineFailClosedAlert(record)).catch(() => {});
}

/**
 * Fog/imperfect-information variant: the engine's move was rejected, but under
 * fog that can be a legitimate consequence of hidden information (e.g. a slider
 * blocked by a hidden piece), not necessarily a bug. So count it (a SPIKE still
 * pages via engine_fallback_rate) and log the full record at warn, but do not
 * fire a per-event critical page. The caller still performs its fallback.
 */
export function reportObservedFallback(
  record: EngineDecisionRecord,
  logKind: string,
  message: string,
): void {
  engineCounters.recordMove(true);
  logger.warn({ kind: logKind, ...record }, message);
}

/**
 * Bounded-retry + kernel-validate loop for any move-serving engine. A fresh
 * engine call can diverge (FSF is nondeterministic), so a transient bad output
 * often clears on the next attempt. The caller supplies `requestMove` (closing
 * over its own args — uci-history for FSF, FEN+nodes for banqi, etc.) and
 * `validate` (parse + legality against the kernel). Returns the kernel move (or
 * null after the budget) plus the attempt trail for the decision record.
 * `aborted` means the turn changed under us (clock expiry, opponent move) and
 * the caller should just return.
 */
export async function resolveValidatedEngineMove<M>(input: {
  maxAttempts: number;
  requestMove: () => Promise<string | null>;
  validate: (uci: string) => M | null;
  stillOnTurn: () => boolean;
  onReject: (info: {
    attempt: number;
    maxAttempts: number;
    uci: string | null;
    reason: EngineMoveRejectReason;
    error: string | null;
  }) => void;
}): Promise<{ chosen: M | null; attempts: EngineMoveAttempt[]; aborted: boolean }> {
  const attempts: EngineMoveAttempt[] = [];
  for (let attempt = 1; attempt <= input.maxAttempts; attempt += 1) {
    if (!input.stillOnTurn()) return { chosen: null, attempts, aborted: true };
    let uci: string | null = null;
    let error: string | null = null;
    try {
      uci = await input.requestMove();
    } catch (err) {
      error = (err as Error).message;
    }
    if (!input.stillOnTurn()) return { chosen: null, attempts, aborted: true };
    const match = !error && uci ? input.validate(uci) : null;
    const reason: EngineMoveRejectReason | null = match
      ? null
      : error
        ? 'request-failed'
        : uci
          ? 'illegal-move'
          : 'no-move';
    attempts.push({ attempt, uci, error, reason });
    if (match) return { chosen: match, attempts, aborted: false };
    input.onReject({ attempt, maxAttempts: input.maxAttempts, uci, reason: reason!, error });
  }
  return { chosen: null, attempts, aborted: false };
}
