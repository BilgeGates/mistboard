import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchPlayableEnginesOnce,
  landingRoomClientKindForUrl,
  loadPlayableEnginesWithRetry,
  renderLandingShellForPrerender,
} from './landing.js';

const ROSTER = [
  { id: 'python-v2-v1.0', name: 'Misty 1.0', familyName: 'Misty', kind: 'container' },
];

describe('playable engines loading', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    window.history.replaceState(null, '', '/');
  });

  it('returns null on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 })),
    );
    expect(await fetchPlayableEnginesOnce()).toBeNull();
  });

  it('returns null on an empty roster (never the placeholder)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ engines: [] })),
    );
    expect(await fetchPlayableEnginesOnce()).toBeNull();
  });

  it('returns null when the fetch itself rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    expect(await fetchPlayableEnginesOnce()).toBeNull();
  });

  it('returns the roster on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ engines: ROSTER })),
    );
    expect(await fetchPlayableEnginesOnce()).toEqual(ROSTER);
  });

  it('retries transient failures and resolves once the roster is available', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValue(jsonResponse({ engines: ROSTER }));
    vi.stubGlobal('fetch', fetchSpy);
    vi.useFakeTimers();

    const promise = loadPlayableEnginesWithRetry();
    await vi.runAllTimersAsync();

    expect(await promise).toEqual(ROSTER);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('gives up and returns null after exhausting retries', async () => {
    const fetchSpy = vi.fn(async () => new Response('', { status: 503 }));
    vi.stubGlobal('fetch', fetchSpy);
    vi.useFakeTimers();

    const promise = loadPlayableEnginesWithRetry();
    await vi.runAllTimersAsync();

    expect(await promise).toBeNull();
    // initial attempt + one per backoff delay (4 delays) = 5 fetches
    expect(fetchSpy).toHaveBeenCalledTimes(5);
  });

  it('routes Crossroads rooms to the isolated live client during landing transitions', () => {
    vi.stubEnv('VITE_CROSSROADS_CHESS_ENABLED', 'true');
    window.history.replaceState(null, '', '/');

    expect(landingRoomClientKindForUrl('/room/dchess_created')).toBe('tenant');
    expect(landingRoomClientKindForUrl('/room/mxq_created')).toBe('standard');
    expect(landingRoomClientKindForUrl('/room/dark_created')).toBe('standard');
  });
});

describe('landing shell', () => {
  it('keeps the grid-area hooks the homepage band CSS keys on', () => {
    // landing.css places the three bands via these class names (grid-areas
    // left/panel/play, puzzle/forum/players, blogs/support); renaming them in
    // the DOM without updating landing.css would silently break the layout.
    const wrap = document.createElement('div');
    wrap.innerHTML = renderLandingShellForPrerender();

    const demo = wrap.querySelector('.landing-demo');
    expect(demo).not.toBeNull();
    expect(demo?.querySelector(':scope > .landing-left-column')).not.toBeNull();
    expect(demo?.querySelector(':scope > .landing-lobby-panel')).not.toBeNull();
    expect(demo?.querySelector(':scope > .landing-play-column')).not.toBeNull();
    expect(demo?.querySelector(':scope > .landing-puzzle-column')).not.toBeNull();
    expect(demo?.querySelector(':scope > .landing-forum-column')).not.toBeNull();
    expect(demo?.querySelector(':scope > .landing-players-column')).not.toBeNull();
    expect(demo?.querySelector(':scope > .landing-articles-row')).not.toBeNull();
    expect(demo?.querySelector('.landing-left-column .landing-board-column')).not.toBeNull();
    // The support/store pair left the homepage (patronage stays in the nav).
    expect(demo?.querySelector('.landing-support-row')).toBeNull();
  });

  it('leads the left rail with the event-banner slot over the viewer, with News gone', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML = renderLandingShellForPrerender();

    const leftColumn = wrap.querySelector('.landing-left-column');
    // The event-banner slot mounts first (it collapses via CSS when empty),
    // the game viewer below it.
    expect(leftColumn?.firstElementChild?.classList.contains('landing-event-banners')).toBe(true);
    expect(leftColumn?.querySelector('.landing-viewer-column')).not.toBeNull();
    // The News feed left the homepage (its history lives at /feed); chat moved
    // to the right rail beneath the Play button + stats.
    expect(wrap.querySelector('.landing-announcements')).toBeNull();
    expect(wrap.querySelector('.landing-play-column .landing-chat-mount')).not.toBeNull();
  });

  it('mounts the band-2 widgets and the single unified Play button', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML = renderLandingShellForPrerender();

    expect(wrap.querySelector('.landing-forum-column .landing-forum')).not.toBeNull();
    // Band 2 right: Top studies (took the Top players slot 2026-07-21).
    expect(wrap.querySelector('.landing-players-column .landing-study-widget')).not.toBeNull();
    // One play action only, and it is the primary unified entry.
    const actions = wrap.querySelectorAll('.landing-play-column .landing-play-action');
    expect(actions.length).toBe(1);
    expect(actions[0]?.classList.contains('landing-play-action-primary')).toBe(true);
  });

  it('links only the About Mistboard tagline tail', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML = renderLandingShellForPrerender();

    const about = wrap.querySelector('.landing-about');
    const link = about?.querySelector<HTMLAnchorElement>('a[href="/about"]');

    expect(about?.textContent).toBe(
      'Original strategy games. Free in your browser. About Mistboard...',
    );
    expect(link?.textContent).toBe('About Mistboard...');
    expect(about?.childNodes[0]?.textContent).toBe(
      'Original strategy games. Free in your browser. ',
    );
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: init.status ?? 200,
  });
}
