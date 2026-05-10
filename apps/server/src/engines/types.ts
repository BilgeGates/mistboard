import type { Color, GameEvent, GameState, Move } from '@mistboard/game';

export type EngineKind = 'builtin' | 'typescript-bundle' | 'wasm' | 'container';

export type EngineMoveContext = {
  baseThinkTimeMs?: number;
  clockRemainingMs?: number;
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
  chooseMove?: (context: EngineMoveContext) => EngineMoveDecision;
};
