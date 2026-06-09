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

  it('describes Dark Mini Xiangqi as playable alpha with play CTAs', () => {
    const page = buildArticlePage('dark-mini-xiangqi');
    const links = [...page.querySelectorAll<HTMLAnchorElement>('a')].map((link) => ({
      href: link.getAttribute('href'),
      text: link.textContent,
    }));

    expect(page.textContent).toContain('Dark Mini Xiangqi is open for alpha play');
    expect(page.textContent).not.toContain('not yet a public game mode');
    expect(links).toContainEqual({
      href: '/?play=engine&gameSpecId=dark-mini-xiangqi',
      text: 'Play Misty',
    });
    expect(links).toContainEqual({
      href: '/?play=friend&gameSpecId=dark-mini-xiangqi',
      text: 'Create invite',
    });
  });
});
