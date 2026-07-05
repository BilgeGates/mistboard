import { GAME_SPECS, type GameSpecId } from '@mistboard/game';

// One public-surface switch per game spec. This controls discoverable UI:
// rules rails/tiles, homepage article cards, homepage News, and /feed entries.
// Direct URLs can stay reachable for review/backcompat; they are not listings.
const VARIANT_PUBLIC_SURFACE_ENABLED = {
  'dark-chess': true,
  'dark-draft960': false,
  // Dark Crazyhouse + the Mini Xiangqi sub-family retired from public surfaces
  // 2026-07-03 (project_xiangqi_pivot_track). Direct /rules + play URLs stay live.
  'dark-crazyhouse': false,
  kriegspiel: false,
  'dark-antichess': false,
  'sun-tzu': false,
  'lao-tzu': false,
  'dark-seirawan': false,
  'mini-xiangqi': false,
  'dark-mini-xiangqi': false,
  'drop-mini-xiangqi': false,
  'fortress-xiangqi': true,
  xiangqi: true,
  'dark-xiangqi': true,
  'dark-shogi': true,
  'dark-omega': false,
  jieqi: true,
  banqi: true,
  luzhanqi: false,
  'crossroads-chess': false,
  'dark-crossroads-chess': false,
  'reveal-chess': false,
  jungle: true,
  'jungle-flip': true,
} satisfies Record<GameSpecId, boolean>;

const gameSpecIds = new Set<string>(GAME_SPECS.map((spec) => spec.id));

export function isGameSpecId(value: string): value is GameSpecId {
  return gameSpecIds.has(value);
}

export function variantPublicSurfaceEnabled(id: GameSpecId): boolean {
  return VARIANT_PUBLIC_SURFACE_ENABLED[id];
}

export function rulesSlugPublicSurfaceEnabled(slug: string): boolean {
  return !isGameSpecId(slug) || variantPublicSurfaceEnabled(slug);
}

export function rulesHrefPublicSurfaceEnabled(href: string | undefined): boolean {
  const specId = gameSpecIdFromRulesHref(href);
  return specId === null || variantPublicSurfaceEnabled(specId);
}

export function gameSpecIdFromRulesHref(href: string | undefined): GameSpecId | null {
  if (!href) return null;
  let pathname: string;
  try {
    pathname = new URL(href, 'https://mistboard.local').pathname;
  } catch {
    return null;
  }
  const match = pathname.match(/^\/rules\/([^/]+)$/);
  if (!match) return null;
  const slug = decodeURIComponent(match[1]);
  return isGameSpecId(slug) ? slug : null;
}
