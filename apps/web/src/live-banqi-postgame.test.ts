import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { banqiPostgameApiUrl, mountBanqiPostgame } from './live-banqi-postgame.js';

describe('Banqi postgame page', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_BANQI_ENABLED', 'true');
    window.history.replaceState(null, '', '/');
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

  it('builds the family-native public postgame API URL', () => {
    expect(banqiPostgameApiUrl('bq room')).toBe('/api/banqi/games/bq%20room');
  });

  it('renders the review triptych: truth shows revealed glyphs, per-key shows backs', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(postgameFixture()));
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');

    mountBanqiPostgame(root, 'bq_postgame');
    await flushPromises();

    expect(fetchSpy).toHaveBeenCalledWith('/api/banqi/games/bq_postgame');
    expect(root.textContent).toContain('Game review');
    expect(root.textContent).toContain('Red wins');
    expect(root.textContent).toContain('Red view');
    expect(root.textContent).toContain('Server truth');
    expect(root.textContent).toContain('Black view');
    // No banqi play-again action in v1; the review keeps Back home + Room.
    expect(root.textContent).toContain('Back home');
    expect(root.textContent).toContain('Room');
    expect(root.textContent).not.toContain('Play again');
    expect(root.textContent).toContain('Red c2-c3');
    expect(root.textContent).toContain('Ply 1 of 1');
    // Three boards: red view, server truth, black view.
    expect(root.querySelectorAll('.banqi-board')).toHaveLength(3);

    // The TRUTH board reveals every identity: the black horse on d3 renders with
    // its glyph (aria-label "black horse"), never as a hidden back.
    const truth = boardWrap(root, 'Server truth');
    expect(truth.innerHTML).toContain('aria-label="black horse"');

    // The RED view keeps Black's still-face-down tile on d3 as a neutral back,
    // never as an identified black horse.
    const red = boardWrap(root, 'Red view');
    expect(red.innerHTML).toContain('banqi-back');
    expect(red.innerHTML).not.toContain('aria-label="black horse"');
  });
});

function boardWrap(root: HTMLElement, label: string): HTMLElement {
  const wrap = [...root.querySelectorAll<HTMLElement>('.dxq-postgame__board-wrap')].find((el) =>
    el.textContent?.includes(label),
  );
  if (!wrap) throw new Error(`Missing board wrap: ${label}`);
  return wrap;
}

function postgameFixture() {
  // Red chariot c2 -> c3 (a quiet step). The black horse on d3 stays face-down in
  // the per-seat views (banqi is symmetric: a face-down tile reveals nothing to
  // anyone) but is revealed in the truth view. Black resigns.
  return {
    game: {
      roomId: 'bq_postgame',
      variant: 'banqi',
      mode: 'pvp',
      result: 'red-wins',
      termination: 'resignation',
      plyCount: 1,
      startedAt: '2026-06-14T12:00:00.000Z',
      endedAt: '2026-06-14T12:05:00.000Z',
      rated: false,
      visibility: 'private',
      initialMs: 180000,
      incrementMs: 2000,
    },
    state: {
      status: { type: 'finished', winner: 'red', reason: 'resignation' },
      moveNumber: 1,
      timeControl: { initialMs: 180000, incrementMs: 2000 },
    },
    timeline: [
      { type: 'move-played', at: 4, color: 'red', move: { from: 'c2', to: 'c3' }, ply: 1 },
      { type: 'seat-resigned', at: 5, color: 'black', winner: 'red' },
    ],
    view: truthView('bq_postgame_truth'),
    history: {
      red: [{ ply: 1, view: redView('bq_postgame_red_1') }],
      truth: [{ ply: 1, view: truthView('bq_postgame_truth_1') }],
      black: [{ ply: 1, view: blackView('bq_postgame_black_1') }],
    },
    views: {
      red: redView('bq_postgame_red'),
      truth: truthView('bq_postgame_truth'),
      black: blackView('bq_postgame_black'),
    },
  };
}

const finished = { type: 'finished', winner: 'red', reason: 'resignation' } as const;

function truthView(id: string) {
  return {
    id,
    perspective: 'red',
    board: {
      c3: { color: 'red', role: 'chariot', faceDown: false },
      d3: { color: 'black', role: 'horse', faceDown: false },
    },
    legalMoves: [],
    captured: [{ owner: 'black', role: 'soldier' }],
    status: finished,
    ply: 1,
    firstColor: 'red',
    moveNumber: 1,
    lastMove: { from: 'c2', to: 'c3' },
  };
}

function redView(id: string) {
  return {
    id,
    perspective: 'red',
    board: {
      c3: { color: 'red', role: 'chariot', faceDown: false },
      d3: { faceDown: true },
    },
    legalMoves: [],
    captured: [{ owner: 'black', role: 'soldier' }],
    status: finished,
    ply: 1,
    firstColor: 'red',
    moveNumber: 1,
    lastMove: { from: 'c2', to: 'c3' },
  };
}

function blackView(id: string) {
  return {
    id,
    perspective: 'black',
    board: {
      c3: { color: 'red', role: 'chariot', faceDown: false },
      d3: { faceDown: true },
    },
    legalMoves: [],
    captured: [{ owner: 'black', role: 'soldier' }],
    status: finished,
    ply: 1,
    firstColor: 'red',
    moveNumber: 1,
    lastMove: { from: 'c2', to: 'c3' },
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
