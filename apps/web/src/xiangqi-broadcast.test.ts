import { type XiangqiColor, XIANGQI_BROADCAST_SCHEMA, type XiangqiMove } from '@mistboard/game';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { importXiangqiGame } from './review/xiangqi-import.js';
import {
  mountXiangqiBroadcastRound,
  serializeBroadcastMovesForAnalysis,
} from './xiangqi-broadcast.js';

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

describe('mountXiangqiBroadcastRound (mini-board grid)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function board(input: {
    n: number;
    red: string;
    black: string;
    moves: XiangqiMove[];
    status: 'scheduled' | 'live' | 'complete';
    result: '*' | '1-0' | '0-1' | '1/2-1/2';
  }) {
    return {
      id: `t-r-b${input.n}`,
      tourSlug: 't',
      roundId: 'r',
      sourceBoardId: `b${input.n}`,
      boardNumber: input.n,
      red: { name: input.red },
      black: { name: input.black },
      status: input.status,
      result: input.result,
      plyCount: input.moves.length,
      moves: input.moves,
    };
  }

  const ROUND = {
    tour: { schema: XIANGQI_BROADCAST_SCHEMA, slug: 't', name: 'Test Cup' },
    round: { schema: XIANGQI_BROADCAST_SCHEMA, id: 'r', tourSlug: 't', name: 'Round 1' },
    boards: [
      board({
        n: 1,
        red: '王天一',
        black: '郑惟桐',
        moves: [{ from: 'b3', to: 'e3' }],
        status: 'live',
        result: '*',
      }),
      board({ n: 2, red: 'A Player', black: 'B Player', moves: [], status: 'scheduled', result: '*' }),
    ],
  };

  it('renders one mini-board card per board with a board, names, and live marker', async () => {
    // Stub the round fetch; EventSource is stubbed to a no-op so the live-stream
    // wiring does not reach for a real connection under happy-dom.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ROUND })),
    );
    vi.stubGlobal(
      'EventSource',
      class {
        addEventListener(): void {}
        close(): void {}
      },
    );

    const root = document.createElement('div');
    await mountXiangqiBroadcastRound(root, 't', 'r');

    const cards = root.querySelectorAll('.xqb-board-card');
    expect(cards.length).toBe(2);
    // Each card rebuilds a position and renders the shared board SVG (the board
    // root carries .xq-live-svg; pieces are nested svgs, so match the root only).
    expect(root.querySelectorAll('.xqb-card-board > svg.xq-live-svg').length).toBe(2);
    // Pairing names are present.
    expect(root.textContent).toContain('王天一');
    expect(root.textContent).toContain('郑惟桐');
    // The live board carries the live status class; both players are shown.
    expect(root.querySelector('.xqb-board-card-live .xqb-status-live')).not.toBeNull();
    expect(root.querySelectorAll('.xqb-board-card-live .xqb-card-player').length).toBe(2);
  });
});
