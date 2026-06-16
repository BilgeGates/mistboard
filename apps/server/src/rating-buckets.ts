import {
  DARK_CHESS_SPEC_ID,
  DARK_DRAFT960_SPEC_ID,
  type GameSpecId,
  isRatedPoolBase,
  maybeGameSpecForId,
  type RatingVariant,
  ratingPoolForSpec,
  type TimeClass,
  timeClassFromTimeControl,
} from '@mistboard/game';

// Rated-pool vocabulary lives on the game spec (single source of truth):
// RatingVariant + ratingPoolForSpec derive from each spec's `rated` flag.
// Re-exported here so existing server importers keep their import path.
export type { RatingVariant } from '@mistboard/game';
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
  // Fail closed: a casual-only spec (no active rating pool) yields no bucket, so
  // a rated game on it is simply not rated rather than mis-credited to fog.
  const variant = ratingPoolForSpec(ratingSpecForGame(input));
  if (!variant) return null;
  return { variant, timeClass: PUBLIC_RATING_TIME_CLASS };
}

// Accepts a canonical pool name ('fog'), a game spec id ('dark-chess'), or a
// spec alias ('fog-draft960') and returns the rated pool, or null if casual.
export function parseRatingVariant(value: string | null | undefined): RatingVariant | null {
  if (isRatedPoolBase(value)) return value;
  const spec = maybeGameSpecForId(value);
  return spec ? ratingPoolForSpec(spec.id) : null;
}

export function parseRatingTimeClass(value: string | null | undefined): RatingTimeClass | null {
  if (value === 'bullet') return 'bullet';
  if (value === 'blitz') return 'blitz';
  if (value === 'rapid') return 'rapid';
  return null;
}

// Map a game's variant string to the spec whose rating pool it belongs to. Any
// known spec maps to itself (each rated variant buckets into its own pool); the
// dark-chess family splits on hiddenDraft960; unknown/legacy values fall back to
// the dark-chess family. ratingPoolForSpec then fails closed for casual specs.
function ratingSpecForGame(input: BucketInput): GameSpecId {
  const spec = maybeGameSpecForId(input.variant);
  if (spec) {
    if (spec.id === DARK_CHESS_SPEC_ID && input.hiddenDraft960) return DARK_DRAFT960_SPEC_ID;
    return spec.id;
  }
  return input.hiddenDraft960 ? DARK_DRAFT960_SPEC_ID : DARK_CHESS_SPEC_ID;
}

function currentRatingVariantForSpec(id: GameSpecId): RatingVariant {
  const pool = ratingPoolForSpec(id);
  if (!pool) throw new Error(`game spec ${id} is not a current rating variant`);
  return pool;
}
