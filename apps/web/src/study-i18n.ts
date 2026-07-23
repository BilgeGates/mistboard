// Localized study text.
//
// Model: a study keeps ONE structural source of truth (its name, description,
// chapter names, and the move tree with its comments). Translations are an
// overlay keyed by locale, exactly like the article dictionaries in
// article-i18n.ts — never a duplicated study per language, which would fork the
// move tree and split likes and comments across copies.
//
// Every lookup falls back to the base text, so a partially translated study
// degrades one string at a time rather than stranding a reader on a page that is
// half in a language they do not read. That matters here: the curated classical
// studies are authored Chinese-first (the woodblock prints 順砲橫車…), and the
// English is the translation, so "base" is not a synonym for "English".

import { currentLocale, type Locale } from './i18n/locale.js';

/** Per-locale overrides for one record's authored strings. Keys are Locale
 *  codes; unknown keys are ignored rather than rejected, so a blob written by a
 *  newer client cannot break an older one. */
export type StudyI18n = Partial<Record<Locale, { name?: string; description?: string }>>;

/** Per-locale text for a single tree comment (stored inside the chapter blob). */
export type CommentI18n = Partial<Record<Locale, string>>;

function isNonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Parse an untrusted `i18n` value (from the API or a stored blob) into the
 *  overlay shape, dropping anything malformed. Never throws: a corrupt overlay
 *  must degrade to "no translations", not break the page. */
export function parseStudyI18n(raw: unknown): StudyI18n {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: StudyI18n = {};
  for (const [locale, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const entry = value as Record<string, unknown>;
    const name = isNonEmpty(entry.name) ? entry.name : undefined;
    const description = isNonEmpty(entry.description) ? entry.description : undefined;
    if (name === undefined && description === undefined) continue;
    out[locale as Locale] = { ...(name && { name }), ...(description && { description }) };
  }
  return out;
}

/** The study/chapter name for a locale, falling back to the base name. */
export function localizedStudyName(
  base: string,
  i18n: unknown,
  locale: Locale = currentLocale(),
): string {
  const parsed = parseStudyI18n(i18n);
  return parsed[locale]?.name ?? base;
}

/** The study description for a locale, falling back to the base description. */
export function localizedStudyDescription(
  base: string,
  i18n: unknown,
  locale: Locale = currentLocale(),
): string {
  const parsed = parseStudyI18n(i18n);
  return parsed[locale]?.description ?? base;
}

/** The text of one authored comment for a locale, falling back to its base text.
 *  `i18n` rides on the comment itself inside the serialized tree. */
export function localizedCommentText(
  base: string,
  i18n: unknown,
  locale: Locale = currentLocale(),
): string {
  if (!i18n || typeof i18n !== 'object' || Array.isArray(i18n)) return base;
  const value = (i18n as Record<string, unknown>)[locale];
  return isNonEmpty(value) ? value : base;
}

/** Resolve a tree node's first comment for display. Returns undefined when the
 *  node carries no comment, so callers keep their existing "no comment" branch.
 *  READ paths only: the annotations editor writes the base text and must keep
 *  showing it, or an owner editing in one locale would overwrite it with a
 *  translation. */
export function displayComment(
  comment: { text?: string; i18n?: Record<string, string> } | undefined,
  locale: Locale = currentLocale(),
): string | undefined {
  if (!comment || !isNonEmpty(comment.text)) return undefined;
  return localizedCommentText(comment.text, comment.i18n, locale);
}
