// Client-side launch registry — single source of truth for which current game
// specs are selectable in the lobby and shown on public rating surfaces
// (leaderboard + profile grid). Turning a game spec on/off is a one-line edit
// here instead of hunting hardcoded lists across the UI.
//
// Note: this is the CLIENT registry. A variant that introduces a new server
// rating pool (e.g. Xiangqi) also needs the server-side pool added (rating
// bucket type + migration) as part of that variant's integration — the client
// registry doesn't substitute for that, it just centralizes the UI surface.

import {
  DARK_CHESS_SPEC_ID,
  DARK_DRAFT960_SPEC_ID,
  DARK_MINI_XIANGQI_SPEC_ID,
  type GameSpecId,
  gameSpecForId,
  type RatingPoolBaseId,
} from '@mistboard/game';
import {
  darkMiniXiangqiEnabled,
  darkMiniXiangqiPublicEntryEnabled,
} from './feature-flags.js';

export type RatingVariantId = Extract<
  RatingPoolBaseId,
  'fog' | 'fog_draft960' | 'dark_mini_xiangqi'
>;

export interface VariantDef {
  id: RatingVariantId;
  gameSpecId: GameSpecId;
  /** `?variant=` value the leaderboard API expects. */
  apiParam: string;
  label: string;
  /** Selectable in the lobby variant picker. */
  enabled: boolean;
  /** Shown on the public leaderboard + profile rating grid. */
  onLeaderboard: boolean;
  /** Shown on subject-scoped profile rating grids. */
  onProfile: boolean;
}

const draft960Enabled = import.meta.env.VITE_DRAFT960_ENABLED === 'true';
const darkMiniEnabled = darkMiniXiangqiEnabled();
const darkMiniPublicEntryEnabled = darkMiniXiangqiPublicEntryEnabled();
const darkChessSpec = gameSpecForId(DARK_CHESS_SPEC_ID);
const draft960Spec = gameSpecForId(DARK_DRAFT960_SPEC_ID);
const darkMiniXiangqiSpec = gameSpecForId(DARK_MINI_XIANGQI_SPEC_ID);

export const VARIANTS: VariantDef[] = [
  {
    id: currentRatingVariantForSpec(DARK_CHESS_SPEC_ID),
    gameSpecId: darkChessSpec.id,
    apiParam: 'fog',
    label: darkChessSpec.publicName,
    enabled: true,
    onLeaderboard: true,
    onProfile: true,
  },
  // Draft960: gated behind its flag, and temporarily hidden from the leaderboard
  // until it launches (sequenced to M4). Flip `onLeaderboard` (and the flag) when
  // expanding. Kept in the registry so re-enabling is one edit.
  {
    id: currentRatingVariantForSpec(DARK_DRAFT960_SPEC_ID),
    gameSpecId: draft960Spec.id,
    apiParam: 'dark-draft960',
    label: draft960Spec.publicName,
    enabled: draft960Enabled,
    onLeaderboard: false,
    onProfile: false,
  },
  {
    id: currentRatingVariantForSpec(DARK_MINI_XIANGQI_SPEC_ID),
    gameSpecId: darkMiniXiangqiSpec.id,
    apiParam: DARK_MINI_XIANGQI_SPEC_ID,
    label: darkMiniXiangqiSpec.publicName,
    enabled: darkMiniPublicEntryEnabled,
    onLeaderboard: darkMiniPublicEntryEnabled,
    onProfile: darkMiniEnabled,
  },
];

/** Variants shown on public rating surfaces (leaderboard + profile grid). */
export const leaderboardVariants = VARIANTS.filter((v) => v.onLeaderboard);

/** Variants shown on subject-scoped profile rating surfaces. */
export const profileRatingVariants = VARIANTS.filter((v) => v.onProfile);

/** Variants selectable in the lobby. */
export const enabledVariants = VARIANTS.filter((v) => v.enabled);

export function isVariantEnabled(id: RatingVariantId): boolean {
  return VARIANTS.some((v) => v.id === id && v.enabled);
}

function currentRatingVariantForSpec(
  id:
    | typeof DARK_CHESS_SPEC_ID
    | typeof DARK_DRAFT960_SPEC_ID
    | typeof DARK_MINI_XIANGQI_SPEC_ID,
): RatingVariantId {
  const ratingPool = gameSpecForId(id).ratingPoolBase;
  if (
    ratingPool === 'fog' ||
    ratingPool === 'fog_draft960' ||
    ratingPool === 'dark_mini_xiangqi'
  )
    return ratingPool;
  throw new Error(`game spec ${id} is not a current web rating variant`);
}
