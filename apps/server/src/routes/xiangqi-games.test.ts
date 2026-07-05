import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeXiangqiPostgame } from './xiangqi-games.js';

test('analyzeXiangqiPostgame extracts moves, converts to Pikafish UCI, runs the job', async () => {
  let seen: string[] = [];
  const result = await analyzeXiangqiPostgame(
    {
      timeline: [
        { type: 'move-played', move: { from: 'h3', to: 'e3' } },
        { type: 'clock-expired' }, // non-move terminal, skipped
        { type: 'move-played', move: { from: 'h10', to: 'g8' } },
      ],
    },
    async (moves) => {
      seen = moves;
      return moves.map((_, i) => ({ ply: i + 1, cp: 0, mate: null, best: null }));
    },
  );
  // Pikafish rank-1 shift applied; the non-move entry is dropped.
  assert.deepEqual(seen, ['h2e2', 'h9g7']);
  assert.equal(result.plies.length, 2);
  assert.equal(result.engineId.length > 0, true);
  assert.equal(result.depth, 12);
});
