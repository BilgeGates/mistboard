import { describe, expect, it } from 'vitest';
import { appTranslationKeys, CRITICAL_I18N_KEYS, hasAppTranslation, t } from './catalog.js';
import { APP_LOCALES } from './locale.js';

describe('app i18n catalog', () => {
  it('has an English source string for every app key', () => {
    const missing = appTranslationKeys().filter((key) => t(key, {}, 'en').trim() === '');
    expect(missing).toEqual([]);
  });

  it('has every critical key translated in outreach locales', () => {
    const locales = APP_LOCALES.filter((locale) => locale !== 'en');
    const missing: string[] = [];
    for (const locale of locales) {
      for (const key of CRITICAL_I18N_KEYS) {
        if (!hasAppTranslation(locale, key)) missing.push(`${locale}:${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('interpolates params and falls back to English for non-critical gaps', () => {
    expect(t('play.playingNow', { count: 3 }, 'zh-Hant')).toBe('3 局正在進行');
    expect(t('play.unavailable', {}, 'en')).toBe('Unavailable');
  });
});
