import {
  type CrossroadsChessBoard,
  type CrossroadsChessColor,
  type CrossroadsChessMove,
  type CrossroadsChessPlayerBoard,
  type CrossroadsChessPlayerView,
  type CrossroadsChessSquare,
  createInitialCrossroadsChessBoard,
} from '@mistboard/game';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type CrossroadsChessPostgameResponse,
  createCrossroadsPlayAgainRoom,
  crossroadsChessInitialPlyFromSearch,
  crossroadsChessPostgameApiUrl,
  mountCrossroadsChessPostgame,
} from './crossroads-chess-postgame.js';

describe('Crossroads Chess postgame page', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_CROSSROADS_CHESS_ENABLED', 'true');
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('builds the public postgame API URL', () => {
    expect(crossroadsChessPostgameApiUrl('dchess room')).toBe(
      '/api/crossroads-chess/games/dchess%20room',
    );
  });

  it('parses initial replay ply links', () => {
    expect(crossroadsChessInitialPlyFromSearch('?ply=0')).toBe(0);
    expect(crossroadsChessInitialPlyFromSearch('?ply=12')).toBe(12);
    expect(crossroadsChessInitialPlyFromSearch('?ply=-1')).toBeNull();
    expect(crossroadsChessInitialPlyFromSearch('?ply=1.5')).toBeNull();
    expect(crossroadsChessInitialPlyFromSearch('?move=1')).toBeNull();
  });

  it('renders the review board with move scrubbing and flip control', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(postgameFixture()));
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');

    mountCrossroadsChessPostgame(root, 'dchess_postgame');
    await flushPromises();

    expect(fetchSpy).toHaveBeenCalledWith('/api/crossroads-chess/games/dchess_postgame');
    expect(root.textContent).toContain('Crossroads Chess');
    expect(root.textContent).toContain('White wins');
    expect(root.textContent).toContain('Full board');
    expect(root.textContent).toContain('Play again');
    expect(root.textContent).toContain('Guest');
    expect(root.textContent).toContain('3:00+2');
    expect(root.textContent).toContain('Casual');
    const download = root.querySelector<HTMLAnchorElement>(
      'a[href="/api/crossroads-chess/games/dchess_postgame/export.json"]',
    );
    expect(download?.textContent).toBe('Download JSON');
    expect(download?.getAttribute('download')).toBe('mistboard-dchess_postgame.json');
    expect(root.querySelector('.move-row')?.textContent?.replace(/\s+/g, '')).toBe('1a2-a3');
    expect(root.textContent).toContain('ply 1 of 1');
    expect(root.querySelectorAll('.crossroads-live-svg')).toHaveLength(1);

    root.querySelector<HTMLButtonElement>('[aria-label="Flip board"]')?.click();
    expect(root.querySelectorAll('.crossroads-live-svg')).toHaveLength(1);
    root.querySelector<HTMLButtonElement>('[aria-label="Previous move"]')?.click();
    expect(root.textContent).toContain('ply 0 of 1');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(root.textContent).toContain('ply 1 of 1');
  });

  it('opens the review page at the ply from the query string and keeps controls linkable', async () => {
    window.history.replaceState(null, '', '/crossroads-chess/game/dchess_postgame?ply=0');
    const fetchSpy = vi.fn(async () => jsonResponse(postgameFixture()));
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');

    mountCrossroadsChessPostgame(root, 'dchess_postgame');
    await flushPromises();

    expect(root.textContent).toContain('ply 0 of 1');
    root.querySelector<HTMLButtonElement>('[aria-label="Next move"]')?.click();
    expect(root.textContent).toContain('ply 1 of 1');
    expect(window.location.search).toBe('');
    root.querySelector<HTMLButtonElement>('[aria-label="Previous move"]')?.click();
    expect(window.location.search).toBe('?ply=0');
  });

  it('renders red wins with Crossroads copy instead of black-side copy', async () => {
    const fixture = postgameFixture();
    fixture.game.result = 'red-wins';
    fixture.state.status = {
      type: 'finished',
      winner: 'red',
      reason: 'resignation',
    };
    const fetchSpy = vi.fn(async () => jsonResponse(fixture));
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');

    mountCrossroadsChessPostgame(root, 'dchess_red_win');
    await flushPromises();

    expect(root.textContent).toContain('Red wins');
    expect(root.querySelector('.replay-game-header-result-red')?.textContent).toBe('Red wins');
    expect(root.textContent).not.toContain('Black wins');
  });

  it('creates a new live Crossroads room from the review time control', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ url: '/room/dchess_next' }));
    vi.stubGlobal('fetch', fetchSpy);
    const fixture = postgameFixture();
    fixture.game.timeControl = { initialMs: 300_000, incrementMs: 5_000 };

    await expect(createCrossroadsPlayAgainRoom(fixture)).resolves.toBe('/room/dchess_next');

    expect(fetchSpy).toHaveBeenCalledWith('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'pvp',
        gameSpecId: 'crossroads-chess',
        timeControl: { initialMs: 300_000, incrementMs: 5_000 },
        rated: false,
        preferredColor: 'random',
      }),
    });
  });

  it('creates a new live Crossroads room with 5+5 when the review has no time control', async () => {
    const fetchSpy = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ url: '/room/dchess_next' }),
    );
    vi.stubGlobal('fetch', fetchSpy);
    const fixture = postgameFixture();
    delete fixture.game.timeControl;
    delete fixture.state.timeControl;

    await expect(createCrossroadsPlayAgainRoom(fixture)).resolves.toBe('/room/dchess_next');

    const request = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
    expect(request.timeControl).toEqual({ initialMs: 300_000, incrementMs: 5_000 });
  });
});

function postgameFixture(): CrossroadsChessPostgameResponse {
  const initial = createInitialCrossroadsChessBoard();
  const moved = movePiece(initial, 'a2', 'a3');
  const move: CrossroadsChessMove = { from: 'a2', to: 'a3' };
  const status = {
    type: 'finished' as const,
    winner: 'white' as const,
    reason: 'resignation' as const,
  };
  return {
    game: {
      roomId: 'dchess_postgame',
      variant: 'crossroads-chess',
      mode: 'pvp',
      result: 'white-wins',
      termination: 'resignation',
      plyCount: 1,
      startedAt: '2026-06-09T12:00:00.000Z',
      endedAt: '2026-06-09T12:05:00.000Z',
      rated: false,
      visibility: 'private',
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
    },
    state: {
      status,
      moveNumber: 1,
      progressClock: 0,
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
    },
    timeline: [
      { type: 'move-played', at: 2, color: 'white', move, ply: 1 },
      { type: 'seat-resigned', at: 3, color: 'red', winner: 'white' },
    ],
    view: openView('dchess_truth', 'white', moved, move, status),
    views: {
      white: openView('dchess_white', 'white', moved, move, status),
      truth: openView('dchess_truth_v', 'white', moved, move, status),
      red: openView('dchess_red', 'red', moved, move, status),
    },
    history: {
      white: [
        { ply: 0, view: openView('dchess_white_0', 'white', initial, undefined, status) },
        { ply: 1, view: openView('dchess_white_1', 'white', moved, move, status) },
      ],
      red: [
        { ply: 0, view: openView('dchess_red_0', 'red', initial, undefined, status) },
        { ply: 1, view: openView('dchess_red_1', 'red', moved, move, status) },
      ],
    },
  };
}

function movePiece(
  board: CrossroadsChessBoard,
  from: CrossroadsChessSquare,
  to: CrossroadsChessSquare,
): CrossroadsChessBoard {
  const next = { ...board };
  next[to] = next[from];
  delete next[from];
  return next;
}

function openView(
  id: string,
  perspective: CrossroadsChessColor,
  board: CrossroadsChessBoard,
  lastMove: CrossroadsChessMove | undefined,
  status: CrossroadsChessPlayerView['status'],
): CrossroadsChessPlayerView {
  return {
    id,
    perspective,
    board: Object.fromEntries(
      Object.entries(board).map(([square, piece]) => [square, { piece, shrouded: false }]),
    ) as CrossroadsChessPlayerBoard,
    visibleSquares: Object.keys(board) as CrossroadsChessSquare[],
    legalMoves: [],
    status,
    moveNumber: 1,
    ...(lastMove ? { lastMove } : {}),
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
