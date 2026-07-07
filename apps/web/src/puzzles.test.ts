import {
  attemptMiniXiangqiPuzzleLine,
  DROP_MINI_XIANGQI_SPEC_ID,
  MINI_XIANGQI_PUZZLES,
  type MiniXiangqiPuzzle,
} from '@mistboard/game';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountPuzzles } from './puzzles.js';
import { xiangqiAppearanceChangedEvent } from './theme.js';

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
    // The variant picker now surfaces Fortress + Jungle, so it is shown. A direct
    // deep link into a Drop Mini puzzle (not in the picker) still resolves + renders.
    expect(root.querySelector('[data-puzzle-variant]')).not.toBeNull();
    expect(root.querySelector('.puzzles-sidebar')?.textContent).toContain('0 solved of 1');
    expect(root.querySelector('.puzzles-sidebar')?.textContent).not.toContain('All puzzles');
    expect(root.querySelector('.puzzles-sidebar')?.textContent).not.toContain(' / ');
    // The feedback title is deliberately generic (the puzzle title would spoil the piece).
    expect(root.querySelector('.puzzle-detail h2')?.textContent).toBe('Red to move');
    expect(root.querySelector('.mini-xq-board')).not.toBeNull();
    const boardShell = root.querySelector('.puzzle-board-shell');
    expect(boardShell).not.toBeNull();
    expect(boardShell?.querySelector('[aria-label="Top reserve"]')).not.toBeNull();
    expect(boardShell?.querySelector('[aria-label="Bottom reserve"]')).not.toBeNull();
    expect(boardShell?.querySelector('[data-drop="chariot"]')).not.toBeNull();
    expect(root.querySelector('.puzzle-reserves')).toBeNull();
    // The goal (mate depth) is hidden while solving so it doesn't spoil the move.
    expect(root.textContent).not.toContain('Mate in 1');
    expect(root.querySelector('.puzzle-moves h3')).toBeNull();
    expect(root.querySelector('.puzzle-move-black')?.textContent).toBe('...');
    expect(root.textContent).not.toContain('d4');
  });

  it('merges the practice note into the puzzle rating card', async () => {
    stubWindowLocalStorage(memoryStorage({ 'mistboard:puzzles:rated': 'false' }));
    const mini = MINI_XIANGQI_PUZZLES[0]!;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/puzzles') return json({ puzzles: [publicSummary(mini)] });
        if (url === `/api/puzzles/${mini.id}`) return json({ puzzle: publicDetail(mini) });
        return json({ error: 'not_found' }, 404);
      }),
    );
    const root = document.createElement('div');

    await mountPuzzles(root, mini.id);

    const ratingCard = root.querySelector('.puzzle-rating-card');
    expect(root.querySelector('.puzzle-rated-card')).toBeNull();
    expect(ratingCard?.querySelector<HTMLInputElement>('[data-puzzle-rated]')?.checked).toBe(false);
    expect(ratingCard?.textContent).toContain('Rated');
    expect(ratingCard?.textContent).toContain('Your puzzle rating will not change.');
    expect(ratingCard?.textContent).not.toContain('0 solved of 1');
  });

  it('re-renders the board when the xiangqi piece set changes live', async () => {
    stubWindowLocalStorage(memoryStorage({ 'mistboard.xiangqiPieceSet': 'animal-dobutsu' }));
    const mini = MINI_XIANGQI_PUZZLES[0]!;
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/puzzles') return json({ puzzles: [publicSummary(mini)] });
      if (url === `/api/puzzles/${mini.id}`) return json({ puzzle: publicDetail(mini) });
      return json({ error: 'not_found' }, 404);
    });
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');

    await mountPuzzles(root, mini.id);
    // Default (animal-dobutsu) renders image-based pieces.
    expect(root.querySelector('.mini-xq-piece image')).not.toBeNull();

    // Switch to a glyph-based set the way the appearance menu does, then notify.
    window.localStorage.setItem('mistboard.xiangqiPieceSet', 'traditional');
    window.dispatchEvent(new Event(xiangqiAppearanceChangedEvent));

    await vi.waitFor(() => expect(root.querySelector('.mini-xq-piece image')).toBeNull());
    expect(root.querySelector('.mini-xq-piece')).not.toBeNull();
  });

  // Skipped while only Fortress Xiangqi is surfaced (the variant picker is
  // hidden). Restore when more than one variant is unhidden.
  it.skip('filters the sequential queue with the variant picker', async () => {
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
          rated: true,
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

    await vi.waitFor(() => expect(root.textContent).toContain('Success!'));
    expect(root.querySelector('.puzzle-reserves')).toBeNull();
    expect(root.textContent).not.toContain('d5');
    expect(fetchSpy).toHaveBeenCalledWith(
      `/api/puzzles/${drop.id}/attempt`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('auto-plays opponent replies in multi-ply puzzles', async () => {
    const multi = MINI_XIANGQI_PUZZLES.find(
      (puzzle) => puzzle.id === 'mini-xiangqi-black-two-step-file-net-1',
    )!;
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/puzzles') return json({ puzzles: [publicSummary(multi)] });
      if (url === `/api/puzzles/${multi.id}`) return json({ puzzle: publicDetail(multi) });
      if (url === `/api/puzzles/${multi.id}/attempt`) {
        expect(init?.method).toBe('POST');
        const body = JSON.parse(String(init?.body));
        if (body.moves.length === 1) {
          expect(body).toEqual({ moves: [{ from: 'c5', to: 'd5' }], rated: true });
          return json({
            attempt: attemptMiniXiangqiPuzzleLine(multi, [{ from: 'c5', to: 'd5' }]),
          });
        }
        expect(body).toEqual({
          moves: [
            { from: 'c5', to: 'd5' },
            { from: 'f1', to: 'e1' },
          ],
          rated: true,
        });
        return json({
          attempt: attemptMiniXiangqiPuzzleLine(multi, [
            { from: 'c5', to: 'd5' },
            { from: 'f1', to: 'e1' },
          ]),
        });
      }
      return json({ error: 'not_found' }, 404);
    });
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');

    await mountPuzzles(root, multi.id);
    expect(root.textContent).not.toContain('Mate in 2');

    root
      .querySelector<SVGGElement>('[data-square="c5"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    root
      .querySelector<SVGGElement>('[data-square="d5"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await vi.waitFor(() => expect(root.textContent).toContain('Correct.'));
    expect(root.textContent).toContain('c5-d5');
    expect(root.textContent).toContain('e2-e3');
    expect(root.textContent).not.toContain('f1-e1');

    root
      .querySelector<SVGGElement>('[data-square="f1"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    root
      .querySelector<SVGGElement>('[data-square="e1"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await vi.waitFor(() => expect(root.textContent).toContain('Success!'));
    expect(root.textContent).toContain('f1-e1');
    expect(fetchSpy).toHaveBeenCalledWith(
      `/api/puzzles/${multi.id}/attempt`,
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
          rated: true,
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
    expect(root.querySelector<HTMLButtonElement>('[data-puzzle-next]')).toBeNull();
    expect(root.querySelector<HTMLButtonElement>('[data-puzzle-replay-next]')?.disabled).toBe(true);
    root.querySelector<HTMLButtonElement>('[data-drop="chariot"]')?.click();
    root
      .querySelector<SVGGElement>('[data-square="d4"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await vi.waitFor(() => expect(root.textContent).toContain('Success!'));
    expect(root.querySelector('.puzzle-current-card')?.textContent).toContain('Solved');
    expect(root.querySelector('.puzzles-sidebar')?.textContent).not.toContain(' / ');
    expect(root.querySelector<HTMLButtonElement>('[data-puzzle-replay-previous]')?.disabled).toBe(
      false,
    );
    expect(root.querySelector<HTMLButtonElement>('[data-puzzle-replay-next]')?.disabled).toBe(true);
    const nextButton = root.querySelector<HTMLButtonElement>('[data-puzzle-next]');
    expect(nextButton?.getAttribute('aria-label')).toBe('Continue training');
    expect(nextButton?.textContent).toBe('Continue training');
    expect(nextButton?.disabled).toBe(false);

    nextButton?.click();

    await vi.waitFor(() =>
      expect(root.querySelector('.puzzle-detail h2')?.textContent).toBe('Black to move'),
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
          rated: true,
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
      expect(root.querySelector('.puzzle-detail h2')?.textContent).toBe('Black to move'),
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
          rated: true,
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

    await vi.waitFor(() => expect(root.textContent).toContain('Success!'));
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
