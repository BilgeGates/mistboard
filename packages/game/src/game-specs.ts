import type { VariantId } from './types.js';

export type GameFamilyId = 'chess' | 'xiangqi' | 'omega-chess';
export type BoardGeometryId = 'chess-8x8' | 'xiangqi-9x10' | 'omega-10x10-plus-corners';
export type MovementRulesId = 'orthodox-chess' | 'xiangqi' | 'omega' | 'seirawan';
export type ObjectiveRulesId = 'king-capture' | 'general-capture' | 'suicide';
export type VisibilityRulesId = 'dark';
export type SetupRulesId = 'standard' | 'draft960' | 'double-fischer-random';
export type ReserveRulesId = 'none' | 'crazyhouse' | 'seirawan-gating';
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
  | 'dark_xiangqi'
  | 'dark_omega';

export type GameSpecId =
  | 'dark-chess'
  | 'dark-draft960'
  | 'dark-crazyhouse'
  | 'dark-suicide'
  | 'sun-tzu'
  | 'lao-tzu'
  | 'dark-seirawan'
  | 'dark-xiangqi'
  | 'dark-omega';
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
export const DARK_XIANGQI_SPEC_ID = 'dark-xiangqi' satisfies GameSpecId;

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
    publicName: 'Draft960',
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
