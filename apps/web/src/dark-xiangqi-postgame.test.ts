import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  darkXiangqiPostgameApiUrl,
  darkXiangqiPostgameSeatToken,
  mountDarkXiangqiPostgame,
} from './dark-xiangqi-postgame.js';

const redToken = 'r'.repeat(32);
const blackToken = 'b'.repeat(32);

describe('Dark Xiangqi postgame page', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DARK_XIANGQI_ENABLED', 'true');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: memoryStorage(),
    });
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('builds the family-native postgame API URL with a seat token when present', () => {
    expect(darkXiangqiPostgameApiUrl('dxq room', null)).toBe('/api/dark-xiangqi/games/dxq%20room');
    expect(darkXiangqiPostgameApiUrl('dxq room', redToken)).toBe(
      `/api/dark-xiangqi/games/dxq%20room?seatToken=${redToken}`,
    );
  });

  it('uses only red or black stored seat tokens for postgame fetches', () => {
    window.localStorage.setItem(
      'mistboard.seatToken.dxq_red',
      JSON.stringify({ seat: 'red', token: redToken }),
    );
    window.localStorage.setItem(
      'mistboard.seatToken.dxq_white',
      JSON.stringify({ seat: 'white', token: 'w'.repeat(32) }),
    );

    expect(darkXiangqiPostgameSeatToken('dxq_red')).toBe(redToken);
    expect(darkXiangqiPostgameSeatToken('dxq_white')).toBeNull();
  });

  it('renders a seated redacted final board and only that seat timeline', async () => {
    window.localStorage.setItem(
      'mistboard.seatToken.dxq_postgame',
      JSON.stringify({ seat: 'red', token: redToken }),
    );
    const fetchSpy = vi.fn(async () => jsonResponse(postgameFixture('red')));
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');

    mountDarkXiangqiPostgame(root, 'dxq_postgame');
    await flushPromises();

    expect(fetchSpy).toHaveBeenCalledWith(
      `/api/dark-xiangqi/games/dxq_postgame?seatToken=${redToken}`,
    );
    expect(root.textContent).toContain('Red wins');
    expect(root.textContent).toContain('Red view');
    expect(root.textContent).toContain('Public view');
    expect(root.textContent).toContain('Black view');
    expect(root.textContent).toContain('Play again');
    expect(root.textContent).toContain('Back home');
    expect(root.textContent).toContain('Red b3-b4');
    expect(root.textContent).not.toContain('Black b8-b7');
    expect(root.textContent).toContain('Ply 2 of 2');
    expect(root.querySelectorAll('.xq-live-svg')).toHaveLength(3);
    expect(root.innerHTML).toContain('aria-label="black hidden piece"');
    expect(root.innerHTML).toContain('aria-label="black soldier"');

    root
      .querySelector<HTMLButtonElement>('.dxq-postgame__replay-button[aria-label="Previous ply"]')
      ?.click();
    expect(root.textContent).toContain('Ply 1 of 2');
  });

  it('renders public spectator payloads without board truth', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(postgameFixture('spectator'))),
    );
    const root = document.createElement('div');

    mountDarkXiangqiPostgame(root, 'dxq_public');
    await flushPromises();

    expect(root.textContent).toContain('Spectator');
    expect(root.textContent).toContain('Ply 2 of 2');
    expect(root.textContent).toContain('No visible moves');
    expect(root.textContent).not.toContain('Red view');
    expect(root.textContent).not.toContain('Black view');
    expect(root.querySelectorAll('.xq-piece')).toHaveLength(0);
  });

  it('renders a stale-seat error when the token is rejected', async () => {
    window.localStorage.setItem(
      'mistboard.seatToken.dxq_rejected',
      JSON.stringify({ seat: 'black', token: blackToken }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'invalid_seat_token' }, { status: 401 })),
    );
    const root = document.createElement('div');

    mountDarkXiangqiPostgame(root, 'dxq_rejected');
    await flushPromises();

    expect(root.textContent).toContain('Seat unavailable');
    expect(root.textContent).toContain('stored seat token was rejected');
  });
});

function postgameFixture(seat: 'red' | 'black' | 'spectator') {
  return {
    game: {
      roomId: 'dxq_postgame',
      variant: 'dark-xiangqi',
      mode: 'pvp',
      result: 'red-wins',
      termination: 'resignation',
      plyCount: 2,
      startedAt: '2026-05-29T12:00:00.000Z',
      endedAt: '2026-05-29T12:05:00.000Z',
      rated: false,
      visibility: 'private',
      initialMs: 180000,
      incrementMs: 2000,
    },
    access: { seat },
    state: {
      status: { type: 'finished', winner: 'red', reason: 'resignation' },
      moveNumber: 2,
      timeControl: { initialMs: 180000, incrementMs: 2000 },
    },
    timeline:
      seat === 'red'
        ? [{ type: 'move-played', at: 2, color: 'red', move: { from: 'b3', to: 'b4' }, ply: 1 }]
        : seat === 'black'
          ? [
              {
                type: 'move-played',
                at: 3,
                color: 'black',
                move: { from: 'b8', to: 'b7' },
                ply: 2,
              },
            ]
          : [],
    view: {
      id: 'dxq_postgame',
      perspective: seat === 'black' ? 'black' : 'red',
      board:
        seat === 'spectator'
          ? {}
          : {
              b4: { piece: { color: 'red', role: 'cannon' }, shrouded: false },
              b8: { color: 'black', shrouded: true },
            },
      visibleSquares: seat === 'spectator' ? [] : ['b4', 'b8'],
      legalMoves: [],
      status: { type: 'finished', winner: 'red', reason: 'resignation' },
      moveNumber: 2,
    },
    history:
      seat === 'spectator'
        ? {
            spectator: [
              {
                ply: 0,
                view: emptySpectatorView('dxq_postgame_spectator_0'),
              },
              {
                ply: 1,
                view: emptySpectatorView('dxq_postgame_spectator_1'),
              },
              {
                ply: 2,
                view: emptySpectatorView('dxq_postgame_spectator_2'),
              },
            ],
          }
        : {
            red: [
              {
                ply: 0,
                view: {
                  id: 'dxq_postgame_red_0',
                  perspective: 'red',
                  board: {
                    b3: { piece: { color: 'red', role: 'cannon' }, shrouded: false },
                    b8: { color: 'black', shrouded: true },
                  },
                  visibleSquares: ['b3', 'b8'],
                  legalMoves: [],
                  status: { type: 'playing', turn: 'red' },
                  moveNumber: 1,
                },
              },
              {
                ply: 1,
                view: {
                  id: 'dxq_postgame_red_1',
                  perspective: 'red',
                  board: {
                    b4: { piece: { color: 'red', role: 'cannon' }, shrouded: false },
                    b8: { color: 'black', shrouded: true },
                  },
                  visibleSquares: ['b4', 'b8'],
                  legalMoves: [],
                  status: { type: 'playing', turn: 'black' },
                  moveNumber: 1,
                },
              },
              {
                ply: 2,
                view: {
                  id: 'dxq_postgame_red_2',
                  perspective: 'red',
                  board: {
                    b4: { piece: { color: 'red', role: 'cannon' }, shrouded: false },
                    b7: { color: 'black', shrouded: true },
                  },
                  visibleSquares: ['b4', 'b7'],
                  legalMoves: [],
                  status: { type: 'finished', winner: 'red', reason: 'resignation' },
                  moveNumber: 2,
                },
              },
            ],
            spectator: [
              { ply: 0, view: emptySpectatorView('dxq_postgame_spectator_0') },
              { ply: 1, view: emptySpectatorView('dxq_postgame_spectator_1') },
              { ply: 2, view: emptySpectatorView('dxq_postgame_spectator_2') },
            ],
            black: [
              {
                ply: 0,
                view: {
                  id: 'dxq_postgame_black_0',
                  perspective: 'black',
                  board: {
                    b3: { color: 'red', shrouded: true },
                    b8: { piece: { color: 'black', role: 'soldier' }, shrouded: false },
                  },
                  visibleSquares: ['b3', 'b8'],
                  legalMoves: [],
                  status: { type: 'playing', turn: 'red' },
                  moveNumber: 1,
                },
              },
              {
                ply: 1,
                view: {
                  id: 'dxq_postgame_black_1',
                  perspective: 'black',
                  board: {
                    b4: { color: 'red', shrouded: true },
                    b8: { piece: { color: 'black', role: 'soldier' }, shrouded: false },
                  },
                  visibleSquares: ['b4', 'b8'],
                  legalMoves: [],
                  status: { type: 'playing', turn: 'black' },
                  moveNumber: 1,
                },
              },
              {
                ply: 2,
                view: {
                  id: 'dxq_postgame_black_2',
                  perspective: 'black',
                  board: {
                    b4: { color: 'red', shrouded: true },
                    b7: { piece: { color: 'black', role: 'soldier' }, shrouded: false },
                  },
                  visibleSquares: ['b4', 'b7'],
                  legalMoves: [],
                  status: { type: 'finished', winner: 'red', reason: 'resignation' },
                  moveNumber: 2,
                },
              },
            ],
          },
    views:
      seat === 'spectator'
        ? undefined
        : {
            red: {
              id: 'dxq_postgame_red',
              perspective: 'red',
              board: {
                b4: { piece: { color: 'red', role: 'cannon' }, shrouded: false },
                b8: { color: 'black', shrouded: true },
              },
              visibleSquares: ['b4', 'b8'],
              legalMoves: [],
              status: { type: 'finished', winner: 'red', reason: 'resignation' },
              moveNumber: 2,
            },
            spectator: {
              id: 'dxq_postgame_spectator',
              perspective: 'red',
              board: {},
              visibleSquares: [],
              legalMoves: [],
              status: { type: 'finished', winner: 'red', reason: 'resignation' },
              moveNumber: 2,
            },
            black: {
              id: 'dxq_postgame_black',
              perspective: 'black',
              board: {
                b4: { color: 'red', shrouded: true },
                b7: { piece: { color: 'black', role: 'soldier' }, shrouded: false },
              },
              visibleSquares: ['b4', 'b7'],
              legalMoves: [],
              status: { type: 'finished', winner: 'red', reason: 'resignation' },
              moveNumber: 2,
            },
          },
  };
}

function emptySpectatorView(id: string) {
  return {
    id,
    perspective: 'red',
    board: {},
    visibleSquares: [],
    legalMoves: [],
    status: { type: 'finished', winner: 'red', reason: 'resignation' },
    moveNumber: 2,
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: init.status ?? 200,
  });
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}
