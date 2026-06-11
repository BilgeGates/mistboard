import type { CrossroadsChessPlayerView } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import {
  classifyCrossroadsChessOpponentSound,
  crossroadsChessTerminalSoundKey,
  soundForOwnCrossroadsChessMove,
} from './live-crossroads-chess-sound.js';

type Board = CrossroadsChessPlayerView['board'];

function view(opts: {
  perspective?: 'white' | 'red';
  board?: Board;
  status?: CrossroadsChessPlayerView['status'];
  moveNumber?: number;
}): CrossroadsChessPlayerView {
  return {
    id: 'crossroads-sound-test',
    perspective: opts.perspective ?? 'white',
    board: opts.board ?? {},
    visibleSquares: [],
    legalMoves: [],
    status: opts.status ?? { type: 'playing', turn: 'white' },
    moveNumber: opts.moveNumber ?? 1,
  };
}

describe('soundForOwnCrossroadsChessMove', () => {
  const fromEntry = { piece: { color: 'white', role: 'chariot' }, shrouded: false } as const;

  it('plays move onto an empty square', () => {
    const v = view({ board: { a1: fromEntry } });
    expect(soundForOwnCrossroadsChessMove(v, { from: 'a1', to: 'a2' })).toBe('move');
  });

  it('plays capture onto an opponent piece', () => {
    const v = view({
      board: { a1: fromEntry, a2: { piece: { color: 'red', role: 'soldier' }, shrouded: false } },
    });
    expect(soundForOwnCrossroadsChessMove(v, { from: 'a1', to: 'a2' })).toBe('capture');
  });

  it('plays king-capture onto an opponent king', () => {
    const v = view({
      board: { a1: fromEntry, a2: { piece: { color: 'red', role: 'king' }, shrouded: false } },
    });
    expect(soundForOwnCrossroadsChessMove(v, { from: 'a1', to: 'a2' })).toBe('king-capture');
  });

  it('does not play capture onto an own piece', () => {
    const v = view({
      board: { a1: fromEntry, a2: { piece: { color: 'white', role: 'bishop' }, shrouded: false } },
    });
    expect(soundForOwnCrossroadsChessMove(v, { from: 'a1', to: 'a2' })).toBe('move');
  });

  it('plays capture onto a shrouded target if Crossroads is later rendered under fog', () => {
    const v = view({ board: { a1: fromEntry, a2: { color: 'red', shrouded: true } } });
    expect(soundForOwnCrossroadsChessMove(v, { from: 'a1', to: 'a2' })).toBe('capture');
  });
});

describe('crossroadsChessTerminalSoundKey', () => {
  it('returns null while playing', () => {
    expect(crossroadsChessTerminalSoundKey(view({}), 'white')).toBeNull();
  });

  it('returns a win key for the winning seated player', () => {
    const v = view({
      status: { type: 'finished', winner: 'white', reason: 'race' },
      moveNumber: 12,
    });
    expect(crossroadsChessTerminalSoundKey(v, 'white')).toBe('win:12');
  });

  it('returns a lose key for the losing seated player', () => {
    const v = view({ status: { type: 'finished', winner: 'white', reason: 'king-captured' } });
    expect(crossroadsChessTerminalSoundKey(v, 'red')).toBe('lose:1');
  });

  it('returns a draw key for a finished game with no winner', () => {
    const draw = view({ status: { type: 'finished', winner: null, reason: 'repetition' } });
    expect(crossroadsChessTerminalSoundKey(draw, 'white')).toBe('draw:1');
  });

  it('returns null for spectators', () => {
    const won = view({ status: { type: 'finished', winner: 'white', reason: 'race' } });
    expect(crossroadsChessTerminalSoundKey(won, 'spectator')).toBeNull();
  });

  it('plays the cannon boom when your own cannon captures', () => {
    const cannon = { piece: { color: 'white', role: 'cannon' }, shrouded: false } as const;
    const v = view({
      board: { a1: cannon, a3: { piece: { color: 'red', role: 'soldier' }, shrouded: false } },
    });
    expect(soundForOwnCrossroadsChessMove(v, { from: 'a1', to: 'a3' })).toBe('cannon-capture');
  });
});

describe('classifyCrossroadsChessOpponentSound', () => {
  const myPiece = { piece: { color: 'white', role: 'soldier' }, shrouded: false } as const;

  it('plays move after a completed opponent move with no capture', () => {
    const prev = view({ board: { a1: myPiece }, status: { type: 'playing', turn: 'red' } });
    const next = view({ board: { a1: myPiece }, status: { type: 'playing', turn: 'white' } });
    expect(classifyCrossroadsChessOpponentSound(prev, next, 'white')).toBe('move');
  });

  it('plays captured when our visible piece count drops', () => {
    const prev = view({ board: { a1: myPiece }, status: { type: 'playing', turn: 'red' } });
    const next = view({ board: {}, status: { type: 'playing', turn: 'white' } });
    expect(classifyCrossroadsChessOpponentSound(prev, next, 'white')).toBe('captured');
  });

  it('returns null for our own move', () => {
    const prev = view({ status: { type: 'playing', turn: 'white' } });
    const next = view({ status: { type: 'playing', turn: 'red' } });
    expect(classifyCrossroadsChessOpponentSound(prev, next, 'white')).toBeNull();
  });

  it('returns null when the opponent move is not completed yet', () => {
    const prev = view({ status: { type: 'playing', turn: 'red' } });
    const next = view({ status: { type: 'playing', turn: 'red' } });
    expect(classifyCrossroadsChessOpponentSound(prev, next, 'white')).toBeNull();
  });

  it('returns null for spectators', () => {
    const prev = view({ status: { type: 'playing', turn: 'red' } });
    const next = view({ status: { type: 'playing', turn: 'white' } });
    expect(classifyCrossroadsChessOpponentSound(prev, next, 'spectator')).toBeNull();
  });
});
