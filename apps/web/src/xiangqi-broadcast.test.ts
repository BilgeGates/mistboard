import type { XiangqiColor, XiangqiMove } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import { importXiangqiGame } from './review/xiangqi-import.js';
import { serializeBroadcastMovesForAnalysis } from './xiangqi-broadcast.js';

type TimelineEntry = {
  type: 'move-played';
  color: XiangqiColor;
  move: XiangqiMove;
  ply: number;
};

// Red moves on odd plies, black on even — the same alternation the server emits.
function timelineFrom(moves: XiangqiMove[]): TimelineEntry[] {
  return moves.map((move, index) => ({
    type: 'move-played',
    color: index % 2 === 0 ? 'red' : 'black',
    move,
    ply: index + 1,
  }));
}

describe('serializeBroadcastMovesForAnalysis', () => {
  // A legal, color-alternating opening (red on odd plies) that also exercises
  // rank-10 tokens (b10, a10) — every move is legal, so the analysis importer
  // keeps the whole line instead of truncating at an illegal ply.
  const GAME: XiangqiMove[] = [
    { from: 'b3', to: 'e3' }, // red cannon to center
    { from: 'h8', to: 'e8' }, // black cannon to center
    { from: 'b1', to: 'c3' }, // red horse
    { from: 'b10', to: 'c8' }, // black horse
    { from: 'a1', to: 'a2' }, // red rook up one
    { from: 'a10', to: 'a9' }, // black rook up one
  ];
  const QUERY = 'b3e3,h8e8,b1c3,b10c8,a1a2,a10a9';

  it('round-trips a broadcast timeline through the /analysis/xiangqi importer', () => {
    const query = serializeBroadcastMovesForAnalysis(timelineFrom(GAME));
    expect(query).toBe(QUERY);

    const imported = importXiangqiGame(query);
    expect(imported.error).toBeUndefined();
    expect(imported.moves).toEqual(GAME);
  });

  it('orders by ply regardless of timeline entry order', () => {
    const shuffled = [...timelineFrom(GAME)].reverse();
    expect(serializeBroadcastMovesForAnalysis(shuffled)).toBe(QUERY);
  });

  it('yields an empty query for a board with no moves', () => {
    expect(serializeBroadcastMovesForAnalysis([])).toBe('');
  });
});
