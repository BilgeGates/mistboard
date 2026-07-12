import {
  type CrazyhousePlayerView,
  createInitialCrazyhouseState,
  getCrazyhousePlayerView,
  type Square,
} from '@mistboard/game';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type DarkCrazyhousePostgameResponse,
  darkCrazyhousePostgameApiUrl,
  mountDarkCrazyhousePostgame,
} from './dark-crazyhouse-postgame.js';

describe('Dark Crazyhouse postgame page', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DARK_CRAZYHOUSE_ENABLED', 'true');
    window.history.replaceState(null, '', '/dark-crazyhouse/game/dczh_postgame');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('builds the public postgame API URL', () => {
    expect(darkCrazyhousePostgameApiUrl('dczh room')).toBe(
      '/api/dark-crazyhouse/games/dczh%20room',
    );
  });

  it('mounts the review with site nav, action spacing hooks, and arrow replay', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(postgameFixture())),
    );
    const root = document.createElement('div');

    mountDarkCrazyhousePostgame(root, 'dczh_postgame');
    await flushPromises();

    expect(root.querySelector('.site-nav')).not.toBeNull();
    expect(root.textContent).toContain('Dark Crazyhouse');
    expect(root.textContent).not.toContain('Play again');
    expect(root.textContent).not.toContain('Opponent reserve: hidden');
    expect(root.textContent).toContain('Ply 2 of 2');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(root.textContent).toContain('Ply 1 of 2');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(root.textContent).toContain('Ply 0 of 2');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(root.textContent).toContain('Ply 2 of 2');
  });
});

function postgameFixture(): DarkCrazyhousePostgameResponse {
  const initial = createInitialCrazyhouseState('dczh_postgame');
  const finalStatus = { type: 'finished', winner: 'white', reason: 'resignation' } as const;
  const white = reviewView(getCrazyhousePlayerView(initial, 'white'), 'white', finalStatus);
  const black = reviewView(getCrazyhousePlayerView(initial, 'black'), 'black', finalStatus);
  const truth = reviewView(getCrazyhousePlayerView(initial, 'white'), 'truth', finalStatus);
  const snapshots = [0, 1, 2];
  return {
    game: {
      roomId: 'dczh_postgame',
      variant: 'dark-crazyhouse',
      mode: 'pvp',
      result: 'white-wins',
      termination: 'resignation',
      plyCount: 2,
      startedAt: '2026-06-20T08:00:00.000Z',
      endedAt: '2026-06-20T08:05:00.000Z',
      rated: false,
      visibility: 'private',
      initialMs: 180000,
      incrementMs: 2000,
    },
    state: {
      status: finalStatus,
      moveNumber: 2,
      timeControl: { initialMs: 180000, incrementMs: 2000 },
    },
    timeline: [],
    view: truth,
    views: { white, truth, black },
    history: {
      white: snapshots.map((ply) => ({ ply, view: white })),
      truth: snapshots.map((ply) => ({ ply, view: truth })),
      black: snapshots.map((ply) => ({ ply, view: black })),
    },
  };
}

function reviewView(
  view: CrazyhousePlayerView,
  idSuffix: string,
  status: CrazyhousePlayerView['status'],
): CrazyhousePlayerView {
  return {
    ...view,
    id: `${view.id}_${idSuffix}`,
    legalMoves: [],
    moveNumber: 2,
    status,
    visibleSquares: allSquares(),
  };
}

function allSquares(): Square[] {
  const squares: Square[] = [];
  for (let file = 0; file < 8; file += 1) {
    for (let rank = 1; rank <= 8; rank += 1) {
      squares.push(`${String.fromCharCode('a'.charCodeAt(0) + file)}${rank}` as Square);
    }
  }
  return squares;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}
