import {
  applyStandardXiangqiMove,
  createInitialXiangqiState,
  type XiangqiMove,
} from '@mistboard/game';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOpeningExplorer } from './opening-explorer.js';

const START_KEY = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR r';

describe('opening explorer', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it('looks up the position key, not an engine-dialect FEN', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(payload()));
    vi.stubGlobal('fetch', fetchSpy);

    const explorer = createOpeningExplorer();
    document.body.append(explorer.el);
    explorer.setActive(true);
    explorer.setState(createInitialXiangqiState('t'));
    await flushPromises();

    // The stored key spells red as 'r'. Passing the engine's 'w' dialect would
    // miss every row silently, so this pin is the contract with the API.
    expect(fetchSpy).toHaveBeenCalledWith(
      `/api/xiangqi/explorer?fen=${encodeURIComponent(START_KEY)}`,
      expect.anything(),
    );
  });

  it('renders each move with its share of decided games', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(payload())),
    );

    const explorer = createOpeningExplorer();
    document.body.append(explorer.el);
    explorer.setActive(true);
    explorer.setState(createInitialXiangqiState('t'));
    await flushPromises();

    const rows = [...explorer.el.querySelectorAll('.opening-explorer__row')];
    expect(rows).toHaveLength(2);
    expect(rows[0]?.querySelector('.opening-explorer__count-games')?.textContent).toBe('7');
    // 6 red wins + 1 black win = 7 decided, so red takes 85.7% of the bar.
    const redPart = rows[0]?.querySelector<HTMLElement>('.opening-explorer__bar-part--red');
    expect(redPart?.style.width).toBe('85.7%');
    expect(explorer.el.textContent).toContain('10 games');
  });

  it('says a position is unplayed instead of rendering an empty table', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ position: START_KEY, total: 0, moves: [], topGames: [], build: null }),
      ),
    );

    const explorer = createOpeningExplorer();
    document.body.append(explorer.el);
    explorer.setActive(true);
    explorer.setState(createInitialXiangqiState('t'));
    await flushPromises();

    expect(explorer.el.textContent).toContain('No corpus games reached this position');
    expect(explorer.el.querySelectorAll('.opening-explorer__row')).toHaveLength(0);
  });

  it('treats a 200 that is not an explorer payload as unavailable', async () => {
    // A proxy or edge error page can answer 200 with anything. Reading it
    // optimistically used to throw inside render and take the panel down.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ lines: [], canPost: true })),
    );

    const explorer = createOpeningExplorer();
    document.body.append(explorer.el);
    explorer.setActive(true);
    explorer.setState(createInitialXiangqiState('t'));
    await flushPromises();

    expect(explorer.el.textContent).toContain('Opening statistics are unavailable');
    expect(explorer.el.querySelectorAll('.opening-explorer__row')).toHaveLength(0);
  });

  it('does not refetch a position it is already showing', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(payload()));
    vi.stubGlobal('fetch', fetchSpy);

    const explorer = createOpeningExplorer();
    document.body.append(explorer.el);
    explorer.setActive(true);
    const start = createInitialXiangqiState('t');
    explorer.setState(start);
    await flushPromises();
    // Scrubbing back and forth revisits positions constantly; each revisit must
    // be free, not another request.
    explorer.setState(start);
    explorer.setState(start);
    await flushPromises();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('follows the board to a new position', async () => {
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(payload()),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const explorer = createOpeningExplorer();
    document.body.append(explorer.el);
    explorer.setActive(true);
    const start = createInitialXiangqiState('t');
    explorer.setState(start);
    await flushPromises();
    explorer.setState(applyStandardXiangqiMove(start, { from: 'h3', to: 'e3' } as XiangqiMove));
    await flushPromises();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[1]?.[0])).not.toContain(encodeURIComponent(START_KEY));
  });

  it('queries nothing until its tab is on screen', async () => {
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(payload()),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const explorer = createOpeningExplorer();
    document.body.append(explorer.el);
    // The underboard opens on Computer analysis, so this is the common case:
    // a reader scrubs a whole game and never opens the explorer.
    const start = createInitialXiangqiState('t');
    explorer.setState(start);
    explorer.setState(applyStandardXiangqiMove(start, { from: 'h3', to: 'e3' } as XiangqiMove));
    await flushPromises();

    expect(fetchSpy).not.toHaveBeenCalled();

    // Opening the tab catches up to wherever the board now is, in one request.
    explorer.setActive(true);
    await flushPromises();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[0])).not.toContain(encodeURIComponent(START_KEY));
  });

  it('de-emphasizes a result bar backed by too few decided games', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          position: START_KEY,
          total: 2,
          moves: [
            {
              from: 'h3',
              to: 'e3',
              games: 2,
              redWins: 2,
              blackWins: 0,
              draws: 0,
              unknowns: 0,
            },
          ],
          build: null,
        }),
      ),
    );

    const explorer = createOpeningExplorer();
    document.body.append(explorer.el);
    explorer.setActive(true);
    explorer.setState(createInitialXiangqiState('t'));
    await flushPromises();

    // 2 decided games would otherwise render an unqualified 100% red bar.
    const bar = explorer.el.querySelector('.opening-explorer__bar');
    expect(bar?.classList.contains('opening-explorer__bar--thin')).toBe(true);
  });
  it('lists top games by rating and plays a clicked move', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(payload())),
    );
    const played: XiangqiMove[] = [];

    const explorer = createOpeningExplorer();
    explorer.onPlayMove((move) => played.push(move));
    document.body.append(explorer.el);
    explorer.setActive(true);
    explorer.setState(createInitialXiangqiState('t'));
    await flushPromises();

    const top = [...explorer.el.querySelectorAll('.opening-explorer__top-row')];
    expect(top).toHaveLength(2);
    expect(top[0]?.textContent).toContain('2400');

    // The explorer is a navigation surface: a row click plays its move.
    explorer.el.querySelector<HTMLButtonElement>('.opening-explorer__row')?.click();
    expect(played).toEqual([{ from: 'h3', to: 'e3' }]);
  });

  it('shows the share of games each move took', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(payload())),
    );

    const explorer = createOpeningExplorer();
    document.body.append(explorer.el);
    explorer.setActive(true);
    explorer.setState(createInitialXiangqiState('t'));
    await flushPromises();

    const shares = [...explorer.el.querySelectorAll('.opening-explorer__count-share')].map(
      (el) => el.textContent,
    );
    expect(shares).toEqual(['70%', '30%']);
  });
});

function payload() {
  return {
    position: START_KEY,
    total: 10,
    moves: [
      {
        from: 'h3',
        to: 'e3',
        games: 7,
        redWins: 6,
        blackWins: 1,
        draws: 0,
        unknowns: 0,
      },
      {
        from: 'b3',
        to: 'e3',
        games: 3,
        redWins: 0,
        blackWins: 0,
        draws: 0,
        unknowns: 3,
      },
    ],
    topGames: [
      { id: 'hxq_top', rating: 2400, result: '1-0', playedOn: '2026-03-06' },
      { id: 'hxq_next', rating: 1200, result: '0-1', playedOn: '2026-02-01' },
    ],
    build: {
      gameCount: 10,
      maxPly: 24,
      sources: ['elephantchess-pvp'],
      builtAt: '2026-07-23T00:00:00.000Z',
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}
