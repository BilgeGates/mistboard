import type { JieqiColor, JieqiMove, JieqiPlayerBoard, JieqiPlayerView } from '@mistboard/game';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JieqiPostgameResponse } from './live-jieqi-postgame.js';
import { mountJieqiWatchReplay } from './watch-jieqi-replay.js';

describe('Jieqi watch replay', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mounts a Jieqi TV replay with boards, seats, and controls', async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const roomId = String(input).split('/').pop() ?? 'jq_watch';
      return jsonResponse(postgameFixture(roomId));
    });
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');

    const handle = await mountJieqiWatchReplay(root, 'jq_watch', { autoplay: false });

    expect(fetchSpy).toHaveBeenCalledWith('/api/jieqi/games/jq_watch');
    expect(handle.activeSampleId()).toBe('jq_watch');
    expect(root.textContent).toContain('Human vs human');
    expect(root.textContent).toContain('Red wins');
    expect(root.textContent).toContain('by Resignation');
    expect(root.textContent).toContain('1 plies');
    expect(root.textContent).toContain('Casual');
    expect(root.textContent).toContain('Red');
    expect(root.textContent).toContain('Black');
    expect(root.textContent).toContain('Ply 0 / 1');
    // Three panes (red view, truth, black view) each render a jieqi board.
    expect(root.querySelectorAll('.jieqi-board')).toHaveLength(3);

    root.querySelector<HTMLButtonElement>('[aria-label="Next move"]')?.click();
    expect(root.textContent).toContain('Ply 1 / 1 — Red wins');

    root.querySelector<HTMLButtonElement>('[aria-label="Flip boards"]')?.click();
    expect(root.querySelectorAll('.jieqi-board')).toHaveLength(3);

    await handle.loadGame('jq_next');
    expect(fetchSpy).toHaveBeenCalledWith('/api/jieqi/games/jq_next');
    expect(handle.activeSampleId()).toBe('jq_next');

    handle.destroy();
    expect(root.childElementCount).toBe(0);
  });
});

// A minimal two-position fixture: a face-down red soldier home rank plus the
// red general, with one ply moving the soldier forward. Per-color views reuse
// the same boards (the truth view reveals identities; this fixture keeps it
// simple by sharing the open boards across keys).
function postgameFixture(roomId: string): JieqiPostgameResponse {
  const startBoard: JieqiPlayerBoard = {
    e1: { color: 'red', role: 'general', faceDown: false },
    a4: { color: 'red', faceDown: true },
    e10: { color: 'black', role: 'general', faceDown: false },
  };
  const movedBoard: JieqiPlayerBoard = {
    e1: { color: 'red', role: 'general', faceDown: false },
    a5: { color: 'red', faceDown: true },
    e10: { color: 'black', role: 'general', faceDown: false },
  };
  const move: JieqiMove = { from: 'a4', to: 'a5' };
  const finished = {
    type: 'finished' as const,
    winner: 'red' as const,
    reason: 'resignation' as const,
  };
  const playingRed = { type: 'playing' as const, turn: 'red' as const };
  const playingBlack = { type: 'playing' as const, turn: 'black' as const };

  return {
    game: {
      roomId,
      variant: 'jieqi',
      mode: 'pvp',
      result: 'red-wins',
      termination: 'resignation',
      plyCount: 1,
      startedAt: '2026-06-13T12:00:00.000Z',
      endedAt: '2026-06-13T12:05:00.000Z',
      rated: false,
      visibility: 'public',
      initialMs: 180_000,
      incrementMs: 2_000,
    },
    state: {
      status: finished,
      moveNumber: 1,
      timeControl: { initialMs: 180_000, incrementMs: 2_000 },
    },
    timeline: [
      { type: 'move-played', at: 2, color: 'red', move, ply: 1 },
      { type: 'seat-resigned', at: 3, color: 'black', winner: 'red' },
    ],
    view: view('red', movedBoard, move, finished),
    views: {
      red: view('red', movedBoard, move, finished),
      truth: view('red', movedBoard, move, finished),
      black: view('black', movedBoard, move, finished),
    },
    history: {
      red: [
        { ply: 0, view: view('red', startBoard, undefined, playingRed) },
        { ply: 1, view: view('red', movedBoard, move, playingBlack) },
      ],
      truth: [
        { ply: 0, view: view('red', startBoard, undefined, playingRed) },
        { ply: 1, view: view('red', movedBoard, move, playingBlack) },
      ],
      black: [
        { ply: 0, view: view('black', startBoard, undefined, playingRed) },
        { ply: 1, view: view('black', movedBoard, move, playingBlack) },
      ],
    },
  };
}

function view(
  perspective: JieqiColor,
  board: JieqiPlayerBoard,
  lastMove: JieqiMove | undefined,
  status: JieqiPlayerView['status'],
): JieqiPlayerView {
  return {
    id: `${perspective}-${Object.keys(board).join('')}`,
    perspective,
    board,
    legalMoves: [],
    captured: [],
    inCheck: false,
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
