import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRoundRobinPairings,
  nextTournamentSeed,
  parseTournamentArgs,
  tournamentJobConfig,
} from './engine-tournament.js';

test('creates color-balanced round-robin pairings', () => {
  const pairings = createRoundRobinPairings({
    engines: ['a', 'b', 'c'],
    gamesPerPair: 2,
  });

  assert.equal(pairings.length, 6);
  assert.deepEqual(pairings.map((pairing) => [pairing.whiteEngineId, pairing.blackEngineId]), [
    ['a', 'b'],
    ['b', 'a'],
    ['a', 'c'],
    ['c', 'a'],
    ['b', 'c'],
    ['c', 'b'],
  ]);
  assert.deepEqual(pairings.map((pairing) => pairing.gameIndex), [0, 1, 2, 3, 4, 5]);
});

test('parses tournament CLI config', () => {
  const config = parseTournamentArgs([
    '--engines',
    'builtin-random-legal,builtin-capture-seeker',
    '--games-per-pair',
    '4',
    '--time-control',
    '10+2',
    '--opening',
    'random-first-4',
    '--providers',
    'local',
    '--tournament-id',
    'dev-cup',
  ], {});

  assert.equal(config.gamesPerPair, 4);
  assert.deepEqual(config.providers, ['local']);
  assert.deepEqual(config.timeControl, {
    kind: 'standard',
    initial_seconds: 10,
    increment_seconds: 2,
  });
  assert.deepEqual(config.openingPolicy, { kind: 'random_first_n_plies', n: 4 });
});

test('defaults tournament CLI time control to standard 3+2', () => {
  const config = parseTournamentArgs([
    '--engine',
    'builtin-random-legal',
    '--engine',
    'builtin-capture-seeker',
  ], {});

  assert.deepEqual(config.timeControl, {
    kind: 'standard',
    initial_seconds: 180,
    increment_seconds: 2,
  });
});

test('builds reproducible tournament job metadata', () => {
  const config = parseTournamentArgs([
    '--engine',
    'a',
    '--engine',
    'b',
    '--seed',
    '100',
    '--tournament-id',
    'server-cup',
  ], {});
  const jobConfig = tournamentJobConfig(config, 2);

  assert.equal(nextTournamentSeed(config.seed, 3), '103');
  assert.deepEqual(jobConfig.tournament, {
    id: 'server-cup',
    format: 'round-robin',
    engines: ['a', 'b'],
    games_per_pair: 2,
    color_policy: 'alternate-by-repeat',
  });
});
