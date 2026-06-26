import { afterEach, describe, expect, it } from 'vitest';
import { buildNav } from './site-shell.js';

describe('site shell nav', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState(null, '', '/');
  });

  it('links to Puzzles from the primary nav and marks puzzle detail routes active', () => {
    window.history.replaceState(null, '', '/puzzles/drop-mini-xiangqi-red-chariot-drop-mate-1');

    const nav = buildNav();
    document.body.append(nav);

    const primaryLabels = [
      ...nav.querySelectorAll<HTMLElement>(
        '.site-nav-links > .site-nav-link, .site-nav-links > .site-nav-menu > .site-nav-menu-toggle',
      ),
    ].map((link) => link.textContent);
    expect(primaryLabels).toEqual(['Play', 'Puzzles', 'Learn', 'Watch', 'Community']);

    const puzzleLink = nav.querySelector<HTMLAnchorElement>('a[href="/puzzles"]');
    expect(puzzleLink?.textContent).toBe('Puzzles');
    expect(puzzleLink?.classList.contains('active')).toBe(true);
    expect(puzzleLink?.getAttribute('aria-current')).toBe('page');
    expect(nav.querySelector('.site-nav-menu-toggle')?.textContent).toBe('Learn');
    expect(nav.querySelector<HTMLAnchorElement>('a[href="/forum"]')?.textContent).toBe('Forum');
    expect(nav.querySelector<HTMLAnchorElement>('a[href="/leaderboard"]')?.textContent).toBe(
      'Leaderboard',
    );
    expect(nav.querySelector<HTMLAnchorElement>('a[href="/bots"]')?.textContent).toBe('Bots');
  });

  it('localizes launch nav labels and translated content links', () => {
    window.history.replaceState(null, '', '/zh-hant/rules/banqi');

    const nav = buildNav('zh-Hant');
    document.body.append(nav);

    const primaryLabels = [
      ...nav.querySelectorAll<HTMLElement>(
        '.site-nav-links > .site-nav-link, .site-nav-links > .site-nav-menu > .site-nav-menu-toggle',
      ),
    ].map((link) => link.textContent);

    expect(primaryLabels).toEqual(['對弈', '題目', '學習', '觀看', '社群']);
    expect(nav.getAttribute('aria-label')).toBe('主導覽');
    const language = nav.querySelector<HTMLSelectElement>('.site-nav-language');
    expect(language?.getAttribute('aria-label')).toBe('語言');
    expect(language?.value).toBe('zh-Hant');
    expect([...(language?.options ?? [])].map((option) => option.textContent)).toEqual([
      'English',
      '简体中文',
      '繁體中文',
      '日本語',
    ]);
    expect(nav.querySelector<HTMLAnchorElement>('a[href="/zh-hant/rules"]')?.textContent).toBe(
      '規則',
    );
    expect(
      nav
        .querySelector<HTMLAnchorElement>('a[href="/zh-hant/rules"]')
        ?.classList.contains('active'),
    ).toBe(true);
    expect(nav.querySelector('.site-nav-menu-toggle')?.classList.contains('active')).toBe(true);
    expect(nav.querySelector<HTMLAnchorElement>('a[href="/zh-hant/articles"]')?.textContent).toBe(
      '文章',
    );
    expect(nav.querySelector<HTMLAnchorElement>('a[href="/account?tab=login"]')?.textContent).toBe(
      '登入',
    );
    expect(
      nav.querySelector<HTMLAnchorElement>('a[href="/account?tab=register"]')?.textContent,
    ).toBe('註冊');
  });
});
