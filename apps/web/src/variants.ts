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
  DARK_CRAZYHOUSE_SPEC_ID,
  DARK_CROSSROADS_CHESS_SPEC_ID,
  DARK_DRAFT960_SPEC_ID,
  DARK_MINI_XIANGQI_SPEC_ID,
  DARK_SHOGI_SPEC_ID,
  DARK_XIANGQI_SPEC_ID,
  DROP_MINI_XIANGQI_SPEC_ID,
  type GameSpecId,
  gameSpecForId,
  JIEQI_SPEC_ID,
  KRIEGSPIEL_SPEC_ID,
  type RatingVariant,
  REVEAL_CHESS_SPEC_ID,
  ratingPoolForSpec,
} from '@mistboard/game';
import {
  banqiEnabled,
  crossroadsChessEnabled,
  darkCrazyhouseEnabled,
  darkCrossroadsChessEnabled,
  darkMiniXiangqiEnabled,
  darkMiniXiangqiPublicEntryEnabled,
  darkShogiEnabled,
  darkXiangqiEnabled,
  dropMiniXiangqiEnabled,
  jieqiEnabled,
  kriegspielEnabled,
  revealChessEnabled,
} from './feature-flags.js';
import type { VariantMiniId } from './variant-mini-boards.js';

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
  /** Which mini-board (renderVariantMiniBoard) represents this variant in the UI. */
  miniId: VariantMiniId;
}

const draft960Enabled = import.meta.env.VITE_DRAFT960_ENABLED === 'true';
const darkMiniEnabled = darkMiniXiangqiEnabled();
const darkMiniPublicEntryEnabled = darkMiniXiangqiPublicEntryEnabled();
const dropMiniXiangqiOn = dropMiniXiangqiEnabled();
const crossroadsEnabled = crossroadsChessEnabled();
const jieqiOn = jieqiEnabled();
const banqiOn = banqiEnabled();
const revealChessOn = revealChessEnabled();
const darkXiangqiOn = darkXiangqiEnabled();
const darkCrossroadsChessOn = darkCrossroadsChessEnabled();
const darkShogiOn = darkShogiEnabled();
const darkCrazyhouseOn = darkCrazyhouseEnabled();
const kriegspielOn = kriegspielEnabled();
const darkChessSpec = gameSpecForId(DARK_CHESS_SPEC_ID);
const draft960Spec = gameSpecForId(DARK_DRAFT960_SPEC_ID);
const darkMiniXiangqiSpec = gameSpecForId(DARK_MINI_XIANGQI_SPEC_ID);
const dropMiniXiangqiSpec = gameSpecForId(DROP_MINI_XIANGQI_SPEC_ID);
const darkXiangqiSpec = gameSpecForId(DARK_XIANGQI_SPEC_ID);
const crossroadsChessSpec = gameSpecForId(CROSSROADS_CHESS_SPEC_ID);
const darkCrossroadsChessSpec = gameSpecForId(DARK_CROSSROADS_CHESS_SPEC_ID);
const darkShogiSpec = gameSpecForId(DARK_SHOGI_SPEC_ID);
const darkCrazyhouseSpec = gameSpecForId(DARK_CRAZYHOUSE_SPEC_ID);
const kriegspielSpec = gameSpecForId(KRIEGSPIEL_SPEC_ID);
const jieqiSpec = gameSpecForId(JIEQI_SPEC_ID);
const banqiSpec = gameSpecForId(BANQI_SPEC_ID);
const revealChessSpec = gameSpecForId(REVEAL_CHESS_SPEC_ID);

// Marker coverage is broader than the rated/current variant registry: the play
// picker can surface soft-launch tenants, and rules/articles can reference
// variants that are not leaderboard rows.
const VARIANT_MINI_BY_GAME_SPEC: Partial<Record<GameSpecId, VariantMiniId>> = {
  [DARK_CHESS_SPEC_ID]: 'dark-chess',
  [DARK_DRAFT960_SPEC_ID]: 'draft960',
  [DARK_MINI_XIANGQI_SPEC_ID]: 'dark-mini-xiangqi',
  [DROP_MINI_XIANGQI_SPEC_ID]: 'drop-mini-xiangqi',
  [DARK_XIANGQI_SPEC_ID]: 'dark-xiangqi',
  [JIEQI_SPEC_ID]: 'jieqi',
  [BANQI_SPEC_ID]: 'banqi',
  [REVEAL_CHESS_SPEC_ID]: 'reveal-chess',
  [CROSSROADS_CHESS_SPEC_ID]: 'crossroads',
  [DARK_CROSSROADS_CHESS_SPEC_ID]: 'dark-crossroads',
  [DARK_SHOGI_SPEC_ID]: 'dark-shogi',
  [DARK_CRAZYHOUSE_SPEC_ID]: 'dark-crazyhouse',
  [KRIEGSPIEL_SPEC_ID]: 'kriegspiel',
};

export const VARIANTS: VariantDef[] = [
  {
    id: currentRatingVariantForSpec(DARK_CHESS_SPEC_ID),
    gameSpecId: darkChessSpec.id,
    apiParam: 'fog',
    label: darkChessSpec.publicName,
    miniId: 'dark-chess',
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
    miniId: 'draft960',
    enabled: draft960Enabled,
    onLeaderboard: false,
    onProfile: false,
  },
  {
    id: currentRatingVariantForSpec(DARK_MINI_XIANGQI_SPEC_ID),
    gameSpecId: darkMiniXiangqiSpec.id,
    apiParam: DARK_MINI_XIANGQI_SPEC_ID,
    label: darkMiniXiangqiSpec.publicName,
    miniId: 'dark-mini-xiangqi',
    enabled: darkMiniPublicEntryEnabled,
    onLeaderboard: darkMiniPublicEntryEnabled,
    onProfile: darkMiniEnabled,
  },
  {
    id: currentRatingVariantForSpec(DROP_MINI_XIANGQI_SPEC_ID),
    gameSpecId: dropMiniXiangqiSpec.id,
    apiParam: DROP_MINI_XIANGQI_SPEC_ID,
    label: dropMiniXiangqiSpec.publicName,
    miniId: 'drop-mini-xiangqi',
    enabled: false,
    onLeaderboard: dropMiniXiangqiOn,
    onProfile: dropMiniXiangqiOn,
  },
  // Full Dark Xiangqi (9x10 fog): launched PvP-first (no bot, no open-seek
  // lobby), rating-ready like jieqi/banqi — shown on the rating surfaces whenever
  // its flag is on, lighting up the moment global rated is enabled.
  {
    id: currentRatingVariantForSpec(DARK_XIANGQI_SPEC_ID),
    gameSpecId: darkXiangqiSpec.id,
    apiParam: DARK_XIANGQI_SPEC_ID,
    label: darkXiangqiSpec.publicName,
    miniId: 'dark-xiangqi',
    enabled: false,
    onLeaderboard: darkXiangqiOn,
    onProfile: darkXiangqiOn,
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
    miniId: 'jieqi',
    enabled: false,
    onLeaderboard: jieqiOn,
    onProfile: jieqiOn,
  },
  {
    id: currentRatingVariantForSpec(BANQI_SPEC_ID),
    gameSpecId: banqiSpec.id,
    apiParam: BANQI_SPEC_ID,
    label: banqiSpec.publicName,
    miniId: 'banqi',
    enabled: false,
    onLeaderboard: banqiOn,
    onProfile: banqiOn,
  },
  {
    id: currentRatingVariantForSpec(REVEAL_CHESS_SPEC_ID),
    gameSpecId: revealChessSpec.id,
    apiParam: REVEAL_CHESS_SPEC_ID,
    label: revealChessSpec.publicName,
    miniId: 'reveal-chess',
    enabled: false,
    onLeaderboard: revealChessOn,
    onProfile: revealChessOn,
  },
  // Perfect-information Crossroads is intentionally ranked last across the
  // lobby/leaderboard/profile lineups: it is the platform's one perfect-info
  // surface (everything else is hidden-info), kept playable but de-emphasized.
  {
    id: currentRatingVariantForSpec(CROSSROADS_CHESS_SPEC_ID),
    gameSpecId: crossroadsChessSpec.id,
    apiParam: CROSSROADS_CHESS_SPEC_ID,
    label: crossroadsChessSpec.publicName,
    miniId: 'crossroads',
    enabled: crossroadsEnabled,
    onLeaderboard: true,
    onProfile: true,
  },
  {
    id: currentRatingVariantForSpec(DARK_CROSSROADS_CHESS_SPEC_ID),
    gameSpecId: darkCrossroadsChessSpec.id,
    apiParam: DARK_CROSSROADS_CHESS_SPEC_ID,
    label: darkCrossroadsChessSpec.publicName,
    miniId: 'dark-crossroads',
    enabled: false,
    onLeaderboard: darkCrossroadsChessOn,
    onProfile: darkCrossroadsChessOn,
  },
  {
    id: currentRatingVariantForSpec(DARK_SHOGI_SPEC_ID),
    gameSpecId: darkShogiSpec.id,
    apiParam: DARK_SHOGI_SPEC_ID,
    label: darkShogiSpec.publicName,
    miniId: 'dark-shogi',
    enabled: false,
    onLeaderboard: darkShogiOn,
    onProfile: darkShogiOn,
  },
  {
    id: currentRatingVariantForSpec(DARK_CRAZYHOUSE_SPEC_ID),
    gameSpecId: darkCrazyhouseSpec.id,
    apiParam: DARK_CRAZYHOUSE_SPEC_ID,
    label: darkCrazyhouseSpec.publicName,
    miniId: 'dark-crazyhouse',
    enabled: false,
    onLeaderboard: darkCrazyhouseOn,
    onProfile: darkCrazyhouseOn,
  },
  {
    id: currentRatingVariantForSpec(KRIEGSPIEL_SPEC_ID),
    gameSpecId: kriegspielSpec.id,
    apiParam: KRIEGSPIEL_SPEC_ID,
    label: kriegspielSpec.publicName,
    miniId: 'kriegspiel',
    enabled: false,
    onLeaderboard: kriegspielOn,
    onProfile: kriegspielOn,
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

/** Mini-board id for a game spec (picker/landing), or null if none. */
export function variantMiniIdForGameSpec(id: GameSpecId): VariantMiniId | null {
  return VARIANT_MINI_BY_GAME_SPEC[id] ?? null;
}

/** Mini-board id for a rating variant (leaderboard/profile), or null if none. */
export function variantMiniIdForRating(id: RatingVariantId): VariantMiniId | null {
  return VARIANTS.find((v) => v.id === id)?.miniId ?? null;
}

function currentRatingVariantForSpec(id: GameSpecId): RatingVariantId {
  const pool = ratingPoolForSpec(id);
  if (!pool) throw new Error(`game spec ${id} is not a current web rating variant`);
  return pool;
}
