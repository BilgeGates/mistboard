import {
  applyRevealChessMove,
  createInitialRevealChessState,
  getRevealChessPlayerView,
  type RevealChessColor,
  type RevealChessGameState,
  type RevealChessPlayerView,
  revealChessTruthView,
} from '@mistboard/game';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  RevealChessPostgameResponse,
  RevealChessPostgameViewKey,
} from './reveal-chess-postgame.js';
import { mountRevealChessWatchReplay } from './watch-reveal-chess-replay.js';

describe('Reveal Chess watch replay', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mounts a Reveal Chess TV triptych with controls', async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const roomId = String(input).split('/').pop() ?? 'rc_watch';
      return jsonResponse(postgameFixture(roomId));
    });
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');

    const handle = await mountRevealChessWatchReplay(root, 'rc_watch', { autoplay: false });

    expect(fetchSpy).toHaveBeenCalledWith('/api/reveal-chess/games/rc_watch');
    expect(handle.activeSampleId()).toBe('rc_watch');
    expect(root.textContent).toContain('Human vs human');
    expect(root.textContent).toContain('White wins');
    expect(root.textContent).toContain('by Resignation');
    expect(root.textContent).toContain('1 plies');
    expect(root.textContent).toContain('3+2');
    expect(root.textContent).toContain('Ply 0 / 1');
    // The per-color triptych: three reveal-chess boards.
    expect(root.querySelectorAll('.reveal-chess-live-svg')).toHaveLength(3);

    root.querySelector<HTMLButtonElement>('[aria-label="Next move"]')?.click();
    expect(root.textContent).toContain('Ply 1 / 1 - White wins');
    root.querySelector<HTMLButtonElement>('[aria-label="Flip boards"]')?.click();
    expect(root.querySelectorAll('.reveal-chess-live-svg')).toHaveLength(3);

    await handle.loadGame('rc_next');
    expect(fetchSpy).toHaveBeenCalledWith('/api/reveal-chess/games/rc_next');
    expect(handle.activeSampleId()).toBe('rc_next');

    handle.destroy();
    expect(root.childElementCount).toBe(0);
  });
});

function viewFor(
  state: RevealChessGameState,
  key: RevealChessPostgameViewKey,
): RevealChessPlayerView {
  if (key === 'truth') return revealChessTruthView(state);
  return getRevealChessPlayerView(state, key as RevealChessColor);
}

function postgameFixture(roomId: string): RevealChessPostgameResponse {
  const initial = createInitialRevealChessState(roomId);
  const moved = applyRevealChessMove(initial, { from: 'e2', to: 'e3' });
  const status = {
    type: 'finished' as const,
    winner: 'white' as const,
    reason: 'resignation' as const,
  };
  const finished: RevealChessGameState = { ...moved, status };
  return {
    game: {
      roomId,
      variant: 'reveal-chess',
      mode: 'pvp',
      result: 'white-wins',
      termination: 'resignation',
      plyCount: 1,
      startedAt: '2026-06-16T12:00:00.000Z',
      endedAt: '2026-06-16T12:05:00.000Z',
      rated: false,
      visibility: 'public',
      initialMs: 180_000,
      incrementMs: 2_000,
    },
    state: {
      status,
      moveNumber: moved.moveNumber,
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
    },
    timeline: [
      { type: 'move-played', at: 2, color: 'white', move: { from: 'e2', to: 'e3' }, ply: 1 },
      { type: 'seat-resigned', at: 3, color: 'black', winner: 'white' },
    ],
    view: revealChessTruthView(finished),
    views: {
      white: viewFor(finished, 'white'),
      truth: viewFor(finished, 'truth'),
      black: viewFor(finished, 'black'),
    },
    history: {
      white: [
        { ply: 0, view: viewFor(initial, 'white') },
        { ply: 1, view: viewFor(moved, 'white') },
      ],
      truth: [
        { ply: 0, view: viewFor(initial, 'truth') },
        { ply: 1, view: viewFor(moved, 'truth') },
      ],
      black: [
        { ply: 0, view: viewFor(initial, 'black') },
        { ply: 1, view: viewFor(moved, 'black') },
      ],
    },
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: init.status ?? 200,
  });
}
