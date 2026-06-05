import type { Color, GameEvent, GameState, Move } from '@mistboard/game';

export type EngineKind = 'builtin' | 'typescript-bundle' | 'wasm' | 'container';

export type EngineMoveContext = {
  baseThinkTimeMs?: number;
  clockRemainingMs?: number;
  engineReservationId?: string;
  events?: GameEvent[];
  state: GameState;
  color: Color;
  incrementMs?: number;
  legalMoves: Move[];
  roomId?: string;
  seed: bigint;
  ply: number;
};

export type EngineMoveScore = {
  move: Move;
  score: number;
  reason: string;
};

export type EngineMoveDecision = {
  move: Move;
  scores: EngineMoveScore[];
  thinkTimeMs?: number;
  // Opaque per-move engine telemetry (e.g. v2 belief size, GT-CFR iters, full
  // move ranking) for the live-engine-decision debug artifact. Optional;
  // non-remote engines don't set it.
  diagnostics?: Record<string, unknown>;
};

export type EngineLivePolicy = {
  timeoutMs?: number;
  fallbackEngineId?: string | null;
};

export type EngineDefinition = {
  id: string;
  engineId: string;
  engineName: string;
  name: string;
  kind: EngineKind;
  configHash: string;
  playSignature: string;
  config: Record<string, unknown>;
  livePolicy?: EngineLivePolicy;
  notes?: string;
  /**
   * Game variant this engine plays (e.g. 'dark-mini-xiangqi'). Absent ⇒ dark
   * chess (the default). Drives the worker `--game` flag and the request's
   * gameSpecId so the engine interprets the right board geometry + piece set.
   */
  gameSpecId?: string;
  chooseMove?: (context: EngineMoveContext) => EngineMoveDecision;
};
