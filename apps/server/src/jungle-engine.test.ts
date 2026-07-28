import assert from 'node:assert/strict';
import test from 'node:test';
import { buildJunglePositionCommand, JUNGLE_RUST_LADDER } from './jungle-engine.js';

test('Jungle position command carries semicolon-delimited repetition seeds', () => {
  const current = '7/7/7/7/7/7/7/7/R5e b 11 45';
  const seeds = ['7/7/7/7/7/7/7/7/R5e r 3 41', '7/7/7/7/7/7/7/7/1R4e b 4 41'];
  assert.equal(
    buildJunglePositionCommand(current, seeds),
    `position fen ${current} reps ${seeds.join(';')}`,
  );
  assert.equal(buildJunglePositionCommand(current), `position fen ${current}`);
});

// Node budget is the difficulty dial, so a rung that does not out-search the one below
// it is a broken ladder, not a mild mis-tune. Raising one rung past the next is the easy
// way to do that by hand (level 2 and level 3 were one bump apart before the 2026-07-27
// budget raise). The latency ceiling must widen with the budget for the same reason: a
// rung whose ceiling clamps before its node budget is spent is CPU-dependent rather than
// CPU-independent strength, which is the property the node dial exists to give.
test('Jungle Rust ladder is strictly stronger and no tighter on latency per rung', () => {
  for (let i = 1; i < JUNGLE_RUST_LADDER.length; i += 1) {
    const lower = JUNGLE_RUST_LADDER[i - 1]!;
    const upper = JUNGLE_RUST_LADDER[i]!;
    assert.ok(
      upper.nodes > lower.nodes,
      `${upper.id} (${upper.nodes} nodes) must out-search ${lower.id} (${lower.nodes} nodes)`,
    );
    assert.ok(
      upper.movetimeCapMs >= lower.movetimeCapMs,
      `${upper.id} searches more nodes than ${lower.id} but is allowed less time`,
    );
  }
});
