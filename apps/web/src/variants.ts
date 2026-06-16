// Client-side launch registry — single source of truth for which current game
// specs are selectable in the lobby and shown on public rating surfaces
// (leaderboard + profile grid). Turning a game spec on/off is a one-line edit
// here instead of hunting hardcoded lists across the UI.
//
// Note: this is the CLIENT registry. A variant that introduces a new server
// rating pool also needs the server-side pool added (the `rated` spec flag +
// a user_ratings CHECK migration) as part of that variant's integration — the
// client registry doesn't substitute for that, it just centralizes the UI surface.

import {
  BANQI_SPEC_ID,
  CROSSROADS_CHESS_SPEC_ID,
  DARK_CHESS_SPEC_ID,
  DARK_DRAFT960_SPEC_ID,
  DARK_MINI_XIANGQI_SPEC_ID,
  type GameSpecId,
  gameSpecForId,
  JIEQI_SPEC_ID,
  type RatingVariant,
  ratingPoolForSpec,
} from '@mistboard/game';
import {
  banqiEnabled,
  crossroadsChessEnabled,
  darkMiniXiangqiEnabled,
  darkMiniXiangqiPublicEntryEnabled,
  jieqiEnabled,
} from './feature-flags.js';

// The rated-pool union lives on the game spec now (single source of truth). Kept
// as a local alias so existing call sites keep the `RatingVariantId` name.
export type RatingVariantId = RatingVariant;

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
const crossroadsEnabled = crossroadsChessEnabled();
const jieqiOn = jieqiEnabled();
const banqiOn = banqiEnabled();
const darkChessSpec = gameSpecForId(DARK_CHESS_SPEC_ID);
const draft960Spec = gameSpecForId(DARK_DRAFT960_SPEC_ID);
const darkMiniXiangqiSpec = gameSpecForId(DARK_MINI_XIANGQI_SPEC_ID);
const crossroadsChessSpec = gameSpecForId(CROSSROADS_CHESS_SPEC_ID);
const jieqiSpec = gameSpecForId(JIEQI_SPEC_ID);
const banqiSpec = gameSpecForId(BANQI_SPEC_ID);

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
  {
    id: currentRatingVariantForSpec(CROSSROADS_CHESS_SPEC_ID),
    gameSpecId: crossroadsChessSpec.id,
    apiParam: CROSSROADS_CHESS_SPEC_ID,
    label: crossroadsChessSpec.publicName,
    enabled: crossroadsEnabled,
    onLeaderboard: true,
    onProfile: true,
  },
  // Jieqi + Banqi launched casual and are rating-ready (gated globally by
  // MISTBOARD_RATED_ENABLED). Not lobby-selectable (no open-seek matchmaking);
  // shown on the rating surfaces whenever their variant flag is on, consistent
  // with the other rated variants. They light up the moment rated is enabled.
  {
    id: currentRatingVariantForSpec(JIEQI_SPEC_ID),
    gameSpecId: jieqiSpec.id,
    apiParam: JIEQI_SPEC_ID,
    label: jieqiSpec.publicName,
    enabled: false,
    onLeaderboard: jieqiOn,
    onProfile: jieqiOn,
  },
  {
    id: currentRatingVariantForSpec(BANQI_SPEC_ID),
    gameSpecId: banqiSpec.id,
    apiParam: BANQI_SPEC_ID,
    label: banqiSpec.publicName,
    enabled: false,
    onLeaderboard: banqiOn,
    onProfile: banqiOn,
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

function currentRatingVariantForSpec(id: GameSpecId): RatingVariantId {
  const pool = ratingPoolForSpec(id);
  if (!pool) throw new Error(`game spec ${id} is not a current web rating variant`);
  return pool;
}
