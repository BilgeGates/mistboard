import type { DropMiniXiangqiPlayerView } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import {
  classifyDropMiniXiangqiOpponentSound,
  dropMiniXiangqiTerminalSoundKey,
  soundForOwnDropMiniXiangqiMove,
} from './live-drop-mini-xiangqi-sound.js';

type Board = DropMiniXiangqiPlayerView['board'];
const emptyHands = { red: {}, black: {} } as DropMiniXiangqiPlayerView['hands'];

function view(opts: {
  perspective?: 'red' | 'black';
  board?: Board;
  status?: DropMiniXiangqiPlayerView['status'];
  moveNumber?: number;
}): DropMiniXiangqiPlayerView {
  return {
    id: 'v',
    perspective: opts.perspective ?? 'red',
    board: opts.board ?? {},
    hands: emptyHands,
    cooldownHands: emptyHands,
    legalMoves: [],
    rules: {
      dropRegion: 'any-empty',
      dropAttack: 'allow-immediate-general-threat',
      reserve: 'immediate',
    },
    inCheck: false,
    status: opts.status ?? { type: 'playing', turn: 'red' },
    moveNumber: opts.moveNumber ?? 1,
  };
}

describe('soundForOwnDropMiniXiangqiMove', () => {
  const chariot = { color: 'red', role: 'chariot' } as const;

  it('plays drop for a piece placed from hand', () => {
    expect(soundForOwnDropMiniXiangqiMove(view({}), { drop: 'cannon', to: 'd4' })).toBe('drop');
  });

  it('plays move onto an empty square', () => {
    const v = view({ board: { a1: chariot } });
    expect(soundForOwnDropMiniXiangqiMove(v, { from: 'a1', to: 'a2' })).toBe('move');
  });

  it('plays capture onto an enemy piece', () => {
    const v = view({ board: { a1: chariot, a2: { color: 'black', role: 'soldier' } } });
    expect(soundForOwnDropMiniXiangqiMove(v, { from: 'a1', to: 'a2' })).toBe('capture');
  });

  it('plays king-capture onto the enemy general', () => {
    const v = view({ board: { a1: chariot, a2: { color: 'black', role: 'general' } } });
    expect(soundForOwnDropMiniXiangqiMove(v, { from: 'a1', to: 'a2' })).toBe('king-capture');
  });

  it('booms when your own cannon captures', () => {
    const v = view({
      board: { a1: { color: 'red', role: 'cannon' }, a3: { color: 'black', role: 'soldier' } },
    });
    expect(soundForOwnDropMiniXiangqiMove(v, { from: 'a1', to: 'a3' })).toBe('cannon-capture');
  });

  it('keeps king-capture above the cannon boom for the general', () => {
    const v = view({
      board: { a1: { color: 'red', role: 'cannon' }, a3: { color: 'black', role: 'general' } },
    });
    expect(soundForOwnDropMiniXiangqiMove(v, { from: 'a1', to: 'a3' })).toBe('king-capture');
  });
});

describe('dropMiniXiangqiTerminalSoundKey', () => {
  it('returns null while playing', () => {
    expect(dropMiniXiangqiTerminalSoundKey(view({}), 'red')).toBeNull();
  });

  it('returns a win key for the winner', () => {
    const v = view({
      status: { type: 'finished', winner: 'red', reason: 'general-captured' },
      moveNumber: 9,
    });
    expect(dropMiniXiangqiTerminalSoundKey(v, 'red')).toBe('win:9');
  });

  it('returns a lose key for the loser', () => {
    const v = view({ status: { type: 'finished', winner: 'red', reason: 'general-captured' } });
    expect(dropMiniXiangqiTerminalSoundKey(v, 'black')).toBe('lose:1');
  });

  it('returns a draw key for a winnerless finish', () => {
    const v = view({ status: { type: 'finished', winner: null, reason: 'repetition' } });
    expect(dropMiniXiangqiTerminalSoundKey(v, 'red')).toBe('draw:1');
  });

  it('returns null for a spectator', () => {
    const v = view({ status: { type: 'finished', winner: 'red', reason: 'general-captured' } });
    expect(dropMiniXiangqiTerminalSoundKey(v, 'spectator')).toBeNull();
  });
});

describe('classifyDropMiniXiangqiOpponentSound', () => {
  const myPiece = { color: 'red', role: 'soldier' } as const;
  const playingBlack: DropMiniXiangqiPlayerView['status'] = { type: 'playing', turn: 'black' };
  const playingRed: DropMiniXiangqiPlayerView['status'] = { type: 'playing', turn: 'red' };

  it('plays move after a completed opponent move with no captures or drops', () => {
    const prev = view({ board: { a1: myPiece }, status: playingBlack });
    const next = view({ board: { a1: myPiece }, status: playingRed });
    expect(classifyDropMiniXiangqiOpponentSound(prev, next, 'red')).toBe('move');
  });

  it('plays captured when our piece count drops', () => {
    const prev = view({ board: { a1: myPiece }, status: playingBlack });
    const next = view({ board: {}, status: playingRed });
    expect(classifyDropMiniXiangqiOpponentSound(prev, next, 'red')).toBe('captured');
  });

  it('plays drop when the opponent piece count rises', () => {
    const prev = view({ board: { a1: myPiece }, status: playingBlack });
    const next = view({
      board: { a1: myPiece, e4: { color: 'black', role: 'horse' } },
      status: playingRed,
    });
    expect(classifyDropMiniXiangqiOpponentSound(prev, next, 'red')).toBe('drop');
  });

  it('returns null for our own move (it was our turn before)', () => {
    const prev = view({ status: playingRed });
    const next = view({ status: playingBlack });
    expect(classifyDropMiniXiangqiOpponentSound(prev, next, 'red')).toBeNull();
  });

  it('returns null when the opponent move is not yet completed', () => {
    const prev = view({ status: playingBlack });
    const next = view({ status: playingBlack });
    expect(classifyDropMiniXiangqiOpponentSound(prev, next, 'red')).toBeNull();
  });

  it('returns null for a spectator', () => {
    const prev = view({ status: playingBlack });
    const next = view({ status: playingRed });
    expect(classifyDropMiniXiangqiOpponentSound(prev, next, 'spectator')).toBeNull();
  });
});
