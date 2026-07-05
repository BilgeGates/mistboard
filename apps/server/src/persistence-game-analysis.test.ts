import {
  getGameAnalysis,
  type StoredPlyEval,
  saveGameAnalysis,
} from './persistence-game-analysis.js';
import { assert, definePersistenceTests, test } from './persistence-test-support.js';

const plies = (n: number): StoredPlyEval[] =>
  Array.from({ length: n }, (_, i) => ({ ply: i, cp: i * 10, mate: null, best: null }));

definePersistenceTests('game-analysis', () => {
  test('a missing analysis reads back null', async () => {
    assert.equal(await getGameAnalysis('nope', 'pikafish', 12), null);
  });

  test('saves and reads back the eval series verbatim', async () => {
    const series = [
      { ply: 0, cp: 30, mate: null, best: 'h2e2' },
      { ply: 1, cp: null, mate: 3, best: 'g6g9' },
    ];
    await saveGameAnalysis('room-a', 'pikafish', 12, series);
    assert.deepEqual(await getGameAnalysis('room-a', 'pikafish', 12), series);
  });

  test('save is idempotent: the first writer wins, a repeat is a no-op', async () => {
    await saveGameAnalysis('room-b', 'pikafish', 12, plies(2));
    await saveGameAnalysis('room-b', 'pikafish', 12, plies(5)); // ignored
    assert.equal((await getGameAnalysis('room-b', 'pikafish', 12))?.length, 2);
  });

  test('engine id and depth are part of the key (separate rows)', async () => {
    await saveGameAnalysis('room-c', 'pikafish', 12, plies(2));
    await saveGameAnalysis('room-c', 'pikafish', 18, plies(4));
    await saveGameAnalysis('room-c', 'fsf', 12, plies(6));
    assert.equal((await getGameAnalysis('room-c', 'pikafish', 12))?.length, 2);
    assert.equal((await getGameAnalysis('room-c', 'pikafish', 18))?.length, 4);
    assert.equal((await getGameAnalysis('room-c', 'fsf', 12))?.length, 6);
  });
});
