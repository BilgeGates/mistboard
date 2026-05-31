import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGameQueryWhere } from './persistence-games.js';
import { parseGameQueryFilters } from './routes/games.js';

// ── buildGameQueryWhere: parameterization + clause construction ─────────────

test('buildGameQueryWhere with no filters constrains to completed games only', () => {
  const { clause, values } = buildGameQueryWhere({});
  assert.equal(clause, `games.status = 'completed'`);
  assert.deepEqual(values, []);
});

test('buildGameQueryWhere binds every value as a sequential parameter', () => {
  const { clause, values } = buildGameQueryWhere({
    variant: 'dark-chess',
    mode: 'pvp',
    result: 'white-wins',
    rated: false,
  });
  assert.match(clause, /games\.variant = \$1/);
  assert.match(clause, /games\.mode = \$2/);
  assert.match(clause, /games\.result = \$3/);
  assert.match(clause, /games\.rated = \$4/);
  assert.deepEqual(values, ['dark-chess', 'pvp', 'white-wins', false]);
});

test('buildGameQueryWhere never interpolates filter values into the SQL string', () => {
  const injection = `x'; DROP TABLE games; --`;
  const { clause, values } = buildGameQueryWhere({ variant: injection });
  assert.ok(!clause.includes(injection), 'value must not appear inline in the clause');
  assert.match(clause, /games\.variant = \$1/);
  assert.deepEqual(values, [injection]);
});

test('buildGameQueryWhere expands a time class into its time-control pairs', () => {
  const { clause, values } = buildGameQueryWhere({ timeClass: 'blitz' });
  // 3+2 blitz → initial_ms 180000, increment_ms 2000, both bound as params.
  assert.match(clause, /games\.initial_ms = \$1 AND games\.increment_ms = \$2/);
  assert.deepEqual(values, [180_000, 2_000]);
});

test('buildGameQueryWhere applies ply and date bounds', () => {
  const from = new Date('2026-05-01T00:00:00.000Z');
  const to = new Date('2026-05-02T00:00:00.000Z');
  const { clause, values } = buildGameQueryWhere({
    plyMin: 20,
    plyMax: 200,
    endedFrom: from,
    endedTo: to,
  });
  assert.match(clause, /games\.ply_count >= \$1/);
  assert.match(clause, /games\.ply_count <= \$2/);
  assert.match(clause, /games\.ended_at >= \$3/);
  assert.match(clause, /games\.ended_at < \$4/);
  assert.deepEqual(values, [20, 200, from, to]);
});

// ── parseGameQueryFilters: validation + widening ────────────────────────────

function parse(query: string) {
  return parseGameQueryFilters(new URLSearchParams(query));
}

test('parseGameQueryFilters returns empty filters for an empty query', () => {
  const parsed = parse('');
  assert.ok('value' in parsed);
  assert.deepEqual(parsed.value, {});
});

test('parseGameQueryFilters rejects closed-set values it does not recognize', () => {
  assert.deepEqual(parse('mode=bogus'), { error: 'invalid_mode' });
  assert.deepEqual(parse('result=tie'), { error: 'invalid_result' });
  assert.deepEqual(parse('rated=maybe'), { error: 'invalid_rated' });
  assert.deepEqual(parse('timeClass=hyperbullet'), { error: 'invalid_time_class' });
  assert.deepEqual(parse('plyMin=-3'), { error: 'invalid_ply_min' });
  assert.deepEqual(parse('from=05-01-2026'), { error: 'invalid_from' });
});

test('parseGameQueryFilters maps rated true/false to a boolean', () => {
  const rated = parse('rated=true');
  assert.ok('value' in rated);
  assert.equal(rated.value.rated, true);
  const casual = parse('rated=false');
  assert.ok('value' in casual);
  assert.equal(casual.value.rated, false);
});

test('parseGameQueryFilters widens `to` to the end of the requested UTC day', () => {
  const parsed = parse('from=2026-05-01&to=2026-05-01');
  assert.ok('value' in parsed);
  assert.equal(parsed.value.endedFrom?.toISOString(), '2026-05-01T00:00:00.000Z');
  // Inclusive of all of 2026-05-01: upper bound is exclusive start of next day.
  assert.equal(parsed.value.endedTo?.toISOString(), '2026-05-02T00:00:00.000Z');
});

test('parseGameQueryFilters carries through valid filters', () => {
  const parsed = parse('variant=dark-chess&mode=pvp&timeClass=blitz&plyMin=20&offset=50&limit=25');
  assert.ok('value' in parsed);
  assert.deepEqual(parsed.value, {
    variant: 'dark-chess',
    mode: 'pvp',
    timeClass: 'blitz',
    plyMin: 20,
    offset: 50,
    limit: 25,
  });
});
