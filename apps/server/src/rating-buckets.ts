export type RatingVariant = 'fog' | 'fog_draft960';
export type RatingTimeClass = 'bullet' | 'blitz';

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

function timeClassFromTimeControl(
  initialMs: number | null | undefined,
  incrementMs: number | null | undefined,
): RatingTimeClass | null {
  if (initialMs == null || incrementMs == null) return null;
  if (initialMs === 60_000 && incrementMs === 1_000) return 'bullet';
  if (initialMs === 180_000 && incrementMs === 2_000) return 'blitz';
  if (initialMs === 300_000 && incrementMs === 3_000) return 'blitz';
  return null;
}

export function parseRatingVariant(value: string | null | undefined): RatingVariant | null {
  if (value === 'fog' || value === 'fog-of-war') return 'fog';
  if (value === 'fog_draft960' || value === 'fog-draft960') return 'fog_draft960';
  return null;
}

export function parseRatingTimeClass(value: string | null | undefined): RatingTimeClass | null {
  if (value === 'bullet') return 'bullet';
  if (value === 'blitz') return 'blitz';
  return null;
}
