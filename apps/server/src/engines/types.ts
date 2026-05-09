import type { Color, GameEvent, GameState, Move } from '@bichess/game';

export type EngineKind = 'builtin' | 'typescript-bundle' | 'wasm' | 'container';

export type EngineMoveContext = {
  events?: GameEvent[];
  state: GameState;
  color: Color;
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
