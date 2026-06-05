import type { VariantId } from './types.js';

export type GameFamilyId = 'chess' | 'xiangqi' | 'shogi' | 'omega-chess' | 'dual-chess';
export type BoardGeometryId =
  | 'chess-8x8'
  | 'xiangqi-7x7'
  | 'xiangqi-9x10'
  | 'shogi-9x9'
  | 'omega-10x10-plus-corners'
  | 'dual-6x8';
export type MovementRulesId =
  | 'orthodox-chess'
  | 'mini-xiangqi'
  | 'xiangqi'
  | 'shogi'
  | 'omega'
  | 'seirawan'
  | 'dual-chess';
// 'royal-capture-or-race': capture/checkmate the royal OR race it to the enemy
// home rank (the Dual Chess "Try"). Open mode keeps checkmate, dark switches to
// king-capture; the visibility axis + rules module resolve which.
export type ObjectiveRulesId =
  | 'king-capture'
  | 'general-capture'
  | 'suicide'
  | 'royal-capture-or-race';
// 'open' = perfect-information (the Dual Chess onboarding mode); every other spec
// is 'dark' (fog of war).
export type VisibilityRulesId = 'dark' | 'open';
export type SetupRulesId =
  | 'standard'
  | 'draft960'
  | 'mini-standard'
  | 'double-fischer-random'
  | 'dual-standard';
export type ReserveRulesId = 'none' | 'crazyhouse' | 'shogi-hands' | 'seirawan-gating';
export type DropPolicyId = 'none' | 'any-legal-square' | 'seen-squares-only' | 'seirawan-gating';
export type GameSpecSurface = 'hidden' | 'beta' | 'casual' | 'rated';
export type GameSpecRuntimeStatus = 'live' | 'dev-spike' | 'future';

export type RatingPoolBaseId =
  | 'fog'
  | 'fog_draft960'
  | 'dark_crazyhouse'
  | 'dark_suicide'
  | 'sun_tzu'
  | 'lao_tzu'
  | 'dark_seirawan'
  | 'dark_mini_xiangqi'
  | 'dark_xiangqi'
  | 'dark_shogi'
  | 'dark_omega'
  | 'dual_chess'
  | 'dual_chess_open';

export type GameSpecId =
  | 'dark-chess'
  | 'dark-draft960'
  | 'dark-crazyhouse'
  | 'dark-suicide'
  | 'sun-tzu'
  | 'lao-tzu'
  | 'dark-seirawan'
  | 'dark-mini-xiangqi'
  | 'dark-xiangqi'
  | 'dark-shogi'
  | 'dark-omega'
  | 'dual-chess'
  | 'dark-dual-chess';
export type GameSpecAliasId = 'fog-draft960';
export type GameSpecLookupId = GameSpecId | GameSpecAliasId;

export type GameSpec = {
  id: GameSpecId;
  publicName: string;
  family: GameFamilyId;
  board: BoardGeometryId;
  movement: MovementRulesId;
  objective: ObjectiveRulesId;
  visibility: VisibilityRulesId;
  setup: SetupRulesId;
  reserves: ReserveRulesId;
  dropPolicy: DropPolicyId;
  ratingPoolBase: RatingPoolBaseId;
  publicSurface: GameSpecSurface;
  runtimeStatus: GameSpecRuntimeStatus;
  legacyLiveRoom?: {
    variant: VariantId;
    hiddenDraft960: boolean;
  };
};

export const DARK_CHESS_SPEC_ID = 'dark-chess' satisfies GameSpecId;
export const DARK_DRAFT960_SPEC_ID = 'dark-draft960' satisfies GameSpecId;
// Compatibility alias for pre-taxonomy code and URLs. New code should use
// DARK_DRAFT960_SPEC_ID; "fog" remains only in legacy rating/API vocabulary.
export const FOG_DRAFT960_SPEC_ID = DARK_DRAFT960_SPEC_ID;
export const DARK_MINI_XIANGQI_SPEC_ID = 'dark-mini-xiangqi' satisfies GameSpecId;
export const DARK_XIANGQI_SPEC_ID = 'dark-xiangqi' satisfies GameSpecId;
export const DARK_SHOGI_SPEC_ID = 'dark-shogi' satisfies GameSpecId;
export const DUAL_CHESS_SPEC_ID = 'dual-chess' satisfies GameSpecId;
export const DARK_DUAL_CHESS_SPEC_ID = 'dark-dual-chess' satisfies GameSpecId;

export const GAME_SPECS: readonly GameSpec[] = [
  {
    id: DARK_CHESS_SPEC_ID,
    publicName: 'Dark chess',
    family: 'chess',
    board: 'chess-8x8',
    movement: 'orthodox-chess',
    objective: 'king-capture',
    visibility: 'dark',
    setup: 'standard',
    reserves: 'none',
    dropPolicy: 'none',
    ratingPoolBase: 'fog',
    publicSurface: 'casual',
    runtimeStatus: 'live',
    legacyLiveRoom: { variant: 'dark-chess', hiddenDraft960: false },
  },
  {
    id: DARK_DRAFT960_SPEC_ID,
    publicName: 'Dark Draft960',
    family: 'chess',
    board: 'chess-8x8',
    movement: 'orthodox-chess',
    objective: 'king-capture',
    visibility: 'dark',
    setup: 'draft960',
    reserves: 'none',
    dropPolicy: 'none',
    ratingPoolBase: 'fog_draft960',
    publicSurface: 'hidden',
    runtimeStatus: 'live',
    legacyLiveRoom: { variant: 'dark-chess', hiddenDraft960: true },
  },
  {
    id: 'dark-crazyhouse',
    publicName: 'Dark Crazyhouse',
    family: 'chess',
    board: 'chess-8x8',
    movement: 'orthodox-chess',
    objective: 'king-capture',
    visibility: 'dark',
    setup: 'standard',
    reserves: 'crazyhouse',
    dropPolicy: 'any-legal-square',
    ratingPoolBase: 'dark_crazyhouse',
    publicSurface: 'hidden',
    runtimeStatus: 'future',
  },
  {
    id: 'dark-suicide',
    publicName: 'Dark Suicide',
    family: 'chess',
    board: 'chess-8x8',
    movement: 'orthodox-chess',
    objective: 'suicide',
    visibility: 'dark',
    setup: 'standard',
    reserves: 'none',
    dropPolicy: 'none',
    ratingPoolBase: 'dark_suicide',
    publicSurface: 'hidden',
    runtimeStatus: 'future',
  },
  {
    id: 'sun-tzu',
    publicName: 'Sun Tzu chess',
    family: 'chess',
    board: 'chess-8x8',
    movement: 'orthodox-chess',
    objective: 'king-capture',
    visibility: 'dark',
    setup: 'double-fischer-random',
    reserves: 'crazyhouse',
    dropPolicy: 'any-legal-square',
    ratingPoolBase: 'sun_tzu',
    publicSurface: 'hidden',
    runtimeStatus: 'future',
  },
  {
    id: 'lao-tzu',
    publicName: 'Lao Tzu chess',
    family: 'chess',
    board: 'chess-8x8',
    movement: 'orthodox-chess',
    objective: 'king-capture',
    visibility: 'dark',
    setup: 'double-fischer-random',
    reserves: 'crazyhouse',
    dropPolicy: 'seen-squares-only',
    ratingPoolBase: 'lao_tzu',
    publicSurface: 'hidden',
    runtimeStatus: 'future',
  },
  {
    id: 'dark-seirawan',
    publicName: 'Dark Seirawan chess',
    family: 'chess',
    board: 'chess-8x8',
    movement: 'seirawan',
    objective: 'king-capture',
    visibility: 'dark',
    setup: 'standard',
    reserves: 'seirawan-gating',
    dropPolicy: 'seirawan-gating',
    ratingPoolBase: 'dark_seirawan',
    publicSurface: 'hidden',
    runtimeStatus: 'future',
  },
  {
    id: DARK_MINI_XIANGQI_SPEC_ID,
    publicName: 'Dark Mini Xiangqi',
    family: 'xiangqi',
    board: 'xiangqi-7x7',
    movement: 'mini-xiangqi',
    objective: 'general-capture',
    visibility: 'dark',
    setup: 'mini-standard',
    reserves: 'none',
    dropPolicy: 'none',
    ratingPoolBase: 'dark_mini_xiangqi',
    publicSurface: 'hidden',
    runtimeStatus: 'dev-spike',
  },
  {
    id: DARK_XIANGQI_SPEC_ID,
    publicName: 'Dark Xiangqi',
    family: 'xiangqi',
    board: 'xiangqi-9x10',
    movement: 'xiangqi',
    objective: 'general-capture',
    visibility: 'dark',
    setup: 'standard',
    reserves: 'none',
    dropPolicy: 'none',
    ratingPoolBase: 'dark_xiangqi',
    publicSurface: 'hidden',
    runtimeStatus: 'dev-spike',
  },
  {
    id: DARK_SHOGI_SPEC_ID,
    publicName: 'Dark Shogi',
    family: 'shogi',
    board: 'shogi-9x9',
    movement: 'shogi',
    objective: 'king-capture',
    visibility: 'dark',
    setup: 'standard',
    reserves: 'shogi-hands',
    dropPolicy: 'seen-squares-only',
    ratingPoolBase: 'dark_shogi',
    publicSurface: 'hidden',
    runtimeStatus: 'future',
  },
  {
    id: 'dark-omega',
    publicName: 'Dark Omega chess',
    family: 'omega-chess',
    board: 'omega-10x10-plus-corners',
    movement: 'omega',
    objective: 'king-capture',
    visibility: 'dark',
    setup: 'standard',
    reserves: 'none',
    dropPolicy: 'none',
    ratingPoolBase: 'dark_omega',
    publicSurface: 'hidden',
    runtimeStatus: 'future',
  },
  {
    // Dual Chess (中西象棋): a 6x8 chess x xiangqi fusion. Two modes share one
    // family/board/movement and split on the visibility axis. Perfect-info is the
    // onboarding ladder (keeps checkmate); dark is the real mode (king-capture).
    // Rules engine: packages/game/src/variants-dual-chess.ts. Not yet live.
    id: DUAL_CHESS_SPEC_ID,
    publicName: 'Dual Chess',
    family: 'dual-chess',
    board: 'dual-6x8',
    movement: 'dual-chess',
    objective: 'royal-capture-or-race',
    visibility: 'open',
    setup: 'dual-standard',
    reserves: 'none',
    dropPolicy: 'none',
    ratingPoolBase: 'dual_chess_open',
    publicSurface: 'hidden',
    runtimeStatus: 'future',
  },
  {
    id: DARK_DUAL_CHESS_SPEC_ID,
    publicName: 'Dark Dual Chess',
    family: 'dual-chess',
    board: 'dual-6x8',
    movement: 'dual-chess',
    objective: 'royal-capture-or-race',
    visibility: 'dark',
    setup: 'dual-standard',
    reserves: 'none',
    dropPolicy: 'none',
    ratingPoolBase: 'dual_chess',
    publicSurface: 'hidden',
    runtimeStatus: 'future',
  },
] as const;

const gameSpecsById = new Map<GameSpecId, GameSpec>(GAME_SPECS.map((spec) => [spec.id, spec]));
const gameSpecIds = new Set<string>(GAME_SPECS.map((spec) => spec.id));
const gameSpecAliases = new Map<GameSpecAliasId, GameSpecId>([
  ['fog-draft960', DARK_DRAFT960_SPEC_ID],
]);

export function isGameSpecId(value: string | null | undefined): value is GameSpecId {
  return typeof value === 'string' && gameSpecIds.has(value);
}

export function gameSpecForId(id: GameSpecLookupId): GameSpec {
  const canonicalId = canonicalGameSpecId(id);
  if (!canonicalId) throw new Error(`unknown game spec id: ${JSON.stringify(id)}`);
  const spec = gameSpecsById.get(canonicalId);
  if (!spec) throw new Error(`unknown game spec id: ${JSON.stringify(id)}`);
  return spec;
}

export function maybeGameSpecForId(value: string | null | undefined): GameSpec | null {
  const canonicalId = canonicalGameSpecId(value);
  return canonicalId ? gameSpecForId(canonicalId) : null;
}

function canonicalGameSpecId(value: string | null | undefined): GameSpecId | null {
  if (isGameSpecId(value)) return value;
  if (value === undefined || value === null) return null;
  return gameSpecAliases.get(value as GameSpecAliasId) ?? null;
}

export type LegacyLiveRoomSpecInput = {
  variant?: VariantId | string | null;
  hiddenDraft960?: boolean | string | null;
};

export function gameSpecForLegacyLiveRoom(input: LegacyLiveRoomSpecInput): GameSpec {
  if (
    input.variant === 'draft960' ||
    input.variant === DARK_DRAFT960_SPEC_ID ||
    input.variant === 'fog-draft960' ||
    isTruthyLegacyFlag(input.hiddenDraft960)
  ) {
    return gameSpecForId(DARK_DRAFT960_SPEC_ID);
  }
  return gameSpecForId(DARK_CHESS_SPEC_ID);
}

export function legacyLiveRoomForGameSpec(id: GameSpecId): GameSpec['legacyLiveRoom'] | null {
  return gameSpecForId(id).legacyLiveRoom ?? null;
}

function isTruthyLegacyFlag(value: boolean | string | null | undefined): boolean {
  return value === true || value === '1' || value === 'true' || value === 'yes';
}
