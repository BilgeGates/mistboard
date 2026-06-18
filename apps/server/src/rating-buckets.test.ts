import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BANQI_SPEC_ID,
  CROSSROADS_CHESS_SPEC_ID,
  DARK_CHESS_SPEC_ID,
  DARK_DRAFT960_SPEC_ID,
  DARK_MINI_XIANGQI_SPEC_ID,
  DARK_SHOGI_SPEC_ID,
  DARK_XIANGQI_SPEC_ID,
  gameSpecForId,
  JIEQI_SPEC_ID,
  REVEAL_CHESS_SPEC_ID,
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

test('bucketForGame maps Jieqi and Banqi through their own rating pools', () => {
  assert.deepEqual(
    bucketForGame({ variant: JIEQI_SPEC_ID, initialMs: 180_000, incrementMs: 2_000 }),
    { variant: gameSpecForId(JIEQI_SPEC_ID).ratingPoolBase, timeClass: PUBLIC_RATING_TIME_CLASS },
  );
  // Banqi must bucket into its OWN pool, never fall through to fog. The old
  // ratingSpecForGame had a jieqi arm but no banqi arm, so a rated banqi game
  // would have mis-credited the fog pool — this is the regression guard.
  assert.deepEqual(
    bucketForGame({ variant: BANQI_SPEC_ID, initialMs: 180_000, incrementMs: 2_000 }),
    { variant: gameSpecForId(BANQI_SPEC_ID).ratingPoolBase, timeClass: PUBLIC_RATING_TIME_CLASS },
  );
  assert.deepEqual(
    bucketForGame({ variant: REVEAL_CHESS_SPEC_ID, initialMs: 180_000, incrementMs: 2_000 }),
    {
      variant: gameSpecForId(REVEAL_CHESS_SPEC_ID).ratingPoolBase,
      timeClass: PUBLIC_RATING_TIME_CLASS,
    },
  );
  // Full Dark Xiangqi buckets into its OWN pool, never the fog fallback.
  assert.deepEqual(
    bucketForGame({ variant: DARK_XIANGQI_SPEC_ID, initialMs: 180_000, incrementMs: 2_000 }),
    {
      variant: gameSpecForId(DARK_XIANGQI_SPEC_ID).ratingPoolBase,
      timeClass: PUBLIC_RATING_TIME_CLASS,
    },
  );
});

test('bucketForGame fails closed for a casual-only spec (dark-shogi), never the fog pool', () => {
  // A spec with no active rating pool must yield no bucket (simply not rated)
  // rather than fall through to the dark-chess fallback and pollute the fog pool.
  assert.equal(
    bucketForGame({ variant: DARK_SHOGI_SPEC_ID, initialMs: 180_000, incrementMs: 2_000 }),
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
  assert.equal(parseRatingVariant('jieqi'), 'jieqi');
  assert.equal(parseRatingVariant('banqi'), 'banqi');
  assert.equal(parseRatingVariant('reveal-chess'), 'reveal_chess');
  assert.equal(parseRatingVariant('dark-xiangqi'), 'dark_xiangqi');
  assert.equal(parseRatingVariant('dark_xiangqi'), 'dark_xiangqi');
  assert.equal(parseRatingVariant('dark-shogi'), null);
});
