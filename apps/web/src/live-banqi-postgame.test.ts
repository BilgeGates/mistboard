import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { banqiResultLabel } from './banqi-result-label.js';
import { banqiPostgameApiUrl, mountBanqiPostgame } from './live-banqi-postgame.js';

describe('banqiResultLabel translates the seat-keyed result to the bound ink', () => {
  // The reported bug: a game black-ink-wins (red side eaten), but the recorded
  // result is seat-keyed 'red-wins' (the first-mover seat survived) and the
  // notification read "Red wins" because the first-mover seat owns the black ink.
  it('maps the winning SEAT to its flip-bound ink', () => {
    // First-mover ('red') seat flipped black → owns black ink.
    expect(banqiResultLabel('red-wins', 'black')).toBe('Black wins');
    expect(banqiResultLabel('black-wins', 'black')).toBe('Red wins');
    // First-mover seat flipped red → seat == ink (the existing common case).
    expect(banqiResultLabel('red-wins', 'red')).toBe('Red wins');
    expect(banqiResultLabel('black-wins', 'red')).toBe('Black wins');
  });

  it('keeps draws ink-agnostic and falls back to move order before the flip binds', () => {
    expect(banqiResultLabel('draw', 'red')).toBe('Draw');
    expect(banqiResultLabel('red-wins', null)).toBe('First wins');
    expect(banqiResultLabel('black-wins', null)).toBe('Second wins');
  });
});

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

  it('renders a single review board, info rail, and two-ply move rows', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(postgameFixture()));
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');

    mountBanqiPostgame(root, 'bq_postgame');
    await flushPromises();

    expect(fetchSpy).toHaveBeenCalledWith('/api/banqi/games/bq_postgame');
    // Single clean left rail (meta card + spectator room) — no action buttons.
    expect(root.textContent).toContain('Spectator room');
    expect(root.textContent).toContain('Half Xiangqi');
    expect(root.textContent).toContain('Red wins');
    expect(root.querySelector('.game-meta-card')).not.toBeNull();
    expect(root.textContent).not.toContain('Play again');
    // Exactly one board (banqi is symmetric — no per-seat split).
    expect(root.querySelectorAll('.banqi-board')).toHaveLength(1);

    // The shared move list shows two plies per row: a numbered row whose left cell
    // (the first ply, `firstMover: 'a'`) holds the first mover's move.
    const row = root.querySelector('.review-move-list__row');
    expect(row).not.toBeNull();
    expect(row?.querySelector('.review-move-list__number')?.textContent).toBe('1');
    const firstMove = row?.querySelector<HTMLButtonElement>('.review-move-list__move');
    expect(firstMove?.querySelector('.review-move-list__san')?.textContent).toBe('c2-c3');
    expect(root.textContent).toContain('Ply 1 of 1');
  });

  it('hides unflipped tiles by default and reveals them on toggle', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(postgameFixture()));
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');

    mountBanqiPostgame(root, 'bq_postgame');
    await flushPromises();

    const board = () => root.querySelector('.banqi-postgame-board') as HTMLElement;
    // Default (as-played): Black's still-face-down tile on d3 renders as a neutral
    // back, never as an identified black horse.
    expect(board().innerHTML).toContain('banqi-back');
    expect(board().innerHTML).not.toContain('aria-label="black horse"');

    const reveal = [...root.querySelectorAll<HTMLButtonElement>('button')].find(
      (el) => el.textContent === 'Reveal tiles',
    );
    expect(reveal).not.toBeUndefined();
    reveal!.click();

    // Revealed: the black horse on d3 now renders with its glyph; the button flips.
    expect(reveal!.textContent).toBe('Hide tiles');
    expect(board().innerHTML).toContain('aria-label="black horse"');
  });

  it('steps through plies with the arrow keys', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(postgameFixture()));
    vi.stubGlobal('fetch', fetchSpy);
    const root = document.createElement('div');

    mountBanqiPostgame(root, 'bq_postgame');
    await flushPromises();

    const meta = () => root.querySelector('.review-scrubber__status')?.textContent ?? '';
    expect(meta()).toContain('Ply 1 of 1');

    // The shared review layout binds the keyboard on the mount root.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(meta()).toContain('Ply 0 of 1');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(meta()).toContain('Ply 1 of 1');
  });
});

function postgameFixture() {
  // Red chariot c2 -> c3 (a quiet step). The black horse on d3 stays face-down in
  // the as-played ('truth') history but is unmasked in the 'revealed' overlay that
  // the Reveal toggle swaps in. Black resigns.
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
    view: revealedView('bq_postgame_truth', 1),
    history: {
      // As-played: d3 stays a face-down back; only c2->c3 (a revealed chariot) moves.
      truth: [maskedSnapshot('bq_t0', 0), maskedSnapshot('bq_t1', 1)],
      // Spoiler overlay: every face-down identity (the d3 horse) unmasked per ply.
      revealed: [revealedSnapshot('bq_r0', 0), revealedSnapshot('bq_r1', 1)],
    },
  };
}

const finished = { type: 'finished', winner: 'red', reason: 'resignation' } as const;
const playing = { type: 'playing', turn: 'black' } as const;

function maskedView(id: string, ply: number) {
  return {
    id,
    perspective: 'red',
    board:
      ply === 0
        ? { c2: { color: 'red', role: 'chariot', faceDown: false }, d3: { faceDown: true } }
        : { c3: { color: 'red', role: 'chariot', faceDown: false }, d3: { faceDown: true } },
    legalMoves: [],
    captured: [],
    status: ply === 0 ? playing : finished,
    ply,
    firstColor: 'red',
    moveNumber: 1,
    lastMove: ply === 0 ? undefined : { from: 'c2', to: 'c3' },
  };
}

function revealedView(id: string, ply: number) {
  return {
    id,
    perspective: 'red',
    board: {
      c3: { color: 'red', role: 'chariot', faceDown: false },
      d3: { color: 'black', role: 'horse', faceDown: false },
    },
    legalMoves: [],
    captured: [],
    status: finished,
    ply,
    firstColor: 'red',
    moveNumber: 1,
    lastMove: { from: 'c2', to: 'c3' },
  };
}

function revealedSnapshot(id: string, ply: number) {
  return { ply, view: revealedView(id, ply) };
}

function maskedSnapshot(id: string, ply: number) {
  return { ply, view: maskedView(id, ply) };
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
