import { afterEach, describe, expect, it, vi } from 'vitest';

describe('profile rated grid', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('shows the Dark Mini Xiangqi row behind the render flag even before rated games', async () => {
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    const { buildProfileRatings } = await import('./profile.js');

    const section = buildProfileRatings([]);

    expect(section.textContent).toContain('Dark Chess');
    expect(section.textContent).toContain('Dark Mini Xiangqi');
    expect(section.querySelectorAll('.profile-rating-cell-empty')).toHaveLength(6);
  });
});
