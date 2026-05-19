import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@mistboard/game';
import { computeCaptures } from './captures.js';

const ROOM = 'room';

function roomCreated(): GameEvent {
  return {
    type: 'room-created',
    at: 0,
    roomId: ROOM,
    variant: 'fog-of-war',
    offer: [],
    timeControl: { initialMs: 60_000, incrementMs: 0 },
  } as Extract<GameEvent, { type: 'room-created' }>;
}

function move(color: 'white' | 'black', from: string, to: string, promotion?: 'queen' | 'rook' | 'bishop' | 'knight'): GameEvent {
  return {
    type: 'move-played',
    at: 1,
    roomId: ROOM,
    color,
    move: { from: from as never, to: to as never, ...(promotion ? { promotion } : {}) },
  };
}

describe('computeCaptures', () => {
  it('returns empty tally when no events', () => {
    expect(computeCaptures([])).toEqual({ white: [], black: [] });
  });

  it('detects a direct capture', () => {
    // 1. e4 e5  2. d4 exd4 → black captures a white pawn
    const events: GameEvent[] = [
      roomCreated(),
      move('white', 'e2', 'e4'),
      move('black', 'e7', 'e5'),
      move('white', 'd2', 'd4'),
      move('black', 'e5', 'd4'),
    ];
    const tally = computeCaptures(events);
    expect(tally.white).toEqual([]);
    expect(tally.black).toEqual(['pawn']);
  });

  it('detects en passant', () => {
    // 1. e4 a5  2. e5 d5  3. exd6 (en passant on d5 pawn)
    const events: GameEvent[] = [
      roomCreated(),
      move('white', 'e2', 'e4'),
      move('black', 'a7', 'a5'),
      move('white', 'e4', 'e5'),
      move('black', 'd7', 'd5'),
      move('white', 'e5', 'd6'),
    ];
    const tally = computeCaptures(events);
    expect(tally.white).toEqual(['pawn']);
    expect(tally.black).toEqual([]);
  });

  it('ignores castling (own rook on target square is not a capture)', () => {
    // Quick king-side castle setup for white.
    const events: GameEvent[] = [
      roomCreated(),
      move('white', 'e2', 'e4'),
      move('black', 'e7', 'e5'),
      move('white', 'g1', 'f3'),
      move('black', 'b8', 'c6'),
      move('white', 'f1', 'c4'),
      move('black', 'g8', 'f6'),
      move('white', 'e1', 'g1'), // O-O
    ];
    const tally = computeCaptures(events);
    expect(tally.white).toEqual([]);
    expect(tally.black).toEqual([]);
  });
});
