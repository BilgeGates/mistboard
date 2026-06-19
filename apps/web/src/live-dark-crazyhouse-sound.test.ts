import type { CrazyhousePlayerView } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import {
  classifyDarkCrazyhouseOpponentSound,
  soundForOwnDarkCrazyhouseMove,
} from './live-dark-crazyhouse-sound.js';

// The functions read only board/perspective/status/moveNumber; build that subset.
function view(opts: {
  board?: CrazyhousePlayerView['board'];
  perspective?: 'white' | 'black';
  status?: CrazyhousePlayerView['status'];
  moveNumber?: number;
}): CrazyhousePlayerView {
  return {
    board: opts.board ?? {},
    perspective: opts.perspective ?? 'white',
    status: opts.status ?? { type: 'playing', turn: 'white' },
    moveNumber: opts.moveNumber ?? 1,
  } as unknown as CrazyhousePlayerView;
}

const whitePawn = { color: 'white', role: 'pawn' } as const;
const blackKnight = { color: 'black', role: 'knight' } as const;
const blackKing = { color: 'black', role: 'king' } as const;

describe('soundForOwnDarkCrazyhouseMove', () => {
  it('plays drop for a from-hand placement (wire `*<role>`)', () => {
    expect(soundForOwnDarkCrazyhouseMove(view({}), { from: '*Q', to: 'e4' })).toBe('drop');
  });

  it('plays move for a board move onto an empty square', () => {
    const v = view({ board: { e2: whitePawn } });
    expect(soundForOwnDarkCrazyhouseMove(v, { from: 'e2', to: 'e4' })).toBe('move');
  });

  it('plays capture for a board move onto an enemy', () => {
    const v = view({ board: { e2: whitePawn, d3: blackKnight } });
    expect(soundForOwnDarkCrazyhouseMove(v, { from: 'e2', to: 'd3' })).toBe('capture');
  });

  it('plays king-capture onto an enemy king', () => {
    const v = view({ board: { e2: whitePawn, d3: blackKing } });
    expect(soundForOwnDarkCrazyhouseMove(v, { from: 'e2', to: 'd3' })).toBe('king-capture');
  });
});

describe('classifyDarkCrazyhouseOpponentSound', () => {
  const afterOpponent = { type: 'playing', turn: 'white' } as const;
  const opponentToMove = { type: 'playing', turn: 'black' } as const;

  it('plays move after a completed opponent move with no capture', () => {
    const prev = view({ board: { a1: whitePawn }, status: opponentToMove });
    const next = view({ board: { a1: whitePawn }, status: afterOpponent });
    expect(classifyDarkCrazyhouseOpponentSound(prev, next, 'white')).toBe('move');
  });

  it('plays captured when our visible piece count drops', () => {
    const prev = view({ board: { a1: whitePawn }, status: opponentToMove });
    const next = view({ board: {}, status: afterOpponent });
    expect(classifyDarkCrazyhouseOpponentSound(prev, next, 'white')).toBe('captured');
  });

  it('returns null for our own move', () => {
    const prev = view({ status: { type: 'playing', turn: 'white' } });
    const next = view({ status: { type: 'playing', turn: 'black' } });
    expect(classifyDarkCrazyhouseOpponentSound(prev, next, 'white')).toBeNull();
  });

  it('returns null for spectators', () => {
    const prev = view({ status: opponentToMove });
    const next = view({ status: afterOpponent });
    expect(classifyDarkCrazyhouseOpponentSound(prev, next, 'spectator')).toBeNull();
  });
});
