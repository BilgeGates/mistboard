import { describe, expect, it } from 'vitest';
import { hasTranslation, ARTICLE_LANGS } from './article-i18n.js';
import {
  articles,
  type Article,
  type ArticleBlock,
  type ArticleSection,
} from './articles-data.js';

// Slugs whose English copy is editorially frozen AND fully translated into
// every zh script. Add a slug here only after (1) its copy is final and
// (2) every prose string it contributes resolves in zh-Hans and zh-Hant.
//
// Once a slug is listed, any later English edit that orphans a dictionary key
// fails this test instead of silently rendering English on the zh pages. That
// failure is the point: it forces the dictionary update to ride along with the
// copy change. This is the durability guarantee for the translations.
const TRANSLATION_LOCKED_SLUGS: string[] = [];

// Prose extraction. Only strings a reader sees as natural-language copy are
// required to translate. Board labels baked into specs and generated SVG, and
// code-block payloads, are deliberately excluded as a separate, known
// localization gap.
type Prose = { path: string; text: string };

function caption(block: { caption?: string }): string[] {
  return block.caption ? [block.caption] : [];
}

// Each block kind declares the prose it contributes. The mapped type is
// exhaustive over ArticleBlock['kind'], so adding a new block kind is a compile
// error here until someone decides what prose (if any) it carries.
const BLOCK_PROSE: {
  [K in ArticleBlock['kind']]: (block: Extract<ArticleBlock, { kind: K }>) => string[];
} = {
  paragraph: (b) => [b.text],
  'sub-heading': (b) => [b.text],
  cta: (b) => b.buttons.map((button) => button.label),
  'static-boards': caption,
  interactive: caption,
  'live-boards': caption,
  'raw-svg': caption,
  'raw-svg-stepper': (b) => [
    ...caption(b),
    ...b.steps.map((step) => step.narrative).filter((n): n is string => Boolean(n)),
  ],
  'xq-replay': caption,
  'mxq-replay': caption,
  'chess-replay': caption,
  code: caption,
};

function blockProse(block: ArticleBlock, path: string): Prose[] {
  const extract = BLOCK_PROSE[block.kind] as (b: ArticleBlock) => string[];
  return extract(block).map((text, i) => ({ path: `${path}.${block.kind}[${i}]`, text }));
}

function sectionProse(section: ArticleSection, path: string): Prose[] {
  const out: Prose[] = [{ path: `${path}.heading`, text: section.heading }];
  (section.paragraphs ?? []).forEach((p, i) =>
    out.push({ path: `${path}.paragraphs[${i}]`, text: p }),
  );
  (section.blocks ?? []).forEach((b, i) => out.push(...blockProse(b, `${path}.blocks[${i}]`)));
  return out;
}

function articleProse(article: Article): Prose[] {
  const out: Prose[] = [
    { path: 'title', text: article.title },
    { path: 'summary', text: article.summary },
  ];
  (article.tldr ?? []).forEach((t, i) => out.push({ path: `tldr[${i}]`, text: t }));
  (article.intro ?? []).forEach((b, i) => out.push(...blockProse(b, `intro[${i}]`)));
  article.sections.forEach((s, i) => out.push(...sectionProse(s, `sections[${i}]`)));
  return out;
}

function truncate(text: string): string {
  return text.length > 64 ? `${text.slice(0, 61)}...` : text;
}

const published = articles.filter((a) => a.status === 'published');

describe('article translation coverage', () => {
  for (const slug of TRANSLATION_LOCKED_SLUGS) {
    it(`${slug}: every prose string resolves in all zh scripts`, () => {
      const article = published.find((a) => a.slug === slug);
      expect(article, `locked slug "${slug}" is not a published article`).toBeTruthy();
      const missing: string[] = [];
      for (const { path, text } of articleProse(article as Article)) {
        for (const lang of ARTICLE_LANGS) {
          if (!hasTranslation(lang, text)) missing.push(`[${lang}] ${path}: ${truncate(text)}`);
        }
      }
      expect(missing, `untranslated strings:\n${missing.join('\n')}`).toEqual([]);
    });
  }

  it('locked slugs are real published articles', () => {
    const slugs = new Set(published.map((a) => a.slug));
    const unknown = TRANSLATION_LOCKED_SLUGS.filter((s) => !slugs.has(s));
    expect(unknown, `locked but not published: ${unknown.join(', ')}`).toEqual([]);
  });
});
