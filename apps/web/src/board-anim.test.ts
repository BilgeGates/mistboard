import { describe, expect, it } from 'vitest';
import type { Board, Move, PlayerView } from '@mistboard/game';
import { intermediateBoard } from './board-anim.js';

function makeView(board: Board, overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    id: 'test',
    variant: 'fog-of-war',
    board,
    visibleSquares: Object.keys(board) as PlayerView['visibleSquares'],
    legalMoves: [],
    status: { type: 'playing', turn: 'white' },
    perspective: 'white',
    moveNumber: 1,
    ...overrides,
  };
}

describe('intermediateBoard', () => {
  it('Qxe1 phantom-move scenario: h2 stays gone, e4 stays present, queen restored to source', () => {
    // Observer's pre-move view: white pawn on h2 visible, e4 fogged (no piece
    // visible there), white queen at e1 about to be captured, black queen at
    // some square that's about to move.
    const prevBoard: Board = {
      h2: { color: 'white', role: 'pawn' },
      e1: { color: 'white', role: 'rook' },
      a4: { color: 'black', role: 'queen' },
    };

    // Observer's post-move view: h2 is fogged (no white pawn visible), e4
    // is now visible (revealing the white pawn that was always there),
    // black queen moved to e1 capturing the rook.
    const newBoard: Board = {
      e4: { color: 'white', role: 'pawn' },
      e1: { color: 'black', role: 'queen' },
    };

    const lastMove: Move = { from: 'a4', to: 'e1' };
    const result = intermediateBoard(makeView(prevBoard), makeView(newBoard), lastMove);

    // The intermediate board chessground sees BEFORE the animated phase:
    //   - Queen restored to its source square a4 (so Phase B can animate it).
    //   - Captured rook restored to e1 (so it can fade during Phase B).
    //   - e4 still has the white pawn (fog-revealed; no animation pairing).
    //   - h2 still has no white pawn (fog-concealed; no animation pairing).
    expect(result.a4).toEqual({ color: 'black', role: 'queen' });
    expect(result.e1).toEqual({ color: 'white', role: 'rook' });
    expect(result.e4).toEqual({ color: 'white', role: 'pawn' });
    expect(result.h2).toBeUndefined();
  });

  it('normal capture: target square holds the captured piece, mover restored to source', () => {
    const prevBoard: Board = {
      d4: { color: 'white', role: 'knight' },
      e6: { color: 'black', role: 'pawn' },
    };
    const newBoard: Board = {
      e6: { color: 'white', role: 'knight' },
    };
    const result = intermediateBoard(
      makeView(prevBoard),
      makeView(newBoard),
      { from: 'd4', to: 'e6' },
    );
    expect(result.d4).toEqual({ color: 'white', role: 'knight' });
    expect(result.e6).toEqual({ color: 'black', role: 'pawn' });
  });

  it('quiet move: target square is empty, mover restored to source', () => {
    const prevBoard: Board = { g1: { color: 'white', role: 'knight' } };
    const newBoard: Board = { f3: { color: 'white', role: 'knight' } };
    const result = intermediateBoard(
      makeView(prevBoard),
      makeView(newBoard),
      { from: 'g1', to: 'f3' },
    );
    expect(result.g1).toEqual({ color: 'white', role: 'knight' });
    expect(result.f3).toBeUndefined();
  });

  it('castling (chess960 convention): both king and rook restored, destinations cleared', () => {
    // lastMove.from = king's square, lastMove.to = rook's square.
    const prevBoard: Board = {
      e1: { color: 'white', role: 'king' },
      h1: { color: 'white', role: 'rook' },
    };
    const newBoard: Board = {
      g1: { color: 'white', role: 'king' },
      f1: { color: 'white', role: 'rook' },
    };
    const result = intermediateBoard(
      makeView(prevBoard),
      makeView(newBoard),
      { from: 'e1', to: 'h1' },
    );
    expect(result.e1).toEqual({ color: 'white', role: 'king' });
    expect(result.h1).toEqual({ color: 'white', role: 'rook' });
    expect(result.g1).toBeUndefined();
    expect(result.f1).toBeUndefined();
  });

  it('en passant: captured pawn restored at the EP square', () => {
    // White e5 captures black d5 en passant, ending up on d6.
    const prevBoard: Board = {
      e5: { color: 'white', role: 'pawn' },
      d5: { color: 'black', role: 'pawn' },
    };
    const newBoard: Board = {
      d6: { color: 'white', role: 'pawn' },
    };
    const result = intermediateBoard(
      makeView(prevBoard),
      makeView(newBoard),
      { from: 'e5', to: 'd6' },
    );
    expect(result.e5).toEqual({ color: 'white', role: 'pawn' });
    expect(result.d6).toBeUndefined();
    expect(result.d5).toEqual({ color: 'black', role: 'pawn' });
  });

  it('promotion: source has the pre-promotion pawn, destination empty (queen appears in Phase B)', () => {
    // Phase A has pawn-at-from and empty-at-to. Phase B (view.board) has
    // queen-at-to. Chessground's diff: pawn missing (fades), queen new
    // (appears) — different roles, no false pairing.
    const prevBoard: Board = {
      e7: { color: 'white', role: 'pawn' },
    };
    const newBoard: Board = {
      e8: { color: 'white', role: 'queen' },
    };
    const result = intermediateBoard(
      makeView(prevBoard),
      makeView(newBoard),
      { from: 'e7', to: 'e8', promotion: 'queen' },
    );
    expect(result.e7).toEqual({ color: 'white', role: 'pawn' });
    expect(result.e8).toBeUndefined();
  });

  it('move emerging from fog: falls back to view.board[to] for the moved piece identity', () => {
    // Observer never saw the piece at the source square. We still place a
    // piece there in Phase A so Phase B can animate it sliding out of fog.
    const prevBoard: Board = {};
    const newBoard: Board = {
      e4: { color: 'black', role: 'queen' },
    };
    const result = intermediateBoard(
      makeView(prevBoard),
      makeView(newBoard),
      { from: 'a4', to: 'e4' },
    );
    expect(result.a4).toEqual({ color: 'black', role: 'queen' });
    expect(result.e4).toBeUndefined();
  });

  it('unknown move (neither from nor to visible): degenerates to view.board (snap, no animation)', () => {
    const prevBoard: Board = {};
    const newBoard: Board = {
      f5: { color: 'white', role: 'pawn' },
    };
    const result = intermediateBoard(
      makeView(prevBoard),
      makeView(newBoard),
      { from: 'a1', to: 'a8' },
    );
    expect(result).toEqual(newBoard);
  });
});
