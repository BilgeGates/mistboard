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
    expect(primaryLabels).toEqual(['Play', 'Puzzles', 'Learn', 'Watch', 'Community', 'Tools']);

    const puzzleLink = nav.querySelector<HTMLAnchorElement>('a[href="/puzzles"]');
    expect(puzzleLink?.textContent).toBe('Puzzles');
    expect(puzzleLink?.classList.contains('active')).toBe(true);
    expect(puzzleLink?.getAttribute('aria-current')).toBe('page');
    expect(nav.querySelector('.site-nav-menu-toggle')?.textContent).toBe('Learn');
    expect(nav.querySelector<HTMLAnchorElement>('a[href="/forum"]')?.textContent).toBe('Forum');
    expect(nav.querySelector<HTMLAnchorElement>('a[href="/bots"]')?.textContent).toBe('Bots');
  });
});
