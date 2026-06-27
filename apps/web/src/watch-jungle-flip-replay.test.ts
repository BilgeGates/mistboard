import type { JungleFlipMove, JungleFlipPlayerBoard, JungleFlipPlayerView } from '@mistboard/game';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JungleFlipPostgameResponse } from './live-jungle-flip-postgame.js';
import { mountJungleFlipWatchReplay } from './watch-jungle-flip-replay.js';

describe('Flip Jungle watch replay', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mounts a Flip Jungle TV replay with one masked board, a Reveal control, and seat-ink result', async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      return jsonResponse(postgameFixture(String(input).split('/').pop() ?? 'jgf_watch'));
    });
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');

    const handle = await mountJungleFlipWatchReplay(root, 'jgf_watch', { autoplay: false });

    expect(fetchSpy).toHaveBeenCalledWith('/api/jungle-flip/games/jgf_watch');
    expect(handle.activeSampleId()).toBe('jgf_watch');
    expect(root.textContent).toContain('Human vs human');
    // Seat 'red' (first mover) bound black ink, so 'red-wins' reads "Black wins".
    expect(root.textContent).toContain('Black wins');
    expect(root.querySelectorAll('svg.jungle-flip-live-svg')).toHaveLength(1);
    // Hidden identities → a Reveal control is present.
    const reveal = [...root.querySelectorAll<HTMLButtonElement>('button')].find(
      (el) => el.textContent === 'Reveal',
    );
    expect(reveal).not.toBeUndefined();

    // At ply 0 the as-played mask paints a face-down back.
    const board = () => root.querySelector('svg.jungle-flip-live-svg') as SVGElement;
    expect(board().outerHTML).toContain('fill="#2f8f6b"');
    reveal!.click();
    // Revealed overlay: no tile painted with the back fill.
    expect(board().outerHTML).not.toContain('fill="#2f8f6b"');

    handle.destroy();
    expect(root.childElementCount).toBe(0);
  });
});

function postgameFixture(roomId: string): JungleFlipPostgameResponse {
  const move: JungleFlipMove = { from: 'a1', to: 'a1' };
  const finished = {
    type: 'finished' as const,
    winner: 'red' as const,
    reason: 'resignation' as const,
  };
  const playingBlack = { type: 'playing' as const, turn: 'black' as const };
  const maskedStart: JungleFlipPlayerBoard = { a1: { faceDown: true }, b2: { faceDown: true } };
  const revealedBoard: JungleFlipPlayerBoard = {
    a1: { color: 'black', role: 'rat', faceDown: false },
    b2: { color: 'red', role: 'elephant', faceDown: false },
  };

  return {
    game: {
      roomId,
      variant: 'jungle-flip',
      mode: 'pvp',
      result: 'red-wins',
      termination: 'resignation',
      plyCount: 1,
      startedAt: '2026-06-24T12:00:00.000Z',
      endedAt: '2026-06-24T12:05:00.000Z',
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
    // First mover ('red' seat) flipped black, so firstColor is 'black'.
    view: view(revealedBoard, move, finished, 1),
    history: {
      truth: [
        { ply: 0, view: view(maskedStart, undefined, playingBlack, 0) },
        { ply: 1, view: view(revealedBoard, move, finished, 1) },
      ],
      revealed: [
        { ply: 0, view: view(revealedBoard, undefined, playingBlack, 0) },
        { ply: 1, view: view(revealedBoard, move, finished, 1) },
      ],
    },
  };
}

function view(
  board: JungleFlipPlayerBoard,
  lastMove: JungleFlipMove | undefined,
  status: JungleFlipPlayerView['status'],
  ply: number,
): JungleFlipPlayerView {
  return {
    id: `${Object.keys(board).join('')}-${ply}`,
    perspective: 'red',
    board,
    legalMoves: [],
    captured: [],
    status,
    ply,
    firstColor: 'black',
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
