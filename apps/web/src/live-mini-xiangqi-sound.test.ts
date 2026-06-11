import type { MiniXiangqiPlayerView } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import {
  classifyMiniXiangqiOpponentSound,
  miniXiangqiTerminalSoundKey,
  soundForOwnMiniXiangqiMove,
} from './live-mini-xiangqi-sound.js';

type Board = MiniXiangqiPlayerView['board'];

function view(opts: {
  perspective?: 'red' | 'black';
  board?: Board;
  status?: MiniXiangqiPlayerView['status'];
  moveNumber?: number;
}): MiniXiangqiPlayerView {
  return {
    id: 'v',
    perspective: opts.perspective ?? 'red',
    board: opts.board ?? {},
    visibleSquares: [],
    legalMoves: [],
    status: opts.status ?? { type: 'playing', turn: 'red' },
    moveNumber: opts.moveNumber ?? 1,
  };
}

describe('soundForOwnMiniXiangqiMove', () => {
  const fromEntry = { piece: { color: 'red', role: 'chariot' }, shrouded: false } as const;

  it('plays move onto an empty square', () => {
    const v = view({ board: { a1: fromEntry } });
    expect(soundForOwnMiniXiangqiMove(v, { from: 'a1', to: 'a2' })).toBe('move');
  });

  it('plays capture onto a visible opponent piece', () => {
    const v = view({
      board: { a1: fromEntry, a2: { piece: { color: 'black', role: 'soldier' }, shrouded: false } },
    });
    expect(soundForOwnMiniXiangqiMove(v, { from: 'a1', to: 'a2' })).toBe('capture');
  });

  it('plays king-capture onto a visible opponent general', () => {
    const v = view({
      board: { a1: fromEntry, a2: { piece: { color: 'black', role: 'general' }, shrouded: false } },
    });
    expect(soundForOwnMiniXiangqiMove(v, { from: 'a1', to: 'a2' })).toBe('king-capture');
  });

  it('plays the cannon boom when your own cannon captures', () => {
    const cannon = { piece: { color: 'red', role: 'cannon' }, shrouded: false } as const;
    const v = view({
      board: { a1: cannon, a3: { piece: { color: 'black', role: 'soldier' }, shrouded: false } },
    });
    expect(soundForOwnMiniXiangqiMove(v, { from: 'a1', to: 'a3' })).toBe('cannon-capture');
  });

  it('booms on a shrouded target too: the mover role is your own, always known', () => {
    const cannon = { piece: { color: 'red', role: 'cannon' }, shrouded: false } as const;
    const v = view({
      board: { a1: cannon, a3: { shrouded: true } as Board[keyof Board] },
    });
    expect(soundForOwnMiniXiangqiMove(v, { from: 'a1', to: 'a3' })).toBe('cannon-capture');
  });

  it('keeps king-capture above the cannon boom for a visible general', () => {
    const cannon = { piece: { color: 'red', role: 'cannon' }, shrouded: false } as const;
    const v = view({
      board: { a1: cannon, a3: { piece: { color: 'black', role: 'general' }, shrouded: false } },
    });
    expect(soundForOwnMiniXiangqiMove(v, { from: 'a1', to: 'a3' })).toBe('king-capture');
  });

  it('plays capture onto a shrouded (hidden role) target', () => {
    const v = view({ board: { a1: fromEntry, a2: { color: 'black', shrouded: true } } });
    expect(soundForOwnMiniXiangqiMove(v, { from: 'a1', to: 'a2' })).toBe('capture');
  });
});

describe('miniXiangqiTerminalSoundKey', () => {
  it('returns null while the game is still playing', () => {
    expect(miniXiangqiTerminalSoundKey(view({}), 'red')).toBeNull();
  });

  it('returns a win key when the viewer is the winner', () => {
    const v = view({
      status: { type: 'finished', winner: 'red', reason: 'general-captured' },
      moveNumber: 9,
    });
    expect(miniXiangqiTerminalSoundKey(v, 'red')).toBe('win:9');
  });

  it('returns a lose key when the opponent is the winner', () => {
    const v = view({ status: { type: 'finished', winner: 'red', reason: 'general-captured' } });
    expect(miniXiangqiTerminalSoundKey(v, 'black')).toBe('lose:1');
  });

  it('returns a draw key for a finished game with no winner', () => {
    const v = view({ status: { type: 'finished', winner: null, reason: 'repetition' } });
    expect(miniXiangqiTerminalSoundKey(v, 'red')).toBe('draw:1');
  });

  it('returns null for a spectator', () => {
    const v = view({ status: { type: 'finished', winner: 'red', reason: 'general-captured' } });
    expect(miniXiangqiTerminalSoundKey(v, 'spectator')).toBeNull();
  });
});

describe('classifyMiniXiangqiOpponentSound', () => {
  const myPiece = { piece: { color: 'red', role: 'soldier' }, shrouded: false } as const;

  it('plays move after a completed opponent move with no captures', () => {
    const prev = view({ board: { a1: myPiece }, status: { type: 'playing', turn: 'black' } });
    const next = view({ board: { a1: myPiece }, status: { type: 'playing', turn: 'red' } });
    expect(classifyMiniXiangqiOpponentSound(prev, next, 'red')).toBe('move');
  });

  it('plays captured when our visible piece count drops', () => {
    const prev = view({ board: { a1: myPiece }, status: { type: 'playing', turn: 'black' } });
    const next = view({ board: {}, status: { type: 'playing', turn: 'red' } });
    expect(classifyMiniXiangqiOpponentSound(prev, next, 'red')).toBe('captured');
  });

  it('returns null for our own move (it was our turn before)', () => {
    const prev = view({ status: { type: 'playing', turn: 'red' } });
    const next = view({ status: { type: 'playing', turn: 'black' } });
    expect(classifyMiniXiangqiOpponentSound(prev, next, 'red')).toBeNull();
  });

  it('returns null when the opponent move is not yet completed', () => {
    const prev = view({ status: { type: 'playing', turn: 'black' } });
    const next = view({ status: { type: 'playing', turn: 'black' } });
    expect(classifyMiniXiangqiOpponentSound(prev, next, 'red')).toBeNull();
  });

  it('returns null for a spectator', () => {
    const prev = view({ status: { type: 'playing', turn: 'black' } });
    const next = view({ status: { type: 'playing', turn: 'red' } });
    expect(classifyMiniXiangqiOpponentSound(prev, next, 'spectator')).toBeNull();
  });
});
