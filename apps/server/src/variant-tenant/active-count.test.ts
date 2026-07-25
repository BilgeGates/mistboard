import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { countActiveTenantGames } from './runtime.js';

// A minimal room shape the drain-gate counter reads: playing status + an
// optional time control (days-per-move => correspondence).
function room(type: string, daysPerMove?: number) {
  return {
    projection: {
      state: { status: { type } },
      timeControl: daysPerMove
        ? { initialMs: 0, incrementMs: 0, daysPerMove }
        : { initialMs: 300000, incrementMs: 0 },
    },
  };
}

describe('countActiveTenantGames (deploy drain gate)', () => {
  it('counts live in-progress games', () => {
    assert.equal(countActiveTenantGames([room('playing'), room('playing')]), 2);
  });

  it('ignores non-playing rooms', () => {
    assert.equal(countActiveTenantGames([room('finished'), room('aborted'), room('waiting')]), 0);
  });

  it('excludes correspondence (days-per-move) games so they never pin the drain gate', () => {
    // A multi-week correspondence game stays "playing" for days; it must not
    // block a deploy, whose restart is invisible at days-per-move cadence.
    assert.equal(countActiveTenantGames([room('playing', 3)]), 0);
    assert.equal(countActiveTenantGames([room('playing'), room('playing', 2)]), 1);
  });

  it('treats a missing time control as live (fail toward counting)', () => {
    assert.equal(
      countActiveTenantGames([{ projection: { state: { status: { type: 'playing' } } } }]),
      1,
    );
  });
});
