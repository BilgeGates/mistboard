import type { RevealChessGameStatus, RevealChessMove, RevealChessSquare } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import {
  classifyRevealChessOpponentSound,
  soundForOwnRevealChessMove,
} from './live-reveal-chess-sound.js';

type Role = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';
type Entry =
  | { color: 'white' | 'black'; role: Role; faceDown: false }
  | { color: 'white' | 'black'; faceDown: true };
type View = {
  board: Partial<Record<RevealChessSquare, Entry>>;
  perspective: 'white' | 'black';
  status: RevealChessGameStatus;
  moveNumber: number;
  lastMove?: RevealChessMove;
};

function view(opts: {
  board?: View['board'];
  perspective?: 'white' | 'black';
  status?: RevealChessGameStatus;
  lastMove?: RevealChessMove;
}): View {
  return {
    board: opts.board ?? {},
    perspective: opts.perspective ?? 'white',
    status: opts.status ?? { type: 'playing', turn: 'white' },
    moveNumber: 1,
    lastMove: opts.lastMove,
  };
}

const whitePawn = { color: 'white', role: 'pawn', faceDown: false } as const;
const whiteFaceDown = { color: 'white', faceDown: true } as const;
const blackKnight = { color: 'black', role: 'knight', faceDown: false } as const;
const blackKing = { color: 'black', role: 'king', faceDown: false } as const;
const blackFaceDown = { color: 'black', faceDown: true } as const;

describe('soundForOwnRevealChessMove', () => {
  it('plays flip when moving one of your own face-down pieces (it reveals)', () => {
    const v = view({ board: { a1: whiteFaceDown } });
    expect(soundForOwnRevealChessMove(v, { from: 'a1', to: 'a2' })).toBe('flip');
  });

  it('plays move with a revealed piece onto an empty square', () => {
    const v = view({ board: { a1: whitePawn } });
    expect(soundForOwnRevealChessMove(v, { from: 'a1', to: 'a2' })).toBe('move');
  });

  it('plays capture onto a revealed enemy', () => {
    const v = view({ board: { a1: whitePawn, a2: blackKnight } });
    expect(soundForOwnRevealChessMove(v, { from: 'a1', to: 'a2' })).toBe('capture');
  });

  it('plays king-capture onto the (face-up) enemy king', () => {
    const v = view({ board: { a1: whitePawn, a2: blackKing } });
    expect(soundForOwnRevealChessMove(v, { from: 'a1', to: 'a2' })).toBe('king-capture');
  });
});

describe('classifyRevealChessOpponentSound', () => {
  const afterOpponent = { type: 'playing', turn: 'white' } as const;
  const opponentToMove = { type: 'playing', turn: 'black' } as const;

  it('plays flip when the opponent moves a face-down piece (a public reveal)', () => {
    const prev = view({ board: { a1: whitePawn, e5: blackFaceDown }, status: opponentToMove });
    const next = view({
      board: { a1: whitePawn, e6: blackKnight },
      status: afterOpponent,
      lastMove: { from: 'e5', to: 'e6' },
    });
    expect(classifyRevealChessOpponentSound(prev, next, 'white')).toBe('flip');
  });

  it('plays captured when the opponent takes our revealed piece', () => {
    const prev = view({ board: { a1: whitePawn, e5: blackKnight }, status: opponentToMove });
    const next = view({
      board: { a1: blackKnight },
      status: afterOpponent,
      lastMove: { from: 'e5', to: 'a1' },
    });
    expect(classifyRevealChessOpponentSound(prev, next, 'white')).toBe('captured');
  });

  // Leak guard: capturing our FACE-DOWN piece reveals its identity only to the
  // capturer, so to us it is a plain `captured`, never a flip.
  it('plays captured (not flip) when the opponent captures our FACE-DOWN piece', () => {
    const prev = view({ board: { a1: whiteFaceDown, e5: blackKnight }, status: opponentToMove });
    const next = view({
      board: { a1: blackKnight },
      status: afterOpponent,
      lastMove: { from: 'e5', to: 'a1' },
    });
    expect(classifyRevealChessOpponentSound(prev, next, 'white')).toBe('captured');
  });

  it('returns null for our own move', () => {
    const prev = view({ status: { type: 'playing', turn: 'white' } });
    const next = view({ status: { type: 'playing', turn: 'black' } });
    expect(classifyRevealChessOpponentSound(prev, next, 'white')).toBeNull();
  });

  it('returns null for spectators', () => {
    const prev = view({ status: opponentToMove });
    const next = view({ status: afterOpponent });
    expect(classifyRevealChessOpponentSound(prev, next, 'spectator')).toBeNull();
  });
});
