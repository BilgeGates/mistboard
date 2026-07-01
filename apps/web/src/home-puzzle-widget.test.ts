import {
  MINI_XIANGQI_PUZZLES,
  type MiniXiangqiPuzzle,
  miniXiangqiPuzzleSideToMove,
} from '@mistboard/game';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildHomePuzzleWidget, loadHomeDailyPuzzle } from './home-puzzle-widget.js';

describe('home puzzle widget', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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
    expect(widget?.textContent).toContain('Red to move');
    expect(widget?.querySelector('.mini-xq-board')).not.toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('returns null when the daily puzzle endpoint is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 })),
    );

    expect(await loadHomeDailyPuzzle()).toBeNull();
    expect(await buildHomePuzzleWidget()).toBeNull();
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
