import { beforeEach, describe, expect, it } from 'vitest';
import { mountRestartBanner, setRestartBanner } from './restart-banner.js';

function getBanner(): HTMLDivElement {
  const el = document.body.querySelector<HTMLDivElement>('.restart-banner');
  if (!el) throw new Error('banner not mounted');
  return el;
}

function getLabelText(): string {
  return getBanner().querySelector('[data-label]')?.textContent ?? '';
}

function getHintText(): string {
  return getBanner().querySelector('[data-hint]')?.textContent ?? '';
}

describe('restart-banner', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    mountRestartBanner();
  });

  it('mounts hidden at the top of the body', () => {
    const banner = getBanner();
    expect(banner.hidden).toBe(true);
    expect(banner).toBe(document.body.firstChild);
  });

  it('mountRestartBanner is idempotent', () => {
    mountRestartBanner();
    mountRestartBanner();
    expect(document.body.querySelectorAll('.restart-banner').length).toBe(1);
  });

  it('shows a pending update while active games finish', () => {
    setRestartBanner('pending');
    expect(getBanner().hidden).toBe(false);
    expect(getLabelText()).toBe('Update pending');
    expect(getHintText()).toBe('Active games can finish before the restart.');
  });

  it('shows when the restart is beginning', () => {
    setRestartBanner('restarting');
    expect(getBanner().hidden).toBe(false);
    expect(getLabelText()).toBe('Server restarting now');
    expect(getHintText()).toBe('Please reconnect in a moment.');
  });

  it('hides the banner when the restart is cancelled', () => {
    setRestartBanner('pending');
    expect(getBanner().hidden).toBe(false);
    setRestartBanner(null);
    expect(getBanner().hidden).toBe(true);
  });
});
