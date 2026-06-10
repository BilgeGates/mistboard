import { beforeEach, describe, expect, it } from 'vitest';
import { buildSiteBox } from './site-box.js';

describe('buildSiteBox', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders a linked header with the more label when href is set', () => {
    const { box, body } = buildSiteBox({ title: 'News', href: '/articles' });

    const top = box.querySelector<HTMLAnchorElement>('a.site-box-top');
    expect(top?.getAttribute('href')).toBe('/articles');
    expect(top?.querySelector('.site-box-title')?.textContent).toBe('News');
    expect(top?.querySelector('.site-box-more')?.textContent).toBe('More »');
    expect(body.classList.contains('site-box-body')).toBe(true);
    expect(box.contains(body)).toBe(true);
  });

  it('renders a plain header without a link when href is absent', () => {
    const { box } = buildSiteBox({ title: 'Activity', className: 'landing-activity' });

    expect(box.querySelector('a.site-box-top')).toBeNull();
    expect(box.querySelector('div.site-box-top .site-box-title')?.textContent).toBe('Activity');
    expect(box.querySelector('.site-box-more')).toBeNull();
    expect(box.classList.contains('landing-activity')).toBe(true);
  });
});
