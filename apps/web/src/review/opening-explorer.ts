// Opening explorer: what a corpus of real games played from the position on the
// board. Lives in the review underboard, beside Computer analysis.
//
// It takes kernel state rather than a FEN string so it can derive BOTH the
// lookup key and the move labels from one source, in the reader's chosen
// notation. That also keeps the engine's FEN dialect ('w' for red) out of a
// lookup keyed on the position dialect ('r'), which would silently miss.
//
// Honesty rules, since these numbers get read as authority:
//   - the corpus line is always shown, never implied;
//   - games with no recorded result are counted and labelled, not dropped;
//   - a position with no games says so plainly instead of rendering an empty
//     table that looks like a loading failure.

import './opening-explorer.css';
import {
  formatXiangqiMove,
  standardXiangqiPositionKey,
  type XiangqiGameState,
  type XiangqiMove,
} from '@mistboard/game';
import { currentXiangqiNotationStyle, xiangqiNotationChangedEvent } from '../xiangqi-notation.js';

type ExplorerMove = {
  from: string;
  to: string;
  games: number;
  redWins: number;
  blackWins: number;
  draws: number;
  unknowns: number;
  sampleGameIds: string[];
};

type ExplorerResponse = {
  position: string;
  total: number;
  moves: ExplorerMove[];
  build: { gameCount: number; maxPly: number; sources: string[]; builtAt: string } | null;
};

export type OpeningExplorer = {
  el: HTMLElement;
  /** Point the panel at a position; null clears it. Safe to call on every navigation. */
  setState(state: XiangqiGameState | null): void;
  /**
   * Whether the panel is on screen. It starts INACTIVE and queries nothing until
   * told otherwise: the underboard opens on Computer analysis, so a reader who
   * never opens this tab would otherwise spend one request per ply scrubbed on a
   * panel they never see. Activating catches up to the current position.
   */
  setActive(active: boolean): void;
};

const MAX_ROWS = 12;
/** Below this many decided games the result bar is shown, but de-emphasized. */
const MIN_DECIDED_FOR_BAR = 5;

export function createOpeningExplorer(): OpeningExplorer {
  const el = document.createElement('div');
  el.className = 'opening-explorer';

  const status = document.createElement('p');
  status.className = 'opening-explorer__status';
  status.textContent = 'Loading opening statistics...';

  const table = document.createElement('div');
  table.className = 'opening-explorer__table';

  const corpus = document.createElement('p');
  corpus.className = 'opening-explorer__corpus';

  el.append(status, table, corpus);

  // Cache by position key: scrubbing a game walks the same positions repeatedly,
  // and the corpus only changes on a rebuild.
  const cache = new Map<string, ExplorerResponse>();
  let currentKey: string | null = null;
  let currentState: XiangqiGameState | null = null;
  let inFlight: AbortController | null = null;
  let active = false;
  // The position we would be showing if we were on screen. While inactive the
  // panel keeps tracking the board but does no work; activating renders this.
  let pendingState: XiangqiGameState | null = null;

  function setActive(next: boolean): void {
    if (active === next) return;
    active = next;
    if (!active) {
      // Nothing in flight can matter to a panel nobody is looking at.
      inFlight?.abort();
      return;
    }
    const state = pendingState;
    pendingState = null;
    if (state) show(state);
  }

  function setState(state: XiangqiGameState | null): void {
    if (!active) {
      pendingState = state;
      return;
    }
    show(state);
  }

  function show(state: XiangqiGameState | null): void {
    currentState = state;
    if (!state) {
      currentKey = null;
      render(null);
      return;
    }
    const key = standardXiangqiPositionKey(state);
    if (key === currentKey) return;
    currentKey = key;

    const cached = cache.get(key);
    if (cached) {
      render(cached);
      return;
    }
    // A superseded request must never paint over a newer position.
    inFlight?.abort();
    const controller = new AbortController();
    inFlight = controller;
    status.hidden = false;
    status.textContent = 'Loading opening statistics...';
    table.replaceChildren();
    void fetchExplorer(key, controller.signal).then((data) => {
      if (controller.signal.aborted || currentKey !== key) return;
      if (data) cache.set(key, data);
      render(data);
    });
  }

  function render(data: ExplorerResponse | null): void {
    table.replaceChildren();
    if (!data) {
      status.hidden = false;
      status.textContent = 'Opening statistics are unavailable.';
      corpus.textContent = '';
      return;
    }
    corpus.textContent = corpusLabel(data);
    if (data.moves.length === 0) {
      status.hidden = false;
      status.textContent = 'No corpus games reached this position.';
      return;
    }
    status.hidden = true;
    const style = currentXiangqiNotationStyle();
    for (const row of data.moves.slice(0, MAX_ROWS)) {
      table.append(moveRow(row, data.total, currentState, style));
    }
  }

  // Notation is a reader preference that can change while the panel is open.
  if (typeof window !== 'undefined') {
    window.addEventListener(xiangqiNotationChangedEvent, () => {
      const cached = currentKey ? cache.get(currentKey) : null;
      if (cached) render(cached);
    });
  }

  return { el, setState, setActive };
}

function moveRow(
  row: ExplorerMove,
  total: number,
  state: XiangqiGameState | null,
  style: ReturnType<typeof currentXiangqiNotationStyle>,
): HTMLElement {
  const el = document.createElement('div');
  el.className = 'opening-explorer__row';

  const label = document.createElement('span');
  label.className = 'opening-explorer__move';
  label.textContent = moveLabel(row, state, style);

  const count = document.createElement('span');
  count.className = 'opening-explorer__count';
  count.textContent = formatGames(row.games);
  // `total` is the sum of the move counts, which is the right denominator for a
  // move's share but is NOT a distinct-game count: a game that returns to this
  // position and varies appears under both moves. Word it as what it is.
  count.title = `${row.games} games played this move, of ${total} recorded from this position`;

  const bar = document.createElement('span');
  bar.className = 'opening-explorer__bar';
  // Decided games only: an unknown result says nothing about who was better,
  // so it must not be silently drawn as a draw.
  const decided = row.redWins + row.blackWins + row.draws;
  // A full-width bar off two games looks exactly like one off four hundred. Past
  // the first few plies most positions are this thin, so de-emphasize the bar
  // below the threshold rather than letting a 100% block read as a result.
  if (decided > 0 && decided < MIN_DECIDED_FOR_BAR) {
    bar.classList.add('opening-explorer__bar--thin');
    bar.title = `Only ${decided} decided ${decided === 1 ? 'game' : 'games'}: too few to read as a score`;
  }
  if (decided > 0) {
    for (const [kind, value] of [
      ['red', row.redWins],
      ['draw', row.draws],
      ['black', row.blackWins],
    ] as const) {
      if (value === 0) continue;
      const part = document.createElement('span');
      part.className = `opening-explorer__bar-part opening-explorer__bar-part--${kind}`;
      part.style.width = `${((value / decided) * 100).toFixed(1)}%`;
      part.title = `${kind === 'draw' ? 'Draws' : kind === 'red' ? 'Red wins' : 'Black wins'}: ${value}`;
      bar.append(part);
    }
  } else {
    bar.classList.add('opening-explorer__bar--unknown');
    bar.title = 'No recorded results';
  }

  el.append(label, count, bar);
  return el;
}

function moveLabel(
  row: ExplorerMove,
  state: XiangqiGameState | null,
  style: ReturnType<typeof currentXiangqiNotationStyle>,
): string {
  const move = { from: row.from, to: row.to } as XiangqiMove;
  if (!state) return `${row.from}${row.to}`;
  return formatXiangqiMove(state, move, style);
}

function formatGames(games: number): string {
  if (games >= 1000) return `${(games / 1000).toFixed(1)}k`;
  return String(games);
}

function corpusLabel(data: ExplorerResponse): string {
  if (!data.build) return '';
  const games = data.build.gameCount.toLocaleString('en-US');
  return `${games} corpus games, first ${data.build.maxPly} plies.`;
}

async function fetchExplorer(
  positionKey: string,
  signal: AbortSignal,
): Promise<ExplorerResponse | null> {
  try {
    const response = await fetch(`/api/xiangqi/explorer?fen=${encodeURIComponent(positionKey)}`, {
      signal,
    });
    if (!response.ok) return null;
    return explorerResponse(await response.json());
  } catch {
    return null;
  }
}

/**
 * A 200 is not a promise about the body. An edge error page, a proxy, or a
 * changed API can all answer 200 with something that is not an explorer
 * payload; reading it optimistically throws inside the render and takes the
 * whole panel down. Validate the shape, and treat anything else as
 * unavailable.
 */
function explorerResponse(value: unknown): ExplorerResponse | null {
  if (typeof value !== 'object' || value === null) return null;
  const data = value as Partial<ExplorerResponse>;
  if (!Array.isArray(data.moves)) return null;
  if (typeof data.total !== 'number') return null;
  return {
    position: typeof data.position === 'string' ? data.position : '',
    total: data.total,
    moves: data.moves.filter(
      (move): move is ExplorerMove =>
        typeof move?.from === 'string' &&
        typeof move?.to === 'string' &&
        typeof move?.games === 'number',
    ),
    build: data.build ?? null,
  };
}
