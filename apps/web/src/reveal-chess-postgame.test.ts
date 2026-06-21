import {
  applyRevealChessMove,
  createInitialRevealChessState,
  getRevealChessPlayerView,
  type RevealChessColor,
  type RevealChessGameState,
  type RevealChessPlayerView,
  revealChessTruthView,
} from '@mistboard/game';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mountRevealChessPostgame,
  postgameReplayMaxPly,
  postgameViewAtPly,
  type RevealChessPostgameResponse,
  type RevealChessPostgameViewKey,
  revealChessPostgameApiUrl,
} from './reveal-chess-postgame.js';

describe('Reveal Chess postgame page', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_REVEAL_CHESS_ENABLED', 'true');
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('builds the public postgame API URL', () => {
    expect(revealChessPostgameApiUrl('rc room')).toBe('/api/reveal-chess/games/rc%20room');
  });

  it('selects the latest history snapshot at or before a ply', () => {
    const postgame = postgameFixture();
    expect(postgameReplayMaxPly(postgame)).toBe(1);
    const at0 = postgameViewAtPly(postgame, 'white', 0);
    const at1 = postgameViewAtPly(postgame, 'white', 1);
    expect(at0).not.toBeNull();
    expect(at1).not.toBeNull();
    expect(at1).not.toBe(at0);
  });

  it('renders the per-color triptych with face-down discs and scrub controls', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(postgameFixture()));
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');

    mountRevealChessPostgame(root, 'rc_postgame');
    await flushPromises();

    expect(fetchSpy).toHaveBeenCalledWith('/api/reveal-chess/games/rc_postgame');
    expect(root.textContent).toContain('Reveal Chess');
    expect(root.textContent).toContain('White wins');
    expect(root.textContent).toContain('White view');
    expect(root.textContent).toContain('Server truth');
    expect(root.textContent).toContain('Black view');
    expect(root.textContent).toContain('Ply 1 of 1');
    // Three boards in the triptych, each the reveal-chess SVG.
    expect(root.querySelectorAll('.reveal-chess-live-svg')).toHaveLength(3);
    // The per-color views still carry face-down discs; the truth view does not.
    expect(root.querySelector('.reveal-chess-facedown')).not.toBeNull();

    root.querySelector<HTMLButtonElement>('[aria-label="Previous ply"]')?.click();
    expect(root.textContent).toContain('Ply 0 of 1');
    root.querySelector<HTMLButtonElement>('[aria-label="Final ply"]')?.click();
    expect(root.textContent).toContain('Ply 1 of 1');
  });

  it('renders black wins with chess copy', async () => {
    const fixture = postgameFixture();
    fixture.game.result = 'black-wins';
    fixture.state.status = { type: 'finished', winner: 'black', reason: 'checkmate' };
    const fetchSpy = vi.fn(async () => jsonResponse(fixture));
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');

    mountRevealChessPostgame(root, 'rc_black_win');
    await flushPromises();

    expect(root.textContent).toContain('Black wins');
    expect(root.textContent).not.toContain('Red wins');
  });

  it('shows the disabled notice when the build flag is off', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_REVEAL_CHESS_ENABLED', 'false');
    const root = document.createElement('div');
    mountRevealChessPostgame(root, 'rc_off');
    await flushPromises();
    expect(root.textContent).toContain('Reveal Chess unavailable');
  });
});

function viewFor(
  state: RevealChessGameState,
  key: RevealChessPostgameViewKey,
): RevealChessPlayerView {
  if (key === 'truth') return revealChessTruthView(state);
  return getRevealChessPlayerView(state, key as RevealChessColor);
}

function postgameFixture(): RevealChessPostgameResponse {
  const initial = createInitialRevealChessState('rc_postgame');
  // e2->e3 (a face-down pawn by origin role) is a legal opening move; it reveals.
  const moved = applyRevealChessMove(initial, { from: 'e2', to: 'e3' });
  const status = {
    type: 'finished' as const,
    winner: 'white' as const,
    reason: 'resignation' as const,
  };
  const finished: RevealChessGameState = { ...moved, status };
  return {
    game: {
      roomId: 'rc_postgame',
      variant: 'reveal-chess',
      mode: 'pvp',
      result: 'white-wins',
      termination: 'resignation',
      plyCount: 1,
      startedAt: '2026-06-16T12:00:00.000Z',
      endedAt: '2026-06-16T12:05:00.000Z',
      rated: false,
      visibility: 'private',
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

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}
