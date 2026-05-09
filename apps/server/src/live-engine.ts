import type { Move } from '@bichess/game';
import {
  defaultEngineId,
  loadEngine,
  type EngineDefinition,
  type EngineMoveContext,
  type EngineMoveDecision,
} from './engine-registry.js';

export type LiveEngineFallbackReason =
  | 'timeout'
  | 'unsupported_engine'
  | 'illegal_move'
  | 'internal_error';

export type LiveEngineFallbackEvent = {
  durationMs: number;
  engineId: string;
  fallbackEngineId: string;
  ply: number;
  reason: LiveEngineFallbackReason;
};

export type LiveEngineMoveResult = {
  decision: EngineMoveDecision;
  engineId: string;
  fallback: boolean;
};

type ChooseLiveEngineMoveOptions = {
  context: EngineMoveContext;
  engine: EngineDefinition;
  onFallback?: (event: LiveEngineFallbackEvent) => void;
  timeoutMs?: number;
};

const DEFAULT_LIVE_ENGINE_TIMEOUT_MS = 3_000;

export async function chooseLiveEngineMove({
  context,
  engine,
  onFallback,
  timeoutMs = DEFAULT_LIVE_ENGINE_TIMEOUT_MS,
}: ChooseLiveEngineMoveOptions): Promise<LiveEngineMoveResult> {
  const startedAt = Date.now();
  try {
    const decision = await chooseWithTimeout(engine, context, engine.livePolicy?.timeoutMs ?? timeoutMs);
    validateDecision(engine.id, decision, context.legalMoves);
    return { decision, engineId: engine.id, fallback: false };
  } catch (err) {
    const reason = fallbackReason(err);
    const fallbackEngineId = engine.livePolicy?.fallbackEngineId === undefined
      ? defaultEngineId()
      : engine.livePolicy.fallbackEngineId;
    if (!fallbackEngineId || fallbackEngineId === engine.id) throw err;

    const fallbackEngine = loadEngine(fallbackEngineId);
    const decision = await chooseWithTimeout(fallbackEngine, context, fallbackEngine.livePolicy?.timeoutMs ?? timeoutMs);
    validateDecision(fallbackEngine.id, decision, context.legalMoves);
    onFallback?.({
      durationMs: Date.now() - startedAt,
      engineId: engine.id,
      fallbackEngineId,
      ply: context.ply,
      reason,
    });
    return { decision, engineId: fallbackEngineId, fallback: true };
  }
}

async function chooseWithTimeout(
  engine: EngineDefinition,
  context: EngineMoveContext,
  timeoutMs: number,
): Promise<EngineMoveDecision> {
  if (!engine.chooseMove) throw new LiveEngineError('unsupported_engine', `engine ${engine.id} does not support live move selection`);
  if (timeoutMs <= 0) return Promise.resolve().then(() => engine.chooseMove!(context));

  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      Promise.resolve().then(() => engine.chooseMove!(context)),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new LiveEngineError('timeout', `engine ${engine.id} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function validateDecision(engineId: string, decision: EngineMoveDecision, legalMoves: Move[]): void {
  if (!legalMoves.some((move) => movesMatch(move, decision.move))) {
    throw new LiveEngineError('illegal_move', `engine ${engineId} returned an illegal move`);
  }
}

function movesMatch(left: Move, right: Move): boolean {
  return left.from === right.from
    && left.to === right.to
    && (left.promotion ?? null) === (right.promotion ?? null);
}

function fallbackReason(err: unknown): LiveEngineFallbackReason {
  return err instanceof LiveEngineError ? err.reason : 'internal_error';
}

class LiveEngineError extends Error {
  constructor(readonly reason: LiveEngineFallbackReason, message: string) {
    super(message);
  }
}
