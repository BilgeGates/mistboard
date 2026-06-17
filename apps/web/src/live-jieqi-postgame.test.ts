import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jieqiPostgameApiUrl, mountJieqiPostgame } from './live-jieqi-postgame.js';

describe('Jieqi postgame page', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_JIEQI_ENABLED', 'true');
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
    expect(jieqiPostgameApiUrl('jq room')).toBe('/api/jieqi/games/jq%20room');
  });

  it('renders one board with a perspective selector (truth default; per-color shows backs)', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(postgameFixture()));
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');

    mountJieqiPostgame(root, 'jq_postgame');
    await flushPromises();

    expect(fetchSpy).toHaveBeenCalledWith('/api/jieqi/games/jq_postgame');
    expect(root.textContent).toContain('Game review');
    expect(root.textContent).toContain('Red wins');
    // No jieqi play-again action in v1; the review keeps Back home + Room.
    expect(root.textContent).toContain('Back home');
    expect(root.textContent).toContain('Room');
    expect(root.textContent).not.toContain('Play again');
    expect(root.textContent).toContain('Red b3-b10');
    expect(root.textContent).toContain('Ply 1 of 1');

    // ONE board now (the old three-board triptych is collapsed to a single board).
    expect(root.querySelectorAll('.jieqi-board')).toHaveLength(1);

    // The perspective selector exposes all three views (short labels, full aria).
    const viewButtons = [
      ...root.querySelectorAll<HTMLButtonElement>('.dxq-postgame__view-button'),
    ];
    expect(viewButtons.map((button) => button.textContent)).toEqual(['Red', 'Truth', 'Black']);
    expect(viewButtons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Red view',
      'Server truth',
      'Black view',
    ]);

    // Default = Server truth: every identity revealed (black cannon on h8 shows its
    // glyph, never a hidden back), and the Truth button is the active one.
    const boardHtml = () => root.querySelector('.jieqi-board')?.innerHTML ?? '';
    expect(boardHtml()).toContain('aria-label="black cannon"');
    expect(boardHtml()).not.toContain('hidden piece');
    const truthButton = viewButtons.find((button) => button.textContent === 'Truth')!;
    expect(truthButton.getAttribute('aria-pressed')).toBe('true');

    // Switching to the Red view masks Black's still-face-down piece on h8 as a back.
    viewButtons.find((button) => button.textContent === 'Red')!.click();
    expect(boardHtml()).toContain('aria-label="black hidden piece"');
    expect(boardHtml()).not.toContain('aria-label="black cannon"');
  });
});

function postgameFixture() {
  // Red cannon b3 -> b10 captured a black dark piece (a horse); Red's cannon is
  // now revealed on b10. Black resigns. Every other piece stays dealt face-down.
  return {
    game: {
      roomId: 'jq_postgame',
      variant: 'jieqi',
      mode: 'pvp',
      result: 'red-wins',
      termination: 'resignation',
      plyCount: 1,
      startedAt: '2026-06-13T12:00:00.000Z',
      endedAt: '2026-06-13T12:05:00.000Z',
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
      { type: 'move-played', at: 4, color: 'red', move: { from: 'b3', to: 'b10' }, ply: 1 },
      { type: 'seat-resigned', at: 5, color: 'black', winner: 'red' },
    ],
    view: truthView('jq_postgame_truth'),
    history: {
      red: [{ ply: 1, view: redView('jq_postgame_red_1') }],
      truth: [{ ply: 1, view: truthView('jq_postgame_truth_1') }],
      black: [{ ply: 1, view: blackView('jq_postgame_black_1') }],
    },
    views: {
      red: redView('jq_postgame_red'),
      truth: truthView('jq_postgame_truth'),
      black: blackView('jq_postgame_black'),
    },
  };
}

const finished = { type: 'finished', winner: 'red', reason: 'resignation' } as const;

function truthView(id: string) {
  return {
    id,
    perspective: 'red',
    board: {
      e1: { color: 'red', role: 'general', faceDown: false },
      e10: { color: 'black', role: 'general', faceDown: false },
      b10: { color: 'red', role: 'cannon', faceDown: false },
      h8: { color: 'black', role: 'cannon', faceDown: false },
    },
    legalMoves: [],
    captured: [{ owner: 'black', role: 'horse' }],
    inCheck: false,
    status: finished,
    moveNumber: 1,
    lastMove: { from: 'b3', to: 'b10' },
  };
}

function redView(id: string) {
  return {
    id,
    perspective: 'red',
    board: {
      e1: { color: 'red', role: 'general', faceDown: false },
      e10: { color: 'black', role: 'general', faceDown: false },
      b10: { color: 'red', role: 'cannon', faceDown: false },
      h8: { color: 'black', faceDown: true },
    },
    legalMoves: [],
    captured: [{ owner: 'black', role: 'horse' }],
    inCheck: false,
    status: finished,
    moveNumber: 1,
    lastMove: { from: 'b3', to: 'b10' },
  };
}

function blackView(id: string) {
  return {
    id,
    perspective: 'black',
    board: {
      e1: { color: 'red', role: 'general', faceDown: false },
      e10: { color: 'black', role: 'general', faceDown: false },
      b10: { color: 'red', role: 'cannon', faceDown: false },
      h8: { color: 'black', faceDown: true },
    },
    legalMoves: [],
    captured: [{ owner: 'black', role: null }],
    inCheck: false,
    status: finished,
    moveNumber: 1,
    lastMove: { from: 'b3', to: 'b10' },
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
