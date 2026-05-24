import assert from 'node:assert/strict';
import test from 'node:test';
import {
  conservativeRating,
  DEFAULT_RD,
  decayInactive,
  defaultRating,
  type Glicko2,
  isProvisional,
  rate,
} from './glicko.js';

// Glickman's canonical worked example ("Example of the Glicko-2 system", 2013):
// player (1500, 200, 0.06) plays three games in one rating period —
//   vs (1400, 30)  result win
//   vs (1550, 100) result loss
//   vs (1700, 300) result loss
// Published outputs: rating ~1464.06, RD ~151.52, volatility ~0.05999.
test('matches Glickman published worked example', () => {
  const player: Glicko2 = { rating: 1500, rd: 200, volatility: 0.06 };
  const result = rate(player, [
    { opponentRating: 1400, opponentRd: 30, score: 1 },
    { opponentRating: 1550, opponentRd: 100, score: 0 },
    { opponentRating: 1700, opponentRd: 300, score: 0 },
  ]);

  assert.ok(Math.abs(result.rating - 1464.06) < 0.1, `rating ${result.rating}`);
  assert.ok(Math.abs(result.rd - 151.52) < 0.1, `rd ${result.rd}`);
  assert.ok(Math.abs(result.volatility - 0.05999) < 0.0001, `vol ${result.volatility}`);
});

test('a win raises rating, a loss lowers it', () => {
  const base = defaultRating();
  const won = rate(base, [{ opponentRating: 1500, opponentRd: 50, score: 1 }]);
  const lost = rate(base, [{ opponentRating: 1500, opponentRd: 50, score: 0 }]);
  assert.ok(won.rating > base.rating);
  assert.ok(lost.rating < base.rating);
});

test('RD shrinks after playing a game (uncertainty drops)', () => {
  const base = defaultRating(); // RD 350
  const after = rate(base, [{ opponentRating: 1500, opponentRd: 50, score: 1 }]);
  assert.ok(after.rd < base.rd, `rd ${after.rd} should be < ${base.rd}`);
});

test('beating a strong, settled opponent moves rating more than beating a weak one', () => {
  const base: Glicko2 = { rating: 1500, rd: 80, volatility: 0.06 };
  const beatStrong = rate(base, [{ opponentRating: 1800, opponentRd: 40, score: 1 }]);
  const beatWeak = rate(base, [{ opponentRating: 1200, opponentRd: 40, score: 1 }]);
  assert.ok(beatStrong.rating - base.rating > beatWeak.rating - base.rating);
});

test('new player converges fast (high RD = big first moves)', () => {
  // A strong player on a fresh account should climb quickly, not grind — this is
  // the property that makes smurfing self-correct, per the anti-abuse plan.
  let p = defaultRating();
  for (let i = 0; i < 10; i++) {
    p = rate(p, [{ opponentRating: 1500, opponentRd: 60, score: 1 }]);
  }
  assert.ok(p.rating > 1700, `after 10 straight wins rating is ${p.rating}, expected > 1700`);
  assert.ok(p.rd < 150, `RD should have tightened, got ${p.rd}`);
});

test('inactivity inflates RD but not rating, capped at default', () => {
  const settled: Glicko2 = { rating: 1700, rd: 60, volatility: 0.06 };
  const decayed = decayInactive(settled, 50);
  assert.equal(decayed.rating, 1700);
  assert.ok(decayed.rd > settled.rd);
  assert.ok(decayed.rd <= DEFAULT_RD);
});

test('provisional + conservative rating helpers', () => {
  assert.equal(isProvisional(DEFAULT_RD), true);
  assert.equal(isProvisional(80), false);
  const r: Glicko2 = { rating: 1600, rd: 50, volatility: 0.06 };
  assert.equal(conservativeRating(r), 1500);
});

test('default rating is 1500 / 350 / 0.06', () => {
  assert.deepEqual(defaultRating(), { rating: 1500, rd: 350, volatility: 0.06 });
});
