import type { Board, Color, PieceRole, PlayerView } from '@mistboard/game';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderCaptures } from './live-captures.js';
import { liveState } from './live-state.js';
import { currentCaptures } from './live-view.js';

vi.mock('./live-view.js', () => ({
  currentCaptures: vi.fn(),
}));

function makeView(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    id: 'test-room',
    variant: 'dark-chess',
    board: {},
    visibleSquares: [],
    legalMoves: [],
    status: { type: 'playing', turn: 'white' },
    perspective: 'white',
    moveNumber: 1,
    ...overrides,
  };
}

function materialBoard(color: Color, missing: PieceRole[] = [], extra: PieceRole[] = []): Board {
  const roles: PieceRole[] = [
    'king',
    'queen',
    'rook',
    'rook',
    'bishop',
    'bishop',
    'knight',
    'knight',
    'pawn',
    'pawn',
    'pawn',
    'pawn',
    'pawn',
    'pawn',
    'pawn',
    'pawn',
  ];
  for (const role of missing) {
    const index = roles.indexOf(role);
    if (index >= 0) roles.splice(index, 1);
  }
  roles.push(...extra);

  const squares = [
    'a1',
    'b1',
    'c1',
    'd1',
    'e1',
    'f1',
    'g1',
    'h1',
    'a2',
    'b2',
    'c2',
    'd2',
    'e2',
    'f2',
    'g2',
    'h2',
  ];
  return Object.fromEntries(
    roles.map((role, index) => [squares[index], { color, role }]),
  ) as Board;
}

function makeRefs() {
  return {
    capturesBottom: document.createElement('div'),
    capturesTop: document.createElement('div'),
  };
}

function captureLabels(strip: HTMLDivElement): string[] {
  return [...strip.querySelectorAll('.captures-piece')].map(
    (piece) => piece.getAttribute('aria-label') ?? '',
  );
}

afterEach(() => {
  vi.clearAllMocks();
  liveState.seat = 'spectator';
});

describe('renderCaptures', () => {
  it('puts seated player captures on the seated player side', () => {
    const refs = makeRefs();
    liveState.seat = 'black';
    vi.mocked(currentCaptures).mockReturnValue({
      black: ['pawn'],
      white: [],
    });

    renderCaptures(refs, makeView({ board: materialBoard('black', ['pawn']), perspective: 'black' }));

    expect(captureLabels(refs.capturesTop)).toEqual(['black pawn']);
    expect(captureLabels(refs.capturesBottom)).toEqual(['white pawn']);
  });

  it('does not count a promoted pawn still on the board as captured', () => {
    const refs = makeRefs();
    liveState.seat = 'black';
    vi.mocked(currentCaptures).mockReturnValue({
      black: [],
      white: [],
    });

    renderCaptures(
      refs,
      makeView({ board: materialBoard('black', ['pawn'], ['queen']), perspective: 'black' }),
    );

    expect(captureLabels(refs.capturesTop)).toEqual([]);
  });

  it('uses the view perspective for spectator capture sides', () => {
    const refs = makeRefs();
    vi.mocked(currentCaptures).mockReturnValue({
      black: ['knight'],
      white: ['bishop'],
    });

    renderCaptures(refs, makeView({ perspective: 'white' }));

    expect(captureLabels(refs.capturesTop)).toEqual(['white knight']);
    expect(captureLabels(refs.capturesBottom)).toEqual(['black bishop']);
  });
});
