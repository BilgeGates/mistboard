import {
  DEFAULT_XIANGQI_PIECE_SET,
  XIANGQI_PIECE_SETS,
  type XiangqiPieceSet,
} from './xiangqi-piece-sets.js';

export type XiangqiBoardTheme = 'tournament' | 'blue' | 'mono';

const xiangqiBoardStorageKey = 'mistboard.xiangqiBoardTheme';
const xiangqiPieceSetStorageKey = 'mistboard.xiangqiPieceSet';
const defaultXiangqiBoardTheme: XiangqiBoardTheme = 'tournament';
const defaultXiangqiPieceSet: XiangqiPieceSet = DEFAULT_XIANGQI_PIECE_SET;
const xiangqiBoardThemes: ReadonlyArray<{ id: XiangqiBoardTheme; label: string }> = [
  { id: 'tournament', label: 'Tournament' },
  { id: 'blue', label: 'Blue' },
  { id: 'mono', label: 'Monochrome' },
];

export function readStoredXiangqiBoardTheme(): XiangqiBoardTheme {
  try {
    return normalizeXiangqiBoardTheme(window.localStorage.getItem(xiangqiBoardStorageKey));
  } catch {
    return defaultXiangqiBoardTheme;
  }
}

export function writeStoredXiangqiBoardTheme(theme: XiangqiBoardTheme): void {
  try {
    window.localStorage.setItem(xiangqiBoardStorageKey, theme);
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
  return XIANGQI_PIECE_SETS.some((set) => set.id === value)
    ? (value as XiangqiPieceSet)
    : defaultXiangqiPieceSet;
}
