import { describe, expect, it } from 'vitest';
import {
  localizedCommentText,
  localizedStudyDescription,
  localizedStudyName,
  parseStudyI18n,
} from './study-i18n.js';

describe('study i18n overlay', () => {
  it('uses the translated locale and falls back everywhere else', () => {
    const i18n = { 'zh-Hant': { name: '橘中秘' }, 'zh-Hans': { name: '橘中秘' } };
    expect(localizedStudyName('Secret in the Tangerine', i18n, 'zh-Hant')).toBe('橘中秘');
    expect(localizedStudyName('Secret in the Tangerine', i18n, 'en')).toBe(
      'Secret in the Tangerine',
    );
  });

  it('falls back per field, not per record', () => {
    // Name translated, description not: the reader gets the translated title and
    // the base description, rather than losing the translation entirely.
    const i18n = { 'zh-Hant': { name: '橘中秘' } };
    expect(localizedStudyName('Secret in the Tangerine', i18n, 'zh-Hant')).toBe('橘中秘');
    expect(localizedStudyDescription('Volume one.', i18n, 'zh-Hant')).toBe('Volume one.');
  });

  it('does not assume the base text is English', () => {
    // The classical studies are authored Chinese-first: the woodblock prints
    // 大列手砲局 and the English is the overlay, not the other way round.
    const i18n = { en: { name: 'The great opposing cannons' } };
    expect(localizedStudyName('大列手砲局', i18n, 'en')).toBe('The great opposing cannons');
    expect(localizedStudyName('大列手砲局', i18n, 'zh-Hant')).toBe('大列手砲局');
  });

  it('degrades to no translations when the overlay is malformed', () => {
    for (const bad of [null, undefined, 'nope', 42, [], { 'zh-Hant': 'not-an-object' }]) {
      expect(parseStudyI18n(bad)).toEqual({});
      expect(localizedStudyName('base', bad, 'zh-Hant')).toBe('base');
    }
  });

  it('never blanks out base text with an empty override', () => {
    const i18n = { 'zh-Hant': { name: '   ', description: '' } };
    expect(localizedStudyName('base name', i18n, 'zh-Hant')).toBe('base name');
    expect(localizedStudyDescription('base description', i18n, 'zh-Hant')).toBe('base description');
  });

  it('ignores unknown locale keys instead of rejecting the whole overlay', () => {
    // A blob written by a newer client must not break the locales this build knows.
    const i18n = { 'zh-Hant': { name: '橘中秘' }, ja: { name: 'unknown locale' } };
    expect(parseStudyI18n(i18n)['zh-Hant']?.name).toBe('橘中秘');
    expect(localizedStudyName('base', i18n, 'zh-Hant')).toBe('橘中秘');
  });

  it('localizes a tree comment and falls back to the printed text', () => {
    const i18n = { en: 'takes the horse' };
    expect(localizedCommentText('去馬', i18n, 'en')).toBe('takes the horse');
    expect(localizedCommentText('去馬', i18n, 'zh-Hant')).toBe('去馬');
    expect(localizedCommentText('去馬', undefined, 'en')).toBe('去馬');
  });
});
