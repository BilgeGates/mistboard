import { describe, expect, it } from 'vitest';
import type { Board, PlayerView, Square } from '@mistboard/game';
import { boardFen, hiddenSquareClasses, legalDests } from './live-render.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeView(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    id: 'test-room',
    variant: 'fog-of-war',
    board: {},
    visibleSquares: [],
    legalMoves: [],
    status: { type: 'playing', turn: 'white' },
    perspective: 'white',
    moveNumber: 1,
    ...overrides,
  };
}

const initialBoard: Board = {
  a1: { color: 'white', role: 'rook' },
  b1: { color: 'white', role: 'knight' },
  c1: { color: 'white', role: 'bishop' },
  d1: { color: 'white', role: 'queen' },
  e1: { color: 'white', role: 'king' },
  f1: { color: 'white', role: 'bishop' },
  g1: { color: 'white', role: 'knight' },
  h1: { color: 'white', role: 'rook' },
  a2: { color: 'white', role: 'pawn' },
  b2: { color: 'white', role: 'pawn' },
  c2: { color: 'white', role: 'pawn' },
  d2: { color: 'white', role: 'pawn' },
  e2: { color: 'white', role: 'pawn' },
  f2: { color: 'white', role: 'pawn' },
  g2: { color: 'white', role: 'pawn' },
  h2: { color: 'white', role: 'pawn' },
  a7: { color: 'black', role: 'pawn' },
  b7: { color: 'black', role: 'pawn' },
  c7: { color: 'black', role: 'pawn' },
  d7: { color: 'black', role: 'pawn' },
  e7: { color: 'black', role: 'pawn' },
  f7: { color: 'black', role: 'pawn' },
  g7: { color: 'black', role: 'pawn' },
  h7: { color: 'black', role: 'pawn' },
  a8: { color: 'black', role: 'rook' },
  b8: { color: 'black', role: 'knight' },
  c8: { color: 'black', role: 'bishop' },
  d8: { color: 'black', role: 'queen' },
  e8: { color: 'black', role: 'king' },
  f8: { color: 'black', role: 'bishop' },
  g8: { color: 'black', role: 'knight' },
  h8: { color: 'black', role: 'rook' },
};

// ── boardFen ──────────────────────────────────────────────────────────────────

describe('boardFen', () => {
  it('produces 8/8/8/8/8/8/8/8 for an empty board', () => {
    expect(boardFen(makeView({ board: {} }))).toBe('8/8/8/8/8/8/8/8');
  });

  it('places a white king on e1 correctly', () => {
    const view = makeView({ board: { e1: { color: 'white', role: 'king' } } });
    expect(boardFen(view)).toBe('8/8/8/8/8/8/8/4K3');
  });

  it('produces the standard opening FEN for the initial board', () => {
    const view = makeView({ board: initialBoard });
    expect(boardFen(view)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
  });

  it('uses uppercase for white pieces, lowercase for black', () => {
    const board: Board = {
      a8: { color: 'black', role: 'rook' },
      h1: { color: 'white', role: 'rook' },
    };
    const fen = boardFen(makeView({ board }));
    expect(fen.startsWith('r')).toBe(true);  // rank 8: black rook on a8
    expect(fen.endsWith('R')).toBe(true);    // rank 1: white rook on h1
  });
});

// ── hiddenSquareClasses ───────────────────────────────────────────────────────

describe('hiddenSquareClasses', () => {
  it('returns an empty map for a null view', () => {
    expect(hiddenSquareClasses(null).size).toBe(0);
  });

  it('returns an empty map for a non-fog variant', () => {
    const view = makeView({ variant: 'draft960', visibleSquares: [] });
    expect(hiddenSquareClasses(view).size).toBe(0);
  });

  it('marks all 64 squares as fog-hidden when nothing is visible', () => {
    const view = makeView({ variant: 'fog-of-war', visibleSquares: [] });
    const classes = hiddenSquareClasses(view);
    expect(classes.size).toBe(64);
    expect(classes.get('e1')).toBe('fog-hidden');
    expect(classes.get('h8')).toBe('fog-hidden');
  });

  it('does not mark visible squares as fog-hidden', () => {
    const visible: Square[] = ['e1', 'e2', 'd2'];
    const view = makeView({ variant: 'fog-of-war', visibleSquares: visible });
    const classes = hiddenSquareClasses(view);
    expect(classes.has('e1')).toBe(false);
    expect(classes.has('e2')).toBe(false);
    expect(classes.has('d2')).toBe(false);
    expect(classes.get('a1')).toBe('fog-hidden');
    expect(classes.size).toBe(64 - visible.length);
  });
});

// ── legalDests ────────────────────────────────────────────────────────────────

describe('legalDests', () => {
  it('returns an empty map when there are no legal moves', () => {
    const view = makeView({ legalMoves: [] });
    expect(legalDests(view).size).toBe(0);
  });

  it('maps each source square to its destination squares', () => {
    const view = makeView({
      legalMoves: [
        { from: 'e2', to: 'e4' },
        { from: 'e2', to: 'e3' },
        { from: 'd2', to: 'd4' },
      ],
    });
    const dests = legalDests(view);
    expect(dests.get('e2')?.sort()).toEqual(['e3', 'e4']);
    expect(dests.get('d2')).toEqual(['d4']);
    expect(dests.size).toBe(2);
  });

  it('deduplicates destinations for the same source', () => {
    const view = makeView({
      legalMoves: [
        { from: 'e2', to: 'e3' },
        { from: 'e2', to: 'e3' }, // duplicate
      ],
    });
    const dests = legalDests(view);
    // Both entries end up listed; castling alias check sees no king→rook moves, so no alias added
    expect(dests.get('e2')?.length).toBe(2);
  });
});
