import type { ShogiPlayerView } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import {
  classifyDarkShogiOpponentSound,
  soundForOwnDarkShogiMove,
} from './live-dark-shogi-sound.js';

function view(opts: {
  board?: Record<string, { color: 'black' | 'white'; role: string; promoted: boolean }>;
  perspective?: 'black' | 'white';
  status?: ShogiPlayerView['status'];
  moveNumber?: number;
}): ShogiPlayerView {
  return {
    board: opts.board ?? {},
    perspective: opts.perspective ?? 'black',
    status: opts.status ?? { type: 'playing', turn: 'black' },
    moveNumber: opts.moveNumber ?? 1,
  } as unknown as ShogiPlayerView;
}

const blackPawn = { color: 'black', role: 'P', promoted: false } as const;
const whiteGold = { color: 'white', role: 'G', promoted: false } as const;
const whiteKing = { color: 'white', role: 'K', promoted: false } as const;

describe('soundForOwnDarkShogiMove', () => {
  it('plays drop for a from-hand placement (wire `*<piece>`)', () => {
    expect(soundForOwnDarkShogiMove(view({}), { from: '*P', to: '5e' })).toBe('drop');
  });

  it('plays move onto an empty square', () => {
    const v = view({ board: { '5d': blackPawn } });
    expect(soundForOwnDarkShogiMove(v, { from: '5d', to: '5e' })).toBe('move');
  });

  it('plays capture onto an enemy', () => {
    const v = view({ board: { '5d': blackPawn, '5e': whiteGold } });
    expect(soundForOwnDarkShogiMove(v, { from: '5d', to: '5e' })).toBe('capture');
  });

  it('plays king-capture onto an enemy king', () => {
    const v = view({ board: { '5d': blackPawn, '5e': whiteKing } });
    expect(soundForOwnDarkShogiMove(v, { from: '5d', to: '5e' })).toBe('king-capture');
  });
});

describe('classifyDarkShogiOpponentSound', () => {
  const afterOpponent = { type: 'playing', turn: 'black' } as const;
  const opponentToMove = { type: 'playing', turn: 'white' } as const;

  it('plays move after a completed opponent move with no capture', () => {
    const prev = view({ board: { '5d': blackPawn }, status: opponentToMove });
    const next = view({ board: { '5d': blackPawn }, status: afterOpponent });
    expect(classifyDarkShogiOpponentSound(prev, next, 'black')).toBe('move');
  });

  it('plays captured when our visible piece count drops', () => {
    const prev = view({ board: { '5d': blackPawn }, status: opponentToMove });
    const next = view({ board: {}, status: afterOpponent });
    expect(classifyDarkShogiOpponentSound(prev, next, 'black')).toBe('captured');
  });

  it('returns null for our own move', () => {
    const prev = view({ status: { type: 'playing', turn: 'black' } });
    const next = view({ status: { type: 'playing', turn: 'white' } });
    expect(classifyDarkShogiOpponentSound(prev, next, 'black')).toBeNull();
  });

  it('returns null for spectators', () => {
    const prev = view({ status: opponentToMove });
    const next = view({ status: afterOpponent });
    expect(classifyDarkShogiOpponentSound(prev, next, 'spectator')).toBeNull();
  });
});
