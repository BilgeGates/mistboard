import { describe, expect, it } from 'vitest';
// The server cannot import the web bundle, so apps/server/src/article-meta.ts
// hand-duplicates each article's title and kind. This test is what makes that
// duplication safe: publishing or renaming an article in articles-data without
// updating the server map fails here instead of shipping a wrong-direction
// 301 (kind falls back to 'article', so /rules/<slug> redirects away from its
// own prerendered page) or a generic share card.
import { ARTICLE_META } from '../../server/src/article-meta.js';
import { articles } from './articles-data.js';

describe('articles-data <-> server ARTICLE_META sync', () => {
  it('every article has a server ARTICLE_META entry with matching title and kind', () => {
    for (const article of articles) {
      const meta = ARTICLE_META[article.slug];
      expect(
        meta,
        `'${article.slug}' is missing from ARTICLE_META (apps/server/src/article-meta.ts)`,
      ).toBeDefined();
      expect(meta?.title, `ARTICLE_META title drifted for '${article.slug}'`).toBe(article.title);
      expect(meta?.kind, `ARTICLE_META kind drifted for '${article.slug}'`).toBe(article.kind);
      expect(
        meta?.description.length,
        `ARTICLE_META description is empty for '${article.slug}'`,
      ).toBeGreaterThan(0);
    }
  });

  it('every ARTICLE_META slug still exists in articles-data', () => {
    const slugs = new Set(articles.map((article) => article.slug));
    for (const slug of Object.keys(ARTICLE_META)) {
      expect(slugs.has(slug), `ARTICLE_META has stale slug '${slug}'`).toBe(true);
    }
  });
});
