import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DARK_CHESS_SPEC_ID,
  DARK_DRAFT960_SPEC_ID,
  DARK_MINI_XIANGQI_SPEC_ID,
  gameSpecForId,
} from '@mistboard/game';
import {
  bucketForGame,
  DEFAULT_RATING_BUCKET,
  parseRatingVariant,
  type RatingVariant,
} from './rating-buckets.js';

test('default rating bucket uses the Dark chess game spec rating pool', () => {
  assert.deepEqual(DEFAULT_RATING_BUCKET, {
    variant: gameSpecForId(DARK_CHESS_SPEC_ID).ratingPoolBase as RatingVariant,
    timeClass: 'blitz',
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

test('parseRatingVariant keeps legacy leaderboard API params stable', () => {
  assert.equal(parseRatingVariant('fog'), 'fog');
  assert.equal(parseRatingVariant('dark-chess'), 'fog');
  assert.equal(parseRatingVariant('fog_draft960'), 'fog_draft960');
  assert.equal(parseRatingVariant('fog-draft960'), 'fog_draft960');
  assert.equal(parseRatingVariant('dark-draft960'), 'fog_draft960');
  assert.equal(parseRatingVariant('dark-mini-xiangqi'), 'dark_mini_xiangqi');
  assert.equal(parseRatingVariant('dark_mini_xiangqi'), 'dark_mini_xiangqi');
  assert.equal(parseRatingVariant('dark-xiangqi'), null);
  assert.equal(parseRatingVariant('dark-shogi'), null);
});
