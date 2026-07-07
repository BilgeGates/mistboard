import { afterEach, describe, expect, it } from 'vitest';

describe('auth redirect helpers', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('builds a login URL with the current local path as referrer', async () => {
    window.history.replaceState(null, '', '/inbox/ana?filter=unread#latest');

    const { loginHrefForCurrentPage } = await import('./auth-redirect.js');

    expect(loginHrefForCurrentPage()).toBe(
      '/account?tab=login&referrer=%2Finbox%2Fana%3Ffilter%3Dunread%23latest',
    );
  });

  it('rejects non-local auth referrers', async () => {
    window.history.replaceState(null, '', '/account?tab=login&referrer=https://example.com');

    const { requestedAuthReferrer } = await import('./auth-redirect.js');

    expect(requestedAuthReferrer()).toBeNull();
  });
});
