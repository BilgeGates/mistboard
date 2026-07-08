import {
  MINI_XIANGQI_PUZZLES,
  type MiniXiangqiPuzzle,
  miniXiangqiPuzzleSideToMove,
} from '@mistboard/game';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildHomePuzzleWidget,
  cachedHomeDailyPuzzle,
  loadHomeDailyPuzzle,
} from './home-puzzle-widget.js';
import { xiangqiAppearanceChangedEvent } from './theme.js';

describe('home puzzle widget', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage?.clear();
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  it('fetches and renders the daily puzzle as a homepage teaser', async () => {
    const puzzle = MINI_XIANGQI_PUZZLES[0]!;
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/puzzles/daily?slot=homepage');
      expect(init).toEqual({ credentials: 'same-origin' });
      return jsonResponse(dailyBody(puzzle));
    });
    vi.stubGlobal('fetch', fetchSpy);

    const widget = await buildHomePuzzleWidget();

    expect(widget).not.toBeNull();
    expect(widget?.className).toBe('home-puzzle-widget');
    expect((widget as HTMLAnchorElement).getAttribute('href')).toBe(`/puzzles/${puzzle.id}`);
    expect(widget?.querySelector('.home-puzzle-widget-title')?.textContent).toBe(
      'Puzzle of the day - Mini Xiangqi',
    );
    expect(widget?.getAttribute('aria-label')).toBe(`Puzzle of the day: ${puzzle.title}`);
    expect(widget?.textContent).toContain('Red to play');
    expect(widget?.querySelector('.mini-xq-board')).not.toBeNull();
    expect(widget?.querySelector('.mini-xq-piece')?.getAttribute('width')).toBe('64');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('renders both public hands for a Drop Mini daily puzzle', async () => {
    const puzzle = MINI_XIANGQI_PUZZLES.find(
      (candidate) => candidate.id === 'drop-mini-xiangqi-red-chariot-drop-mate-1',
    )!;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(dailyBody(puzzle))),
    );

    const widget = await buildHomePuzzleWidget();

    expect(widget?.querySelector('.home-puzzle-reserve')).not.toBeNull();
    expect(widget?.querySelectorAll('.home-puzzle-hand')).toHaveLength(2);
    expect(widget?.querySelector('[aria-label="black reserve"]')).not.toBeNull();
    const redReserve = widget?.querySelector('[aria-label="red reserve"]');
    expect(redReserve).not.toBeNull();
    expect(redReserve?.querySelector('.drop-mini-reserve-piece')).not.toBeNull();
    expect(widget?.querySelector('.mini-xq-board')).not.toBeNull();
  });

  it('repaints its inline pieces when the Xiangqi appearance picker changes', async () => {
    const puzzle = MINI_XIANGQI_PUZZLES[0]!;
    installMemoryLocalStorage();
    setStoredXiangqiPieceSet('traditional');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(dailyBody(puzzle))),
    );

    const widget = await buildHomePuzzleWidget();
    const traditionalMarkup = widget?.innerHTML;

    setStoredXiangqiPieceSet('western');
    window.dispatchEvent(new Event(xiangqiAppearanceChangedEvent));

    expect(widget?.innerHTML).not.toBe(traditionalMarkup);
  });

  it('returns null when the daily puzzle endpoint is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 })),
    );

    expect(await loadHomeDailyPuzzle()).toBeNull();
    expect(await buildHomePuzzleWidget()).toBeNull();
  });

  it('caches a loaded daily puzzle for synchronous first-paint reuse', async () => {
    const puzzle = MINI_XIANGQI_PUZZLES[0]!;
    installMemoryLocalStorage();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(dailyBody(puzzle))),
    );

    expect(cachedHomeDailyPuzzle()).toBeNull();
    await loadHomeDailyPuzzle();
    expect(cachedHomeDailyPuzzle()?.puzzle.id).toBe(puzzle.id);
  });

  it('treats a stale-shaped cached payload as a miss', () => {
    installMemoryLocalStorage();
    window.localStorage.setItem(
      'mistboard:home-daily-puzzle',
      JSON.stringify({ daily: { day: '2026-07-01' } }),
    );
    expect(cachedHomeDailyPuzzle()).toBeNull();
  });
});

function dailyBody(puzzle: MiniXiangqiPuzzle): unknown {
  return {
    daily: {
      day: '2026-07-01',
      persisted: true,
      selectedAt: '2026-07-01T00:00:00.000Z',
      slot: 'homepage',
      source: 'auto',
    },
    puzzle: {
      id: puzzle.id,
      variant: puzzle.variant,
      title: puzzle.title,
      sideToMove: miniXiangqiPuzzleSideToMove(puzzle),
      goal: puzzle.goal,
      themes: puzzle.themes,
      solutionPlyCount: puzzle.solution.length,
      initial: puzzle.initial,
    },
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: init.status ?? 200,
  });
}

function setStoredXiangqiPieceSet(pieceSet: string): void {
  window.localStorage.setItem('mistboard.xiangqiPieceSetVersion', '2');
  window.localStorage.setItem('mistboard.xiangqiPieceSet', pieceSet);
}

function installMemoryLocalStorage(): void {
  const values = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      removeItem: (key: string) => {
        values.delete(key);
      },
      setItem: (key: string, value: string) => {
        values.set(key, String(value));
      },
    } as Storage,
  });
}
