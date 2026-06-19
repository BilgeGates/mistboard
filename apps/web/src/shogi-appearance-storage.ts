// Persisted shogi appearance: board theme + piece set, the shogi twin of
// xiangqi-appearance-storage.ts. The live Dark Shogi board renders pieces as
// inline SVG, so changing either setting re-renders in JS (via
// shogiAppearanceChangedEvent in theme.ts) rather than restyling through CSS.

import {
  DEFAULT_SHOGI_PIECE_SET,
  SHOGI_PIECE_SETS,
  type ShogiPieceSet,
} from './shogi-piece-sets.js';

// Wood (warm, traditional), Kaya (paler premium board), Plain (neutral, low
// contrast). The palette values themselves live in shogi-render.ts, keyed by id.
export type ShogiBoardTheme = 'wood' | 'kaya' | 'plain';

const shogiBoardStorageKey = 'mistboard.shogiBoardTheme';
const shogiPieceSetStorageKey = 'mistboard.shogiPieceSet';
const defaultShogiBoardTheme: ShogiBoardTheme = 'wood';
const defaultShogiPieceSet: ShogiPieceSet = DEFAULT_SHOGI_PIECE_SET;

export const SHOGI_BOARD_THEMES: ReadonlyArray<{ id: ShogiBoardTheme; label: string }> = [
  { id: 'wood', label: 'Wood' },
  { id: 'kaya', label: 'Kaya' },
  { id: 'plain', label: 'Plain' },
];

export function readStoredShogiBoardTheme(): ShogiBoardTheme {
  try {
    return normalizeShogiBoardTheme(window.localStorage.getItem(shogiBoardStorageKey));
  } catch {
    return defaultShogiBoardTheme;
  }
}

export function writeStoredShogiBoardTheme(theme: ShogiBoardTheme): void {
  try {
    window.localStorage.setItem(shogiBoardStorageKey, theme);
  } catch {
    // The data attribute still updates for the current page.
  }
}

export function readStoredShogiPieceSet(): ShogiPieceSet {
  try {
    return normalizeShogiPieceSet(window.localStorage.getItem(shogiPieceSetStorageKey));
  } catch {
    return defaultShogiPieceSet;
  }
}

export function writeStoredShogiPieceSet(pieceSet: ShogiPieceSet): void {
  try {
    window.localStorage.setItem(shogiPieceSetStorageKey, pieceSet);
  } catch {
    // The data attribute still updates for the current page.
  }
}

export function normalizeShogiBoardTheme(value: string | null): ShogiBoardTheme {
  return SHOGI_BOARD_THEMES.some((theme) => theme.id === value)
    ? (value as ShogiBoardTheme)
    : defaultShogiBoardTheme;
}

export function normalizeShogiPieceSet(value: string | null): ShogiPieceSet {
  return SHOGI_PIECE_SETS.some((set) => set.id === value)
    ? (value as ShogiPieceSet)
    : defaultShogiPieceSet;
}
