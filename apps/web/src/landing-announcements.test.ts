import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildLandingAnnouncements } from './landing-announcements.js';

describe('landing announcements', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('hides the Dark Mini Xiangqi announcement until public entry is enabled', () => {
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');

    expect(buildLandingAnnouncements().textContent).not.toContain('Dark Mini Xiangqi');
  });

  it('shows the Dark Mini Xiangqi announcement when public entry is enabled', () => {
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_PUBLIC_ENTRY_ENABLED', 'true');

    const panel = buildLandingAnnouncements();

    expect(panel.textContent).toContain('Dark Mini Xiangqi');
    expect(panel.textContent).toContain('Read rules');
  });
});
