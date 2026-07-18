import { describe, expect, it } from 'vitest';
import { buildLobbyPanel } from './landing-play.js';

// The Lobby tab carries a standing list of engine "seeds" (always-available bot
// opponents) so the seeks surface is never empty at zero human liquidity. These
// are client-derived launchers, not server seeks: honesty (labeled engine) and
// separation from the human seek table are the invariants worth pinning.
describe('landing lobby engine seeds', () => {
  it('always lists at least the Fog Chess engine seed', () => {
    const panel = buildLobbyPanel('en', { hydrate: false });
    const seeds = panel.querySelectorAll('.landing-lobby-seed');
    expect(seeds.length).toBeGreaterThan(0);
    const labels = [...seeds].map(
      (seed) => seed.querySelector('.landing-lobby-seed-variant')?.textContent,
    );
    // Dark chess is unconditionally enabled and PvE-capable, so its seed is a
    // stable anchor regardless of which variant flags the test env sets.
    expect(labels).toContain('Fog Chess');
  });

  it('labels each seed as an engine game rather than a human seek', () => {
    const panel = buildLobbyPanel('en', { hydrate: false });
    const seeds = [...panel.querySelectorAll<HTMLElement>('.landing-lobby-seed')];
    expect(seeds.length).toBeGreaterThan(0);
    for (const seed of seeds) {
      expect(seed.getAttribute('aria-label')?.startsWith('Play the engine')).toBe(true);
      const opponent = seed.querySelector('.landing-lobby-seed-opponent');
      // A bot icon plus a non-empty engine name is the honesty signal.
      expect(opponent?.querySelector('.landing-lobby-seed-boticon')).not.toBeNull();
      expect((opponent?.textContent ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  it('keeps engine seeds out of the human seek table', () => {
    const panel = buildLobbyPanel('en', { hydrate: false });
    const seedsBlock = panel.querySelector('.landing-lobby-seeds');
    expect(seedsBlock).not.toBeNull();
    expect(panel.querySelector('.landing-lobby-thead')).not.toBeNull();
    // Seeds are their own row grammar; they must not masquerade as .landing-lobby-trow
    // human seek rows (which carry the Join-a-ticket action).
    expect(seedsBlock?.querySelector('.landing-lobby-trow')).toBeNull();
  });
});
