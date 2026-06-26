import {
  DEFAULT_XIANGQI_PIECE_SET,
  XIANGQI_PIECE_SETS,
  type XiangqiPieceSet,
} from './xiangqi-piece-sets.js';

export type XiangqiBoardTheme = 'tournament' | 'paper-garden' | 'blue' | 'mono';

const xiangqiBoardStorageKey = 'mistboard.xiangqiBoardTheme';
const xiangqiBoardStorageVersionKey = 'mistboard.xiangqiBoardThemeVersion';
const xiangqiPieceSetStorageKey = 'mistboard.xiangqiPieceSet';
const defaultXiangqiBoardTheme: XiangqiBoardTheme = 'paper-garden';
const xiangqiBoardStorageVersion = '2';
const defaultXiangqiPieceSet: XiangqiPieceSet = DEFAULT_XIANGQI_PIECE_SET;
const xiangqiBoardThemes: ReadonlyArray<{ id: XiangqiBoardTheme; label: string }> = [
  { id: 'tournament', label: 'Tournament' },
  { id: 'paper-garden', label: 'Paper Garden' },
  { id: 'blue', label: 'Blue' },
  { id: 'mono', label: 'Monochrome' },
];

export function readStoredXiangqiBoardTheme(): XiangqiBoardTheme {
  try {
    const stored = window.localStorage.getItem(xiangqiBoardStorageKey);
    const version = window.localStorage.getItem(xiangqiBoardStorageVersionKey);
    if (version !== xiangqiBoardStorageVersion && stored === 'tournament') {
      window.localStorage.setItem(xiangqiBoardStorageVersionKey, xiangqiBoardStorageVersion);
      window.localStorage.setItem(xiangqiBoardStorageKey, defaultXiangqiBoardTheme);
      return defaultXiangqiBoardTheme;
    }
    if (version !== xiangqiBoardStorageVersion) {
      window.localStorage.setItem(xiangqiBoardStorageVersionKey, xiangqiBoardStorageVersion);
    }
    return normalizeXiangqiBoardTheme(stored);
  } catch {
    return defaultXiangqiBoardTheme;
  }
}

export function writeStoredXiangqiBoardTheme(theme: XiangqiBoardTheme): void {
  try {
    window.localStorage.setItem(xiangqiBoardStorageKey, theme);
    window.localStorage.setItem(xiangqiBoardStorageVersionKey, xiangqiBoardStorageVersion);
  } catch {
    // The data attribute still updates for the current page.
  }
}

export function readStoredXiangqiPieceSet(): XiangqiPieceSet {
  try {
    return normalizeXiangqiPieceSet(window.localStorage.getItem(xiangqiPieceSetStorageKey));
  } catch {
    return defaultXiangqiPieceSet;
  }
}

export function writeStoredXiangqiPieceSet(pieceSet: XiangqiPieceSet): void {
  try {
    window.localStorage.setItem(xiangqiPieceSetStorageKey, pieceSet);
  } catch {
    // The data attribute still updates for the current page.
  }
}

export function normalizeXiangqiBoardTheme(value: string | null): XiangqiBoardTheme {
  return xiangqiBoardThemes.some((theme) => theme.id === value)
    ? (value as XiangqiBoardTheme)
    : defaultXiangqiBoardTheme;
}

export function normalizeXiangqiPieceSet(value: string | null): XiangqiPieceSet {
  if (value === 'animal') return 'animal-origami';
  return XIANGQI_PIECE_SETS.some((set) => set.id === value)
    ? (value as XiangqiPieceSet)
    : defaultXiangqiPieceSet;
}
