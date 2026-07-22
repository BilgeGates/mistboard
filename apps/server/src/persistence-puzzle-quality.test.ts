import { randomUUID } from 'node:crypto';
import { XIANGQI_SPEC_ID } from '@mistboard/game';
import { getPool } from './persistence-db.js';
import {
  listPuzzleQualityAggregates,
  recordPuzzleQualityEvent,
  recordPuzzleQualityVote,
} from './persistence-puzzle-quality.js';
import { assert, definePersistenceTests, test } from './persistence-test-support.js';
import { getPuzzleStore } from './puzzle-store.js';

definePersistenceTests('puzzle quality', () => {
  test('records one privacy-minimal session with an immutable terminal outcome', async () => {
    const puzzle = (await getPuzzleStore()).puzzles.find(
      (candidate) => candidate.variant === XIANGQI_SPEC_ID,
    );
    assert.ok(puzzle);
    const sessionId = randomUUID();
    const input = { puzzleId: puzzle.id, sessionId, variant: puzzle.variant };

    await recordPuzzleQualityEvent({ ...input, event: 'view' });
    await recordPuzzleQualityEvent({ ...input, event: 'view' });
    await recordPuzzleQualityEvent({ ...input, event: 'wrong' });
    await recordPuzzleQualityEvent({ ...input, event: 'hint' });
    await recordPuzzleQualityEvent({ ...input, event: 'solve' });
    await recordPuzzleQualityEvent({ ...input, event: 'abandon' });
    await recordPuzzleQualityVote({ ...input, vote: 'down' });
    await recordPuzzleQualityVote({ ...input, vote: 'up' });

    const aggregate = (await listPuzzleQualityAggregates(getPool(), XIANGQI_SPEC_ID)).find(
      (candidate) => candidate.puzzleId === puzzle.id,
    );
    assert.ok(aggregate);
    assert.equal(aggregate.sessions, 1);
    assert.equal(aggregate.starts, 1);
    assert.equal(aggregate.solves, 1);
    assert.equal(aggregate.abandons, 0);
    assert.equal(aggregate.wrongAttempts, 1);
    assert.equal(aggregate.hints, 1);
    assert.equal(aggregate.cleanSolves, 0);
    assert.equal(aggregate.votesUp, 1);
    assert.equal(aggregate.votesDown, 0);
  });
});
