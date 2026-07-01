import {
  DEFAULT_XIANGQI_PIECE_SET,
  XIANGQI_PIECE_SETS,
  type XiangqiPieceSet,
} from './xiangqi-piece-sets.js';

export type XiangqiBoardTheme = 'tournament' | 'blue' | 'mono';

const xiangqiBoardStorageKey = 'mistboard.xiangqiBoardTheme';
const xiangqiBoardStorageVersionKey = 'mistboard.xiangqiBoardThemeVersion';
const xiangqiPieceSetStorageKey = 'mistboard.xiangqiPieceSet';
const xiangqiPieceSetStorageVersionKey = 'mistboard.xiangqiPieceSetVersion';
const defaultXiangqiBoardTheme: XiangqiBoardTheme = 'tournament';
const xiangqiBoardStorageVersion = '3';
const xiangqiPieceSetStorageVersion = '2';
const defaultXiangqiPieceSet: XiangqiPieceSet = DEFAULT_XIANGQI_PIECE_SET;
const xiangqiBoardThemes: ReadonlyArray<{ id: XiangqiBoardTheme; label: string }> = [
  { id: 'tournament', label: 'Tournament' },
  { id: 'blue', label: 'Blue' },
  { id: 'mono', label: 'Monochrome' },
];

export function readStoredXiangqiBoardTheme(): XiangqiBoardTheme {
  try {
    const stored = window.localStorage.getItem(xiangqiBoardStorageKey);
    const version = window.localStorage.getItem(xiangqiBoardStorageVersionKey);
    if (stored === 'paper-garden') {
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
    const version = window.localStorage.getItem(xiangqiPieceSetStorageVersionKey);
    if (version !== xiangqiPieceSetStorageVersion) {
      window.localStorage.setItem(xiangqiPieceSetStorageVersionKey, xiangqiPieceSetStorageVersion);
      window.localStorage.setItem(xiangqiPieceSetStorageKey, defaultXiangqiPieceSet);
      return defaultXiangqiPieceSet;
    }
    return normalizeXiangqiPieceSet(window.localStorage.getItem(xiangqiPieceSetStorageKey));
  } catch {
    return defaultXiangqiPieceSet;
  }
}

export function writeStoredXiangqiPieceSet(pieceSet: XiangqiPieceSet): void {
  try {
    window.localStorage.setItem(xiangqiPieceSetStorageKey, pieceSet);
    window.localStorage.setItem(xiangqiPieceSetStorageVersionKey, xiangqiPieceSetStorageVersion);
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
  if (value === 'animal' || value === 'animal-seal' || value === 'animal-origami') {
    return 'animal-dobutsu';
  }
  return XIANGQI_PIECE_SETS.some((set) => set.id === value)
    ? (value as XiangqiPieceSet)
    : defaultXiangqiPieceSet;
}
