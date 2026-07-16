/**
 * Conformance: every variant that ships a playable puzzle corpus in
 * @mistboard/game has a registered PuzzleBoardAdapter, and the registry is
 * fail-closed for everything else.
 *
 * The corpus enumeration is derived, not hand-listed: it scans the whole
 * @mistboard/game export namespace for `*_PUZZLES` arrays of playable puzzles
 * (id + variant + initial + solution — the shape the puzzles API serves). A
 * new corpus export for a variant with no adapter fails here loudly instead of
 * throwing at runtime when a deep link paints the board.
 */

import * as game from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import {
  allPuzzleBoardAdapters,
  isPuzzleVariant,
  PUZZLE_VARIANT_IDS,
  puzzleBoardAdapter,
} from './registry.js';

type CorpusPuzzle = { id: string; variant: string; initial: unknown; solution: unknown[] };

function isCorpusPuzzle(value: unknown): value is CorpusPuzzle {
  if (!value || typeof value !== 'object') return false;
  const puzzle = value as Record<string, unknown>;
  return (
    typeof puzzle.id === 'string' &&
    typeof puzzle.variant === 'string' &&
    puzzle.initial !== undefined &&
    Array.isArray(puzzle.solution)
  );
}

// Every non-empty `*_PUZZLES` export whose members are playable puzzles. This
// is the same universe the server's /api/puzzles route aggregates from.
function playableCorpora(): Array<[name: string, puzzles: CorpusPuzzle[]]> {
  const corpora: Array<[string, CorpusPuzzle[]]> = [];
  for (const [name, value] of Object.entries(game as Record<string, unknown>)) {
    if (!name.endsWith('PUZZLES') || !Array.isArray(value) || value.length === 0) continue;
    if (!value.every(isCorpusPuzzle)) continue;
    corpora.push([name, value]);
  }
  return corpora;
}

describe('puzzle board adapter registry', () => {
  it('finds the playable puzzle corpora in @mistboard/game (guards the scan itself)', () => {
    const names = playableCorpora().map(([name]) => name);
    // If this shrinks to nothing the derivation below would vacuously pass, so
    // pin the known family corpora as a floor.
    expect(names).toEqual(
      expect.arrayContaining([
        'MINI_XIANGQI_PUZZLES',
        'FORTRESS_XIANGQI_PUZZLES',
        'JUNGLE_PUZZLES',
        'XIANGQI_PUZZLES',
      ]),
    );
  });

  it('registers an adapter for every variant that ships puzzles', () => {
    const variantsWithPuzzles = new Set<string>();
    for (const [, puzzles] of playableCorpora()) {
      for (const puzzle of puzzles) variantsWithPuzzles.add(puzzle.variant);
    }
    expect(variantsWithPuzzles.size).toBeGreaterThan(0);
    for (const variant of variantsWithPuzzles) {
      expect(isPuzzleVariant(variant), `variant "${variant}" has puzzles but no adapter`).toBe(
        true,
      );
      expect(puzzleBoardAdapter(variant).variant).toBe(variant);
    }
  });

  it('keeps every adapter structurally complete and keyed by its own variant', () => {
    expect(allPuzzleBoardAdapters()).toHaveLength(PUZZLE_VARIANT_IDS.length);
    for (const variant of PUZZLE_VARIANT_IDS) {
      const adapter = puzzleBoardAdapter(variant);
      expect(adapter.variant).toBe(variant);
      expect(adapter.label.length).toBeGreaterThan(0);
      expect(adapter.markerId.length).toBeGreaterThan(0);
      expect(typeof adapter.paintBoard).toBe('function');
      expect(typeof adapter.animateMove).toBe('function');
      expect(typeof adapter.applyMove).toBe('function');
      expect(typeof adapter.moveLabel).toBe('function');
      expect(typeof adapter.sideIconSvg).toBe('function');
    }
  });

  it('fails closed on unknown variants (no fallback board)', () => {
    expect(isPuzzleVariant('banqi')).toBe(false);
    expect(() => puzzleBoardAdapter('banqi')).toThrow(/no board adapter/i);
    expect(() => puzzleBoardAdapter('')).toThrow(/no board adapter/i);
    // Prototype keys must not resolve through the registry object.
    expect(isPuzzleVariant('toString')).toBe(false);
    expect(() => puzzleBoardAdapter('constructor')).toThrow(/no board adapter/i);
  });
});
