import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHistoricalXiangqiGameQuery } from './historical-xiangqi-games.js';

function parse(query: string) {
  return parseHistoricalXiangqiGameQuery(new URLSearchParams(query));
}

test('historical xiangqi game query parser accepts search filters', () => {
  const parsed = parse(
    'source=classic&player=Hu%20Ronghua&event=river&result=1-0&from=1982-04-03&to=1982-04-03&plyMin=20&plyMax=100&offset=50&limit=25',
  );
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.filters, {
    sourceSlug: 'classic',
    player: 'Hu Ronghua',
    event: 'river',
    result: '1-0',
    playedFrom: '1982-04-03',
    playedTo: '1982-04-04',
    plyMin: 20,
    plyMax: 100,
    offset: 50,
    limit: 25,
  });
});

test('historical xiangqi game query parser rejects malformed filters', () => {
  assert.deepEqual(parse('result=red-wins'), { ok: false, error: 'invalid_result' });
  assert.deepEqual(parse('from=1982-4-3'), { ok: false, error: 'invalid_from' });
  assert.deepEqual(parse('to=1982-02-31'), { ok: false, error: 'invalid_to' });
  assert.deepEqual(parse('plyMin=-1'), { ok: false, error: 'invalid_ply_min' });
  assert.deepEqual(parse('limit=0'), { ok: false, error: 'invalid_limit' });
});
