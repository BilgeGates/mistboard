import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CROSSROADS_CHESS_SPEC_ID,
  DARK_CHESS_SPEC_ID,
  DARK_DRAFT960_SPEC_ID,
  DARK_MINI_XIANGQI_SPEC_ID,
  gameSpecForId,
  JIEQI_SPEC_ID,
} from '@mistboard/game';
import {
  bucketForGame,
  DEFAULT_RATING_BUCKET,
  PUBLIC_RATING_TIME_CLASS,
  parseRatingVariant,
  type RatingVariant,
} from './rating-buckets.js';

test('default rating bucket uses the Dark chess game spec rating pool', () => {
  assert.deepEqual(DEFAULT_RATING_BUCKET, {
    variant: gameSpecForId(DARK_CHESS_SPEC_ID).ratingPoolBase as RatingVariant,
    timeClass: PUBLIC_RATING_TIME_CLASS,
  });
});

test('bucketForGame maps standard and Draft960 through game specs', () => {
  assert.deepEqual(bucketForGame({ initialMs: 180_000, incrementMs: 2_000 }), {
    variant: gameSpecForId(DARK_CHESS_SPEC_ID).ratingPoolBase,
    timeClass: 'blitz',
  });
  assert.deepEqual(
    bucketForGame({ initialMs: 180_000, incrementMs: 2_000, hiddenDraft960: true }),
    {
      variant: gameSpecForId(DARK_DRAFT960_SPEC_ID).ratingPoolBase,
      timeClass: 'blitz',
    },
  );
});

test('bucketForGame maps Dark Mini Xiangqi through its own rating pool', () => {
  assert.deepEqual(
    bucketForGame({
      variant: DARK_MINI_XIANGQI_SPEC_ID,
      initialMs: 180_000,
      incrementMs: 2_000,
    }),
    {
      variant: gameSpecForId(DARK_MINI_XIANGQI_SPEC_ID).ratingPoolBase,
      timeClass: 'blitz',
    },
  );
});

test('bucketForGame maps Crossroads Chess through its own open rating pool', () => {
  assert.deepEqual(
    bucketForGame({
      variant: CROSSROADS_CHESS_SPEC_ID,
      initialMs: 180_000,
      incrementMs: 2_000,
    }),
    {
      variant: gameSpecForId(CROSSROADS_CHESS_SPEC_ID).ratingPoolBase,
      timeClass: PUBLIC_RATING_TIME_CLASS,
    },
  );
});

test('bucketForGame fails closed for a casual-only spec (jieqi), never the fog pool', () => {
  // Jieqi has no current rating pool. A rated jieqi game at the public time
  // control must yield no bucket (so it is simply not rated) rather than fall
  // through to the dark-chess fallback and pollute the fog pool.
  assert.equal(
    bucketForGame({
      variant: JIEQI_SPEC_ID,
      initialMs: 180_000,
      incrementMs: 2_000,
    }),
    null,
  );
});

test('bucketForGame only rates the public rated time control', () => {
  assert.equal(bucketForGame({ initialMs: 60_000, incrementMs: 1_000 }), null);
  assert.equal(
    bucketForGame({
      variant: CROSSROADS_CHESS_SPEC_ID,
      initialMs: 300_000,
      incrementMs: 5_000,
    }),
    null,
  );
});

test('parseRatingVariant keeps legacy leaderboard API params stable', () => {
  assert.equal(parseRatingVariant('fog'), 'fog');
  assert.equal(parseRatingVariant('dark-chess'), 'fog');
  assert.equal(parseRatingVariant('fog_draft960'), 'fog_draft960');
  assert.equal(parseRatingVariant('fog-draft960'), 'fog_draft960');
  assert.equal(parseRatingVariant('dark-draft960'), 'fog_draft960');
  assert.equal(parseRatingVariant('dark-mini-xiangqi'), 'dark_mini_xiangqi');
  assert.equal(parseRatingVariant('dark_mini_xiangqi'), 'dark_mini_xiangqi');
  assert.equal(parseRatingVariant('crossroads-chess'), 'crossroads_chess_open');
  assert.equal(parseRatingVariant('crossroads_chess_open'), 'crossroads_chess_open');
  assert.equal(parseRatingVariant('dark-xiangqi'), null);
  assert.equal(parseRatingVariant('dark-shogi'), null);
});
