import {
  CROSSROADS_CHESS_SPEC_ID,
  DARK_CHESS_SPEC_ID,
  DARK_DRAFT960_SPEC_ID,
  DARK_MINI_XIANGQI_SPEC_ID,
  type GameSpecId,
  gameSpecForId,
  type RatingPoolBaseId,
  type TimeClass,
  timeClassFromTimeControl,
} from '@mistboard/game';

export type RatingVariant = Extract<
  RatingPoolBaseId,
  'fog' | 'fog_draft960' | 'dark_mini_xiangqi' | 'crossroads_chess_open'
>;
export type RatingTimeClass = TimeClass;

export type RatingBucket = {
  variant: RatingVariant;
  timeClass: RatingTimeClass;
};

export const PUBLIC_RATING_TIME_CLASS: RatingTimeClass = 'blitz';

export const DEFAULT_RATING_BUCKET: RatingBucket = {
  variant: currentRatingVariantForSpec(DARK_CHESS_SPEC_ID),
  timeClass: PUBLIC_RATING_TIME_CLASS,
};

type BucketInput = {
  variant?: string | null;
  initialMs?: number | null;
  incrementMs?: number | null;
  hiddenDraft960?: boolean | null;
};

export function bucketForGame(input: BucketInput): RatingBucket | null {
  const timeClass = timeClassFromTimeControl(input.initialMs, input.incrementMs);
  if (!timeClass) return null;
  if (timeClass !== PUBLIC_RATING_TIME_CLASS) return null;
  const variant = currentRatingVariantForSpec(ratingSpecForGame(input));
  return { variant, timeClass: PUBLIC_RATING_TIME_CLASS };
}

export function parseRatingVariant(value: string | null | undefined): RatingVariant | null {
  if (value === 'fog' || value === 'dark-chess') return 'fog';
  if (value === 'fog_draft960' || value === 'fog-draft960' || value === 'dark-draft960')
    return 'fog_draft960';
  if (value === 'dark_mini_xiangqi' || value === 'dark-mini-xiangqi') return 'dark_mini_xiangqi';
  if (value === 'crossroads_chess_open' || value === 'crossroads-chess')
    return 'crossroads_chess_open';
  return null;
}

export function parseRatingTimeClass(value: string | null | undefined): RatingTimeClass | null {
  if (value === 'bullet') return 'bullet';
  if (value === 'blitz') return 'blitz';
  if (value === 'rapid') return 'rapid';
  return null;
}

function ratingSpecForGame(input: BucketInput): GameSpecId {
  if (input.variant === CROSSROADS_CHESS_SPEC_ID) return CROSSROADS_CHESS_SPEC_ID;
  if (input.variant === DARK_MINI_XIANGQI_SPEC_ID) return DARK_MINI_XIANGQI_SPEC_ID;
  return input.hiddenDraft960 ? DARK_DRAFT960_SPEC_ID : DARK_CHESS_SPEC_ID;
}

function currentRatingVariantForSpec(id: GameSpecId): RatingVariant {
  const ratingPool = gameSpecForId(id).ratingPoolBase;
  if (
    ratingPool === 'fog' ||
    ratingPool === 'fog_draft960' ||
    ratingPool === 'dark_mini_xiangqi' ||
    ratingPool === 'crossroads_chess_open'
  )
    return ratingPool;
  throw new Error(`game spec ${id} is not a current rating variant`);
}
