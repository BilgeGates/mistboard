import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPatronPage } from './patron-page.js';

// The card hydrates asynchronously off /api/patron/config and the cached user.
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('patron card when checkout is not configured', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/patron/config')) {
          return new Response(JSON.stringify({ configured: false, tiers: [] }), {
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response('{}', { status: 401 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  // The page has to state what Patron support costs even while checkout is off:
  // it is the only public description of what this site sells.
  it('shows the four monthly amounts', async () => {
    const page = buildPatronPage('en');
    document.body.append(page);
    await settle();

    const amounts = [...page.querySelectorAll<HTMLElement>('.patron-amount-btn')].map(
      (el) => el.textContent,
    );
    expect(amounts).toEqual(['$5', '$10', '$20', '$50']);
  });

  it('offers no way to start a charge', async () => {
    const page = buildPatronPage('en');
    document.body.append(page);
    await settle();

    expect(page.querySelector('.patron-donate-btn')).toBeNull();
    expect(page.querySelectorAll('.patron-preview-label')).toHaveLength(1);
    expect(page.querySelector('.patron-note')?.textContent).toContain('not open yet');
  });
});
