import type { EngineDefinition } from '../types.js';

export const randomLegalEngine: EngineDefinition = {
  id: 'builtin-random-legal',
  engineId: 'random-legal',
  engineName: 'Random Legal',
  name: 'Random Legal v1',
  kind: 'builtin',
  configHash: 'builtin-random-legal-v1',
  playSignature: 'builtin-random-legal-v1',
  config: { kind: 'builtin', strategy: 'random-legal', version: 1 },
  livePolicy: { fallbackEngineId: null },
  notes: 'Deterministic random legal move baseline for EvE smoke and calibration.',
  chooseMove(context) {
    const move = context.legalMoves[Number(context.seed % BigInt(context.legalMoves.length))]!;
    return {
      move,
      scores: context.legalMoves.map((candidate) => ({
        move: candidate,
        score: 0,
        reason: 'uniform',
      })),
    };
  },
};
