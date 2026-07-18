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
  it('keeps the grid-line-sharing hooks the homepage band CSS keys on', () => {
    // The desktop band aligns the side board boxes to the center feed with pure
    // CSS (landing.css "Grid-line sharing", issue #120). That CSS keys on these
    // class names; renaming them in the DOM without updating landing.css would
    // silently break the alignment.
    const wrap = document.createElement('div');
    wrap.innerHTML = renderLandingShellForPrerender();

    const demo = wrap.querySelector('.landing-demo');
    expect(demo).not.toBeNull();
    expect(demo?.querySelector(':scope > .landing-viewer-column')).not.toBeNull();
    expect(demo?.querySelector(':scope > .landing-puzzle-column')).not.toBeNull();
    expect(demo?.querySelector(':scope > .landing-center-below')).not.toBeNull();
    expect(demo?.querySelector('.landing-viewer-column .landing-board-column')).not.toBeNull();
  });

  it('leads the top-left rail with News and demotes chat to the lower strip', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML = renderLandingShellForPrerender();

    const newsColumn = wrap.querySelector('.landing-news-column');
    const lowerStrip = wrap.querySelector('.landing-lower-strip');
    // The News feed leads the prime top-left rail; chat no longer sits there.
    expect(newsColumn?.querySelector('.landing-announcements')).not.toBeNull();
    expect(newsColumn?.querySelector('.landing-chat-mount')).toBeNull();
    // Chat moved down into the lower strip alongside the forum.
    expect(lowerStrip?.querySelector('.landing-chat-mount')).not.toBeNull();
    expect(lowerStrip?.querySelector('.landing-announcements')).toBeNull();
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
