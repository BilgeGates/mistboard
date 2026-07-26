import { createInitialDropMiniXiangqiState, getDropMiniXiangqiPlayerView } from '@mistboard/game';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDropMiniXiangqiPlayAgainRoom,
  type DropMiniXiangqiPostgameResponse,
} from './drop-mini-xiangqi-postgame.js';

describe('Drop Mini Xiangqi postgame play again', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('recreates PvE review games against the same built-in tier', async () => {
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ url: '/room/dmxqd_next' }),
    );
    vi.stubGlobal('fetch', fetchSpy);
    const fixture = postgameFixture({
      mode: 'pve',
      pveEngineId: 'fairy-stockfish-drop-mini-xiangqi-amateur',
    });

    await expect(createDropMiniXiangqiPlayAgainRoom(fixture)).resolves.toBe('/room/dmxqd_next');

    expect(fetchSpy).toHaveBeenCalledWith('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'pve',
        gameSpecId: 'drop-mini-xiangqi',
        preferredColor: 'random',
        engineId: 'fairy-stockfish-drop-mini-xiangqi-amateur',
        timeControl: { initialMs: 180_000, incrementMs: 2_000 },
      }),
    });
  });

  it('falls back to a casual PvP room when the review has no engine id', async () => {
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ url: '/room/dmxqd_next' }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    await expect(createDropMiniXiangqiPlayAgainRoom(postgameFixture())).resolves.toBe(
      '/room/dmxqd_next',
    );

    expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))).toEqual({
      mode: 'pvp',
      gameSpecId: 'drop-mini-xiangqi',
      preferredColor: 'random',
      rated: false,
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
    });
  });
});

function postgameFixture(
  gameOverrides: Partial<DropMiniXiangqiPostgameResponse['game']> = {},
): DropMiniXiangqiPostgameResponse {
  const state = createInitialDropMiniXiangqiState('dmxqd_review');
  const view = getDropMiniXiangqiPlayerView(state, 'red');
  return {
    game: {
      roomId: 'dmxqd_review',
      variant: 'drop-mini-xiangqi',
      mode: 'pvp',
      result: 'black-wins',
      termination: 'resignation',
      plyCount: 0,
      startedAt: new Date(1).toISOString(),
      endedAt: new Date(4).toISOString(),
      rated: false,
      visibility: 'private',
      initialMs: 180_000,
      incrementMs: 2_000,
      ...gameOverrides,
    },
    state: {
      status: { type: 'finished', winner: 'black', reason: 'resignation' },
      moveNumber: 1,
    },
    timeline: [],
    view,
    views: { truth: view },
    history: { truth: [{ ply: 0, view }] },
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: init.status ?? 200,
  });
}
