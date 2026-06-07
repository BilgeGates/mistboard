// Prose extraction shared by the translation-coverage test and the
// i18n:coverage reporter. Only strings a reader sees as natural-language copy
// are treated as translatable. Board labels baked into specs and generated SVG,
// and code-block payloads, are deliberately excluded as a separate, known
// localization gap.
import type { Article, ArticleBlock, ArticleSection } from './articles-data.js';

export type Prose = { path: string; text: string };

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
  'dual-replay': caption,
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

// Every natural-language string an article contributes, each with a dotted path
// for diagnostics. Order is stable: title, summary, tldr, intro, then sections.
export function articleProse(article: Article): Prose[] {
  const out: Prose[] = [
    { path: 'title', text: article.title },
    { path: 'summary', text: article.summary },
  ];
  (article.tldr ?? []).forEach((t, i) => out.push({ path: `tldr[${i}]`, text: t }));
  (article.intro ?? []).forEach((b, i) => out.push(...blockProse(b, `intro[${i}]`)));
  article.sections.forEach((s, i) => out.push(...sectionProse(s, `sections[${i}]`)));
  return out;
}
