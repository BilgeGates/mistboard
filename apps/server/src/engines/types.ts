import type { Color, GameState, Move } from '@bichess/game';

export type EngineKind = 'builtin' | 'typescript-bundle' | 'wasm' | 'container';

export type EngineMoveContext = {
  state: GameState;
  color: Color;
  legalMoves: Move[];
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

export type EngineDefinition = {
  id: string;
  engineId: string;
  engineName: string;
  name: string;
  kind: EngineKind;
  configHash: string;
  playSignature: string;
  config: Record<string, unknown>;
  notes?: string;
  chooseMove(context: EngineMoveContext): EngineMoveDecision;
};
