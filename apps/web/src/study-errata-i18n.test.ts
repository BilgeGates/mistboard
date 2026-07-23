// The errata invitation must exist in every shipped locale.
//
// Study chrome is the one surface where an English fallback is actively wrong:
// the classical-manual studies are read in Chinese by exactly the readers most
// likely to spot a misread glyph, and those are the corrections worth having. A
// missing zh key shows them English and costs us the report.
//
// The zh catalogs are loaded with await import() on purpose. A static import
// edge to either zh catalog, anywhere under src/, drags ~110 KB of strings into
// the entry chunk for every visitor. catalog.test.ts guards that invariant by
// scanning source TEXT (test files included), so even naming the offending
// syntax in a comment here would trip it.

import { describe, expect, it } from 'vitest';
import { EN_REVIEW } from './i18n/catalogs/review.js';

const ERRATA_KEYS = ['study.errataTitle', 'study.errataBody', 'study.errataAction'] as const;

async function zhCatalogs(): Promise<Record<string, Record<string, string>>> {
  const hans = await import('./i18n/catalogs/review.zh-hans.js');
  const hant = await import('./i18n/catalogs/review.zh-hant.js');
  return {
    'zh-Hans': hans.ZH_HANS_REVIEW as Record<string, string>,
    'zh-Hant': hant.ZH_HANT_REVIEW as Record<string, string>,
  };
}

const en = EN_REVIEW as Record<string, string>;

describe('study errata invitation', () => {
  it('is present in every shipped locale', async () => {
    const catalogs = { en, ...(await zhCatalogs()) };
    for (const key of ERRATA_KEYS) {
      for (const [locale, catalog] of Object.entries(catalogs)) {
        expect(catalog[key], `${key} missing from ${locale}`).toBeTruthy();
      }
    }
  });

  it('keeps the Chinese strings distinct from the English source', async () => {
    // A copy-pasted English value passes a presence check and still leaves the
    // reader with untranslated chrome.
    const zh = await zhCatalogs();
    for (const key of ERRATA_KEYS) {
      for (const catalog of Object.values(zh)) {
        expect(catalog[key]).not.toBe(en[key]);
      }
    }
  });

  it('uses no em dashes, per the user-facing copy rule', async () => {
    const catalogs = { en, ...(await zhCatalogs()) };
    for (const catalog of Object.values(catalogs)) {
      for (const key of ERRATA_KEYS) {
        expect(catalog[key]).not.toContain('—');
      }
    }
  });
});
