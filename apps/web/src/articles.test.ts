import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildArticlePage, buildHomeArticleCards, buildRulesIndex } from './articles.js';

describe('article public listing gates', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllEnvs();
  });

  it('keeps Dark Mini Xiangqi off public article surfaces during soft launch', () => {
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');

    expect(buildHomeArticleCards(50)?.textContent).not.toContain('Dark Mini Xiangqi');
    expect(buildRulesIndex().textContent).not.toContain('Dark Mini Xiangqi');
    expect(buildRulesIndex().textContent).not.toContain('Mini Xiangqi');
    expect(buildArticlePage('dark-mini-xiangqi').textContent).toContain('Dark Mini Xiangqi');
    expect(buildArticlePage('mini-xiangqi').textContent).toContain('Mini Xiangqi');
  });

  it('lists Dark Mini Xiangqi rules when the public-entry flag is enabled', () => {
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_PUBLIC_ENTRY_ENABLED', 'true');

    expect(buildHomeArticleCards(50)?.textContent).toContain('Dark Mini Xiangqi');
    expect(buildRulesIndex().textContent).toContain('Dark Mini Xiangqi');
    expect(buildRulesIndex().textContent).toContain('Mini Xiangqi');
  });
});
