import {
  createInitialMiniXiangqiBoard,
  type MiniXiangqiBoard,
  type MiniXiangqiSquare,
} from '@mistboard/game';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  darkMiniXiangqiPostgameApiUrl,
  mountDarkMiniXiangqiPostgame,
} from './dark-mini-xiangqi-postgame.js';

describe('Dark Mini Xiangqi postgame page', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DARK_MINI_XIANGQI_ENABLED', 'true');
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('builds the public postgame API URL', () => {
    expect(darkMiniXiangqiPostgameApiUrl('dmxq room')).toBe(
      '/api/dark-mini-xiangqi/games/dmxq%20room',
    );
  });

  it('renders the review triptych with server truth, fogged seats, and all moves', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(postgameFixture()));
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');

    mountDarkMiniXiangqiPostgame(root, 'dmxq_postgame');
    await flushPromises();

    expect(fetchSpy).toHaveBeenCalledWith('/api/dark-mini-xiangqi/games/dmxq_postgame');
    expect(root.textContent).toContain('Dark Mini Xiangqi');
    expect(root.textContent).toContain('Red wins');
    expect(root.textContent).toContain('Red view');
    expect(root.textContent).toContain('Server truth');
    expect(root.textContent).toContain('Black view');
    expect(root.textContent).toContain('Play again');
    expect(root.textContent).toContain('Guest');
    const download = root.querySelector<HTMLAnchorElement>(
      'a[href="/api/dark-mini-xiangqi/games/dmxq_postgame/export.json"]',
    );
    expect(download?.textContent).toBe('Download JSON');
    expect(download?.getAttribute('download')).toBe('mistboard-dmxq_postgame.json');
    expect(root.textContent).toContain('Untimed');
    expect(root.textContent).toContain('Rated');
    expect(root.querySelectorAll('[aria-label="black general"]').length).toBeGreaterThan(0);
    // Moves are grouped two plies per row, dark-chess style: number + red + black.
    expect(root.querySelector('.move-row')?.textContent?.replace(/\s+/g, '')).toBe('1b1-b2b7-b6');
    expect(root.textContent).toContain('ply 2 of 2');
    expect(root.querySelectorAll('.mini-xq-board')).toHaveLength(3);

    // Each board's fog <mask> needs a unique id: SVG url(#id) resolves the first
    // match document-wide, so a collision makes one board apply another's fog.
    const maskIds = [...root.querySelectorAll<SVGMaskElement>('mask[id]')].map((m) => m.id);
    expect(maskIds.length).toBeGreaterThanOrEqual(2);
    expect(new Set(maskIds).size).toBe(maskIds.length);

    // Fog-safety: a seat view shrouds the opponent; the truth board reveals all.
    expect(root.innerHTML).toContain('aria-label="black hidden piece"');
    expect(boardWrap(root, 'Server truth').querySelector('.mini-xq-fog-mask')).toBeNull();
    expect(boardWrap(root, 'Server truth').innerHTML).not.toContain('hidden piece');

    // Flip re-renders all boards; scrubbing back steps the ply counter.
    root.querySelector<HTMLButtonElement>('[aria-label="Flip all boards"]')?.click();
    expect(root.querySelectorAll('.mini-xq-board')).toHaveLength(3);
    root.querySelector<HTMLButtonElement>('[aria-label="Previous move"]')?.click();
    expect(root.textContent).toContain('ply 1 of 2');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(root.textContent).toContain('ply 0 of 2');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(root.textContent).toContain('ply 2 of 2');
  });
});

function boardWrap(root: HTMLElement, label: string): HTMLElement {
  const wrap = [...root.querySelectorAll<HTMLElement>('.replay-pane')].find((el) =>
    el.textContent?.includes(label),
  );
  if (!wrap) throw new Error(`Missing board wrap: ${label}`);
  return wrap;
}

function postgameFixture() {
  const initial = createInitialMiniXiangqiBoard();
  const redMoved = movePiece(initial, 'b1', 'b2');
  const finalBoard = movePiece(redMoved, 'b7', 'b6');
  delete finalBoard.d7;
  return {
    game: {
      roomId: 'dmxq_postgame',
      variant: 'dark-mini-xiangqi',
      mode: 'pvp',
      result: 'red-wins',
      termination: 'general-captured',
      plyCount: 2,
      startedAt: '2026-05-30T12:00:00.000Z',
      endedAt: '2026-05-30T12:05:00.000Z',
      rated: true,
      visibility: 'private',
    },
    state: {
      status: { type: 'finished', winner: 'red', reason: 'general-captured' },
      moveNumber: 2,
    },
    timeline: [
      { type: 'move-played', at: 2, color: 'red', move: { from: 'b1', to: 'b2' }, ply: 1 },
      { type: 'move-played', at: 3, color: 'black', move: { from: 'b7', to: 'b6' }, ply: 2 },
      { type: 'seat-resigned', at: 4, color: 'black', winner: 'red' },
    ],
    view: truthView('dmxq_truth', truthBoardEntries(finalBoard)),
    views: {
      red: {
        id: 'dmxq_red',
        perspective: 'red',
        board: {
          b2: { piece: { color: 'red', role: 'cannon' }, shrouded: false },
          b7: { color: 'black', shrouded: true },
        },
        visibleSquares: ['b2', 'b7'],
        legalMoves: [],
        status: { type: 'finished', winner: 'red', reason: 'resignation' },
        moveNumber: 2,
      },
      truth: truthView('dmxq_truth_v', truthBoardEntries(finalBoard)),
      black: {
        id: 'dmxq_black',
        perspective: 'black',
        board: {
          b2: { color: 'red', shrouded: true },
          b6: { piece: { color: 'black', role: 'cannon' }, shrouded: false },
        },
        visibleSquares: ['b2', 'b6'],
        legalMoves: [],
        status: { type: 'finished', winner: 'red', reason: 'resignation' },
        moveNumber: 2,
      },
    },
    history: {
      red: [
        { ply: 1, view: seatView('dmxq_red_1', 'red', { b2: redCannon(), b7: blackShroud() }) },
        { ply: 2, view: seatView('dmxq_red_2', 'red', { b2: redCannon(), b6: blackShroud() }) },
      ],
      truth: [
        { ply: 0, view: truthView('dmxq_truth_0', truthBoardEntries(initial)) },
        { ply: 1, view: truthView('dmxq_truth_1', truthBoardEntries(redMoved)) },
        { ply: 2, view: truthView('dmxq_truth_2', truthBoardEntries(finalBoard)) },
      ],
      black: [
        { ply: 1, view: seatView('dmxq_black_1', 'black', { b2: redShroud(), b7: blackCannon() }) },
        { ply: 2, view: seatView('dmxq_black_2', 'black', { b2: redShroud(), b6: blackCannon() }) },
      ],
    },
  };
}

function movePiece(
  board: MiniXiangqiBoard,
  from: MiniXiangqiSquare,
  to: MiniXiangqiSquare,
): MiniXiangqiBoard {
  const next = { ...board };
  next[to] = next[from];
  delete next[from];
  return next;
}

function truthBoardEntries(board: MiniXiangqiBoard): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(board).map(([square, piece]) => [square, { piece, shrouded: false }]),
  );
}

function redCannon() {
  return { piece: { color: 'red', role: 'cannon' }, shrouded: false };
}
function blackCannon() {
  return { piece: { color: 'black', role: 'cannon' }, shrouded: false };
}
function redShroud() {
  return { color: 'red', shrouded: true };
}
function blackShroud() {
  return { color: 'black', shrouded: true };
}

function seatView(id: string, perspective: 'red' | 'black', board: Record<string, unknown>) {
  return {
    id,
    perspective,
    board,
    visibleSquares: Object.keys(board),
    legalMoves: [],
    status: { type: 'finished', winner: 'red', reason: 'resignation' },
    moveNumber: 2,
  };
}

function truthView(id: string, board: Record<string, unknown>) {
  return {
    id,
    perspective: 'red',
    board,
    visibleSquares: allFixtureSquares(),
    legalMoves: [],
    status: { type: 'finished', winner: 'red', reason: 'resignation' },
    moveNumber: 2,
  };
}

function allFixtureSquares(): string[] {
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const squares: string[] = [];
  for (let rank = 1; rank <= 7; rank += 1) {
    for (const file of files) squares.push(`${file}${rank}`);
  }
  return squares;
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
