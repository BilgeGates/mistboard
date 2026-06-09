import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchPlayableEnginesOnce,
  landingRoomClientKindForUrl,
  loadPlayableEnginesWithRetry,
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
    vi.stubEnv('VITE_DUAL_CHESS_ENABLED', 'true');
    window.history.replaceState(null, '', '/');

    expect(landingRoomClientKindForUrl('/room/dchess_created')).toBe('crossroads');
    expect(landingRoomClientKindForUrl('/room/dark_created')).toBe('standard');
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: init.status ?? 200,
  });
}
