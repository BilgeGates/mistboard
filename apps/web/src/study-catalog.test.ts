import { readFileSync } from 'node:fs';
import {
  canonicalVariantOrderIndex,
  gameSpecForId,
  STUDY_ELIGIBLE_SPEC_IDS,
} from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STUDY_VARIANT,
  isStudyVariantId,
  STUDY_VARIANTS,
  studyVariantSupportsComposition,
  studyVariantSupportsGamebook,
} from './study-catalog.js';

describe('study catalog', () => {
  // The client union and the shared list feed different layers (board dispatch vs
  // the server's route allowlist). If they drift, the API accepts a chapter the
  // client cannot render (or refuses one it could).
  it('mirrors STUDY_ELIGIBLE_SPEC_IDS exactly', () => {
    expect(STUDY_VARIANTS.map((variant) => variant.id)).toEqual([...STUDY_ELIGIBLE_SPEC_IDS]);
  });

  it('every entry is a real game spec with a site label', () => {
    for (const variant of STUDY_VARIANTS) {
      expect(variant.label).toBe(gameSpecForId(variant.id).publicName);
      expect(variant.label.length).toBeGreaterThan(0);
    }
  });

  it('picker order follows CANONICAL_VARIANT_ORDER', () => {
    const indexes = STUDY_VARIANTS.map((variant) => canonicalVariantOrderIndex(variant.id));
    expect([...indexes].sort((a, b) => a - b)).toEqual(indexes);
  });

  it('narrows variants fail-closed', () => {
    expect(isStudyVariantId('xiangqi')).toBe(true);
    expect(isStudyVariantId('dark-chess')).toBe(true);
    // Hidden-deal variants have a board but no way to persist their deal yet.
    expect(isStudyVariantId('banqi')).toBe(false);
    expect(isStudyVariantId('jieqi')).toBe(false);
    expect(isStudyVariantId('jungle-flip')).toBe(false);
    expect(isStudyVariantId('chess')).toBe(false);
    expect(isStudyVariantId('')).toBe(false);
  });

  it('offers compositions only where a FEN parser exists', () => {
    // Widening this needs a parser in @mistboard/game plus a branch in
    // study-review.ts — a FEN we cannot parse back would be silently dropped.
    for (const variant of STUDY_VARIANTS) {
      expect(studyVariantSupportsComposition(variant.id)).toBe(variant.id === 'xiangqi');
      expect(studyVariantSupportsGamebook(variant.id)).toBe(variant.id === 'xiangqi');
    }
    expect(studyVariantSupportsComposition(DEFAULT_STUDY_VARIANT)).toBe(true);
  });
});

describe('study board dispatch', () => {
  // review/study-review.ts dispatches by string case, and its default branch is
  // compile-time exhaustive over the union — but a case that dynamic-imports the
  // WRONG module still typechecks. Reading the source keeps the mapping honest
  // (same pattern as variant-registry-sync.test.ts reading server source).
  // Path is relative to the vitest root (apps/web), same as articles.test.ts —
  // import.meta.url is not a file: URL under the jsdom environment.
  const source = readFileSync('src/review/study-review.ts', 'utf8');

  it('has a case for every catalog variant', () => {
    for (const variant of STUDY_VARIANTS) {
      expect(source, `${variant.id} has no case in review/study-review.ts`).toContain(
        `case '${variant.id}':`,
      );
    }
  });

  it('imports each variant its own review module', () => {
    const expected: Record<string, string> = {
      xiangqi: './xiangqi-review.js',
      jungle: './jungle-review.js',
      'fortress-xiangqi': './fortress-xiangqi-review.js',
      'dark-xiangqi': './dark-xiangqi-review.js',
      'dark-chess': './dark-chess-review.js',
    };
    for (const variant of STUDY_VARIANTS) {
      const module = expected[variant.id];
      expect(module, `${variant.id} is missing from this test's expectations`).toBeDefined();
      const branch = source.slice(source.indexOf(`case '${variant.id}':`));
      const nextCase = branch.indexOf("\n    case '");
      expect(nextCase === -1 ? branch : branch.slice(0, nextCase)).toContain(module!);
    }
  });
});
