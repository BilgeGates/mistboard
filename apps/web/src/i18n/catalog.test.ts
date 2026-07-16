import { describe, expect, it } from 'vitest';
import { appTranslationKeys, CRITICAL_I18N_KEYS, hasAppTranslation, t } from './catalog.js';
import {
  CRITICAL_ACCOUNT_I18N_KEYS,
  EN_ACCOUNT,
  ZH_HANS_ACCOUNT,
  ZH_HANT_ACCOUNT,
} from './catalogs/account.js';
import {
  CRITICAL_COMMUNITY_I18N_KEYS,
  EN_COMMUNITY,
  ZH_HANS_COMMUNITY,
  ZH_HANT_COMMUNITY,
} from './catalogs/community.js';
import {
  CRITICAL_CONTENT_I18N_KEYS,
  EN_CONTENT,
  ZH_HANS_CONTENT,
  ZH_HANT_CONTENT,
} from './catalogs/content.js';
import { CRITICAL_PLAY_I18N_KEYS, EN_PLAY, ZH_HANS_PLAY, ZH_HANT_PLAY } from './catalogs/play.js';
import {
  CRITICAL_REVIEW_I18N_KEYS,
  EN_REVIEW,
  ZH_HANS_REVIEW,
  ZH_HANT_REVIEW,
} from './catalogs/review.js';
import {
  CRITICAL_SHELL_I18N_KEYS,
  EN_SHELL,
  ZH_HANS_SHELL,
  ZH_HANT_SHELL,
} from './catalogs/shell.js';
import { SUPPORTED_LOCALES } from './locale.js';

type DomainCatalog = {
  critical: readonly string[];
  english: Record<string, string>;
  locales: readonly Record<string, string>[];
  name: string;
  prefixes: readonly string[];
};

const DOMAIN_CATALOGS: readonly DomainCatalog[] = [
  {
    name: 'shell',
    prefixes: [
      'nav',
      'home',
      'site',
      'footer',
      'notFound',
      'connection',
      'lag',
      'prefs',
      'homePuzzle',
      'homeForum',
    ],
    english: EN_SHELL,
    locales: [ZH_HANS_SHELL, ZH_HANT_SHELL],
    critical: CRITICAL_SHELL_I18N_KEYS,
  },
  {
    name: 'content',
    prefixes: [
      'videos',
      'articles',
      'rules',
      'news',
      'patron',
      'contact',
      'about',
      'source',
      'contribute',
      'thanks',
      'faq',
      'terms',
      'privacy',
    ],
    english: EN_CONTENT,
    locales: [ZH_HANS_CONTENT, ZH_HANT_CONTENT],
    critical: CRITICAL_CONTENT_I18N_KEYS,
  },
  {
    name: 'account',
    prefixes: ['account'],
    english: EN_ACCOUNT,
    locales: [ZH_HANS_ACCOUNT, ZH_HANT_ACCOUNT],
    critical: CRITICAL_ACCOUNT_I18N_KEYS,
  },
  {
    name: 'community',
    prefixes: [
      'profile',
      'inbox',
      'friends',
      'following',
      'chat',
      'title',
      'verifyTitle',
      'coach',
      'streamer',
      'challenge',
    ],
    english: EN_COMMUNITY,
    locales: [ZH_HANS_COMMUNITY, ZH_HANT_COMMUNITY],
    critical: CRITICAL_COMMUNITY_I18N_KEYS,
  },
  {
    name: 'play',
    prefixes: ['game', 'play', 'lobby', 'setup', 'variant', 'live', 'result'],
    english: EN_PLAY,
    locales: [ZH_HANS_PLAY, ZH_HANT_PLAY],
    critical: CRITICAL_PLAY_I18N_KEYS,
  },
  {
    name: 'review',
    prefixes: ['replay', 'watch'],
    english: EN_REVIEW,
    locales: [ZH_HANS_REVIEW, ZH_HANT_REVIEW],
    critical: CRITICAL_REVIEW_I18N_KEYS,
  },
];

describe('app i18n catalog', () => {
  it('has an English source string for every app key', () => {
    const missing = appTranslationKeys().filter((key) => t(key, {}, 'en').trim() === '');
    expect(missing).toEqual([]);
  });

  it('has every critical key translated in outreach locales', () => {
    const locales = SUPPORTED_LOCALES.filter((locale) => locale !== 'en');
    const missing: string[] = [];
    for (const locale of locales) {
      for (const key of CRITICAL_I18N_KEYS) {
        if (!hasAppTranslation(locale, key)) missing.push(`${locale}:${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('keeps every key in exactly one domain with locale and critical keys in bounds', () => {
    const owners = new Map<string, string>();

    for (const domain of DOMAIN_CATALOGS) {
      for (const key of Object.keys(domain.english)) {
        expect(domain.prefixes, `${key} belongs to the ${domain.name} domain`).toContain(
          key.split('.')[0],
        );
        expect(owners.get(key), `${key} is owned by more than one domain`).toBeUndefined();
        owners.set(key, domain.name);
      }

      for (const locale of domain.locales) {
        expect(Object.keys(locale).filter((key) => !(key in domain.english))).toEqual([]);
      }
      expect(domain.critical.filter((key) => !(key in domain.english))).toEqual([]);
    }

    expect([...owners.keys()].sort()).toEqual(appTranslationKeys().sort());
  });

  it('interpolates params and falls back to English for non-critical gaps', () => {
    expect(t('play.playingNow', { count: 3 }, 'zh-Hant')).toBe('3 局正在進行');
    expect(t('play.unavailable', {}, 'en')).toBe('Unavailable');
  });

  it('keeps Patron support separate from future paid products', () => {
    const patronCopy = [
      t('patron.heroTitle', {}, 'en'),
      t('patron.intro', {}, 'en'),
      t('patron.perk', {}, 'en'),
      t('patron.faqPerkAnswer', {}, 'en'),
    ].join(' ');

    expect(patronCopy).toContain('Core play and learning stay free');
    expect(patronCopy).toContain('Separate paid tools or products may exist later');
    expect(patronCopy).not.toMatch(/games are free\. forever|nothing .*locked behind/i);
  });
});
