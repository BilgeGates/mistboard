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
};

const MAX_ROWS = 12;

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

  function setState(state: XiangqiGameState | null): void {
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

  return { el, setState };
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
  count.title = `${row.games} of ${total} games from this position`;

  const bar = document.createElement('span');
  bar.className = 'opening-explorer__bar';
  // Decided games only: an unknown result says nothing about who was better,
  // so it must not be silently drawn as a draw.
  const decided = row.redWins + row.blackWins + row.draws;
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
