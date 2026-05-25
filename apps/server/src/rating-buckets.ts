import { type TimeClass, timeClassFromTimeControl } from '@mistboard/game';

export type RatingVariant = 'fog' | 'fog_draft960';
export type RatingTimeClass = TimeClass;

export type RatingBucket = {
  variant: RatingVariant;
  timeClass: RatingTimeClass;
};

export const DEFAULT_RATING_BUCKET: RatingBucket = {
  variant: 'fog',
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
  const variant: RatingVariant = input.hiddenDraft960 ? 'fog_draft960' : 'fog';
  return { variant, timeClass };
}

export function parseRatingVariant(value: string | null | undefined): RatingVariant | null {
  if (value === 'fog' || value === 'dark-chess') return 'fog';
  if (value === 'fog_draft960' || value === 'fog-draft960') return 'fog_draft960';
  return null;
}

export function parseRatingTimeClass(value: string | null | undefined): RatingTimeClass | null {
  if (value === 'bullet') return 'bullet';
  if (value === 'blitz') return 'blitz';
  if (value === 'rapid') return 'rapid';
  return null;
}
