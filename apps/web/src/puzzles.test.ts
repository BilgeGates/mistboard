import {
  attemptMiniXiangqiPuzzleLine,
  DROP_MINI_XIANGQI_SPEC_ID,
  MINI_XIANGQI_PUZZLES,
  type MiniXiangqiPuzzle,
} from '@mistboard/game';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountPuzzles } from './puzzles.js';

function publicSummary(puzzle: MiniXiangqiPuzzle) {
  return {
    id: puzzle.id,
    variant: puzzle.variant,
    title: puzzle.title,
    sideToMove: puzzle.initial.status.type === 'playing' ? puzzle.initial.status.turn : null,
    goal: puzzle.goal,
    themes: puzzle.themes,
    solutionPlyCount: puzzle.solution.length,
  };
}

function publicDetail(puzzle: MiniXiangqiPuzzle) {
  return {
    ...publicSummary(puzzle),
    initial: puzzle.initial,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('puzzles route', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.body.innerHTML = '';
    stubWindowLocalStorage(memoryStorage());
    window.history.replaceState(null, '', '/');
  });

  it('renders the Drop Mini puzzle board and public reserves from the API', async () => {
    const mini = MINI_XIANGQI_PUZZLES[0]!;
    const drop = MINI_XIANGQI_PUZZLES.find(
      (puzzle) => puzzle.id === 'drop-mini-xiangqi-red-chariot-drop-mate-1',
    )!;
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/puzzles')
        return json({ puzzles: [publicSummary(mini), publicSummary(drop)] });
      if (url === `/api/puzzles/${drop.id}`) return json({ puzzle: publicDetail(drop) });
      return json({ error: 'not_found' }, 404);
    });
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');

    await mountPuzzles(root, drop.id);

    expect(root.querySelector('.site-section-heading')?.textContent).toBe('Puzzles');
    expect(root.querySelectorAll('.puzzle-list-item')).toHaveLength(0);
    expect(root.querySelector<HTMLSelectElement>('[data-puzzle-variant]')?.value).toBe(
      DROP_MINI_XIANGQI_SPEC_ID,
    );
    expect(root.querySelector('.puzzles-sidebar')?.textContent).toContain('Solved');
    expect(root.querySelector('.puzzles-sidebar')?.textContent).not.toContain(' / ');
    expect(root.querySelector('.puzzle-detail h2')?.textContent).toBe('Red chariot drop mate');
    expect(root.querySelector('.mini-xq-board')).not.toBeNull();
    const boardShell = root.querySelector('.puzzle-board-shell');
    expect(boardShell).not.toBeNull();
    expect(boardShell?.querySelector('[aria-label="Top reserve"]')).not.toBeNull();
    expect(boardShell?.querySelector('[aria-label="Bottom reserve"]')).not.toBeNull();
    expect(boardShell?.querySelector('[data-drop="chariot"]')).not.toBeNull();
    expect(root.querySelector('.puzzle-reserves')).toBeNull();
    expect(root.textContent).toContain('Mate in 1');
    expect(root.textContent).not.toContain('d4');
  });

  it('filters the sequential queue with the variant picker', async () => {
    const mini = MINI_XIANGQI_PUZZLES[0]!;
    const drop = MINI_XIANGQI_PUZZLES.find(
      (puzzle) => puzzle.id === 'drop-mini-xiangqi-red-chariot-drop-mate-1',
    )!;
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/puzzles')
        return json({ puzzles: [publicSummary(mini), publicSummary(drop)] });
      if (url === `/api/puzzles/${mini.id}`) return json({ puzzle: publicDetail(mini) });
      if (url === `/api/puzzles/${drop.id}`) return json({ puzzle: publicDetail(drop) });
      return json({ error: 'not_found' }, 404);
    });
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');

    await mountPuzzles(root, null);
    expect(root.querySelector('.puzzle-detail h2')?.textContent).toBe(mini.title);

    const select = root.querySelector<HTMLSelectElement>('[data-puzzle-variant]')!;
    select.value = DROP_MINI_XIANGQI_SPEC_ID;
    select.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() =>
      expect(root.querySelector('.puzzle-detail h2')?.textContent).toBe(drop.title),
    );
    expect(root.querySelector('.puzzles-sidebar')?.textContent).not.toContain(' / ');
    expect(window.location.pathname).toBe(`/puzzles/${drop.id}`);
  });

  it('plays a Drop Mini puzzle move and advances to the solved state', async () => {
    const drop = MINI_XIANGQI_PUZZLES.find(
      (puzzle) => puzzle.id === 'drop-mini-xiangqi-red-chariot-drop-mate-1',
    )!;
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/puzzles') return json({ puzzles: [publicSummary(drop)] });
      if (url === `/api/puzzles/${drop.id}`) return json({ puzzle: publicDetail(drop) });
      if (url === `/api/puzzles/${drop.id}/attempt`) {
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toEqual({
          moves: [{ drop: 'chariot', to: 'd4' }],
        });
        return json({
          attempt: attemptMiniXiangqiPuzzleLine(drop, [{ drop: 'chariot', to: 'd4' }]),
        });
      }
      return json({ error: 'not_found' }, 404);
    });
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');

    await mountPuzzles(root, drop.id);
    root.querySelector<HTMLButtonElement>('[data-drop="chariot"]')?.click();
    root
      .querySelector<SVGGElement>('[data-square="d4"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await vi.waitFor(() => expect(root.textContent).toContain('Solved.'));
    expect(root.querySelector('.puzzle-reserves')).toBeNull();
    expect(root.textContent).not.toContain('d5');
    expect(fetchSpy).toHaveBeenCalledWith(
      `/api/puzzles/${drop.id}/attempt`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('marks solved puzzles and navigates to the next puzzle', async () => {
    const redDrop = MINI_XIANGQI_PUZZLES.find(
      (puzzle) => puzzle.id === 'drop-mini-xiangqi-red-chariot-drop-mate-1',
    )!;
    const blackDrop = MINI_XIANGQI_PUZZLES.find(
      (puzzle) => puzzle.id === 'drop-mini-xiangqi-black-chariot-drop-mate-1',
    )!;
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/puzzles')
        return json({ puzzles: [publicSummary(redDrop), publicSummary(blackDrop)] });
      if (url === `/api/puzzles/${redDrop.id}`) return json({ puzzle: publicDetail(redDrop) });
      if (url === `/api/puzzles/${blackDrop.id}`) return json({ puzzle: publicDetail(blackDrop) });
      if (url === `/api/puzzles/${redDrop.id}/attempt`) {
        expect(JSON.parse(String(init?.body))).toEqual({
          moves: [{ drop: 'chariot', to: 'd4' }],
        });
        return json({
          attempt: attemptMiniXiangqiPuzzleLine(redDrop, [{ drop: 'chariot', to: 'd4' }]),
        });
      }
      return json({ error: 'not_found' }, 404);
    });
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');

    await mountPuzzles(root, redDrop.id);
    expect(root.querySelector<HTMLButtonElement>('[data-puzzle-next]')?.disabled).toBe(true);
    root.querySelector<HTMLButtonElement>('[data-drop="chariot"]')?.click();
    root
      .querySelector<SVGGElement>('[data-square="d4"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await vi.waitFor(() => expect(root.textContent).toContain('Solved.'));
    expect(root.querySelector('.puzzle-current-card')?.textContent).toContain('Solved');
    expect(root.querySelector('.puzzles-sidebar')?.textContent).not.toContain(' / ');
    expect(root.querySelector<HTMLButtonElement>('[data-puzzle-next]')?.textContent).toBe(
      'Next puzzle',
    );
    expect(root.querySelector<HTMLButtonElement>('[data-puzzle-next]')?.disabled).toBe(false);

    root.querySelector<HTMLButtonElement>('[data-puzzle-next]')?.click();

    await vi.waitFor(() =>
      expect(root.querySelector('.puzzle-detail h2')?.textContent).toBe('Black chariot drop mate'),
    );
    expect(fetchSpy).toHaveBeenCalledWith(`/api/puzzles/${blackDrop.id}`);
  });

  it('auto-advances after solving when the immediate next toggle is enabled', async () => {
    const redDrop = MINI_XIANGQI_PUZZLES.find(
      (puzzle) => puzzle.id === 'drop-mini-xiangqi-red-chariot-drop-mate-1',
    )!;
    const blackDrop = MINI_XIANGQI_PUZZLES.find(
      (puzzle) => puzzle.id === 'drop-mini-xiangqi-black-chariot-drop-mate-1',
    )!;
    const storage = memoryStorage();
    stubWindowLocalStorage(storage);
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/puzzles')
        return json({ puzzles: [publicSummary(redDrop), publicSummary(blackDrop)] });
      if (url === `/api/puzzles/${redDrop.id}`) return json({ puzzle: publicDetail(redDrop) });
      if (url === `/api/puzzles/${blackDrop.id}`) return json({ puzzle: publicDetail(blackDrop) });
      if (url === `/api/puzzles/${redDrop.id}/attempt`) {
        expect(JSON.parse(String(init?.body))).toEqual({
          moves: [{ drop: 'chariot', to: 'd4' }],
        });
        return json({
          attempt: attemptMiniXiangqiPuzzleLine(redDrop, [{ drop: 'chariot', to: 'd4' }]),
        });
      }
      return json({ error: 'not_found' }, 404);
    });
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');

    await mountPuzzles(root, redDrop.id);
    const autoNext = root.querySelector<HTMLInputElement>('[data-puzzle-auto-next]')!;
    expect(autoNext.checked).toBe(false);
    autoNext.checked = true;
    autoNext.dispatchEvent(new Event('change', { bubbles: true }));
    expect(storage.getItem('mistboard:puzzles:auto-next')).toBe('true');

    root.querySelector<HTMLButtonElement>('[data-drop="chariot"]')?.click();
    root
      .querySelector<SVGGElement>('[data-square="d4"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await vi.waitFor(() =>
      expect(root.querySelector('.puzzle-detail h2')?.textContent).toBe('Black chariot drop mate'),
    );
    expect(window.location.pathname).toBe(`/puzzles/${blackDrop.id}`);
  });

  it('restores solved markers from local storage', async () => {
    const drop = MINI_XIANGQI_PUZZLES.find(
      (puzzle) => puzzle.id === 'drop-mini-xiangqi-red-chariot-drop-mate-1',
    )!;
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) =>
        key === 'mistboard:puzzles:solved' ? JSON.stringify([drop.id]) : null,
      ),
      setItem: vi.fn(),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/puzzles') return json({ puzzles: [publicSummary(drop)] });
        if (url === `/api/puzzles/${drop.id}`) return json({ puzzle: publicDetail(drop) });
        return json({ error: 'not_found' }, 404);
      }),
    );
    const root = document.createElement('div');

    await mountPuzzles(root, drop.id);

    expect(root.querySelector('.puzzle-current-card')?.textContent).toContain('Solved');
    expect(root.querySelector('.puzzles-sidebar')?.textContent).not.toContain(' / ');
  });

  it('drags a Drop Mini reserve piece onto the board to solve', async () => {
    const drop = MINI_XIANGQI_PUZZLES.find(
      (puzzle) => puzzle.id === 'drop-mini-xiangqi-red-chariot-drop-mate-1',
    )!;
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/puzzles') return json({ puzzles: [publicSummary(drop)] });
      if (url === `/api/puzzles/${drop.id}`) return json({ puzzle: publicDetail(drop) });
      if (url === `/api/puzzles/${drop.id}/attempt`) {
        expect(JSON.parse(String(init?.body))).toEqual({
          moves: [{ drop: 'chariot', to: 'd4' }],
        });
        return json({
          attempt: attemptMiniXiangqiPuzzleLine(drop, [{ drop: 'chariot', to: 'd4' }]),
        });
      }
      return json({ error: 'not_found' }, 404);
    });
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');
    document.body.append(root);

    await mountPuzzles(root, drop.id);
    vi.spyOn(document, 'elementFromPoint').mockImplementation(
      () => root.querySelector('[data-square="d4"]') as Element,
    );
    root
      .querySelector<HTMLButtonElement>('[data-drop="chariot"]')
      ?.dispatchEvent(pointerEvent('pointerdown', 10, 10));
    document.dispatchEvent(pointerEvent('pointermove', 24, 24));
    document.dispatchEvent(pointerEvent('pointerup', 24, 24));

    await vi.waitFor(() => expect(root.textContent).toContain('Solved.'));
    expect(fetchSpy).toHaveBeenCalledWith(
      `/api/puzzles/${drop.id}/attempt`,
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

function pointerEvent(type: string, clientX: number, clientY: number): MouseEvent {
  return new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY });
}

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
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

function stubWindowLocalStorage(storage: Storage): void {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage,
  });
}
