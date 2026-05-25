import {
  DARK_CHESS_SPEC_ID,
  DARK_DRAFT960_SPEC_ID,
  gameSpecForId,
  type RatingPoolBaseId,
  type TimeClass,
  timeClassFromTimeControl,
} from '@mistboard/game';

export type RatingVariant = Extract<RatingPoolBaseId, 'fog' | 'fog_draft960'>;
export type RatingTimeClass = TimeClass;

export type RatingBucket = {
  variant: RatingVariant;
  timeClass: RatingTimeClass;
};

export const DEFAULT_RATING_BUCKET: RatingBucket = {
  variant: currentRatingVariantForSpec(DARK_CHESS_SPEC_ID),
  timeClass: 'blitz',
};

type BucketInput = {
  initialMs?: number | null;
  incrementMs?: number | null;
  hiddenDraft960?: boolean | null;
};

export function bucketForGame(input: BucketInput): RatingBucket | null {
  const timeClass = timeClassFromTimeControl(input.initialMs, input.incrementMs);
  if (!timeClass) return null;
  const variant = currentRatingVariantForSpec(
    input.hiddenDraft960 ? DARK_DRAFT960_SPEC_ID : DARK_CHESS_SPEC_ID,
  );
  return { variant, timeClass };
}

export function parseRatingVariant(value: string | null | undefined): RatingVariant | null {
  if (value === 'fog' || value === 'dark-chess') return 'fog';
  if (value === 'fog_draft960' || value === 'fog-draft960' || value === 'dark-draft960')
    return 'fog_draft960';
  return null;
}

export function parseRatingTimeClass(value: string | null | undefined): RatingTimeClass | null {
  if (value === 'bullet') return 'bullet';
  if (value === 'blitz') return 'blitz';
  if (value === 'rapid') return 'rapid';
  return null;
}

function currentRatingVariantForSpec(
  id: typeof DARK_CHESS_SPEC_ID | typeof DARK_DRAFT960_SPEC_ID,
): RatingVariant {
  const ratingPool = gameSpecForId(id).ratingPoolBase;
  if (ratingPool === 'fog' || ratingPool === 'fog_draft960') return ratingPool;
  throw new Error(`game spec ${id} is not a current rating variant`);
}
