import { describe, expect, it } from 'vitest';
import {
  normalizeShogiBoardTheme,
  normalizeShogiPieceSet,
  SHOGI_BOARD_THEMES,
} from './shogi-appearance-storage.js';

describe('shogi appearance normalize', () => {
  it('accepts known piece sets and falls back to kanji', () => {
    expect(normalizeShogiPieceSet('western')).toBe('western');
    expect(normalizeShogiPieceSet('kanji-light')).toBe('kanji-light');
    expect(normalizeShogiPieceSet('nonsense')).toBe('kanji');
    expect(normalizeShogiPieceSet(null)).toBe('kanji');
  });

  it('accepts known board themes and falls back to wood', () => {
    expect(normalizeShogiBoardTheme('kaya')).toBe('kaya');
    expect(normalizeShogiBoardTheme('plain')).toBe('plain');
    expect(normalizeShogiBoardTheme('zzz')).toBe('wood');
    expect(normalizeShogiBoardTheme(null)).toBe('wood');
  });

  it('lists three board themes with wood first', () => {
    expect(SHOGI_BOARD_THEMES.map((theme) => theme.id)).toEqual(['wood', 'kaya', 'plain']);
  });
});
