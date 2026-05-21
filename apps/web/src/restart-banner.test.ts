import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountRestartBanner, setRestartBanner } from './restart-banner.js';

function getBanner(): HTMLDivElement {
  const el = document.body.querySelector<HTMLDivElement>('.restart-banner');
  if (!el) throw new Error('banner not mounted');
  return el;
}

function getCountdownText(): string {
  return getBanner().querySelector('[data-countdown]')?.textContent ?? '';
}

describe('restart-banner', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
    mountRestartBanner();
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('reveals the banner and renders an mm:ss countdown when given a future restartAt', () => {
    setRestartBanner(Date.now() + 14 * 60 * 1000 + 23 * 1000);
    expect(getBanner().hidden).toBe(false);
    expect(getCountdownText()).toBe('14:23');
  });

  it('pads the seconds field', () => {
    setRestartBanner(Date.now() + 60_000 + 4_000);
    expect(getCountdownText()).toBe('1:04');
  });

  it('ticks the countdown each second', () => {
    setRestartBanner(Date.now() + 65_000);
    expect(getCountdownText()).toBe('1:05');
    vi.advanceTimersByTime(1_000);
    expect(getCountdownText()).toBe('1:04');
    vi.advanceTimersByTime(60_000);
    expect(getCountdownText()).toBe('0:04');
  });

  it('hides the banner when restartAt is null', () => {
    setRestartBanner(Date.now() + 60_000);
    expect(getBanner().hidden).toBe(false);
    setRestartBanner(null);
    expect(getBanner().hidden).toBe(true);
  });

  it('hides the banner when restartAt is already in the past', () => {
    setRestartBanner(Date.now() - 5_000);
    expect(getBanner().hidden).toBe(true);
  });

  it('leaves the banner visible past T-zero with a "now" label', () => {
    setRestartBanner(Date.now() + 2_000);
    expect(getCountdownText()).toBe('0:02');
    vi.advanceTimersByTime(5_000);
    expect(getBanner().hidden).toBe(false);
    expect(getCountdownText()).toBe('now');
  });
});
