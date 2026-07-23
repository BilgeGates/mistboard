// Opening explorer: what a corpus of real games played from the position on the
// board. Opens over the right rail from the book tool in the control bar, next
// to the scrub buttons — it is a NAVIGATION surface (click a move to play it),
// so it belongs beside the move list rather than in the underboard's static
// reference tabs.
//
// It takes kernel state rather than a FEN string so it can derive BOTH the
// lookup key and the move labels from one source, in the reader's chosen
// notation. That also keeps the engine's FEN dialect ('w' for red) out of a
// lookup keyed on the position dialect ('r'), which would silently miss.
//
// Honesty rules, since these numbers get read as authority:
//   - the corpus line is always shown, never implied;
//   - games with no recorded result are counted and labelled, not dropped;
//   - a result bar backed by too few decided games is de-emphasized, so a 100%
//     block off two games cannot read as a verdict;
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
};

type ExplorerSample = {
  id: string;
  rating: number | null;
  redRating: number | null;
  blackRating: number | null;
  result: string;
  playedOn: string | null;
};

type ExplorerOpening = { en: string; zh: string };

type ExplorerResponse = {
  position: string;
  opening: ExplorerOpening | null;
  total: number;
  moves: ExplorerMove[];
  topGames: ExplorerSample[];
  build: { gameCount: number; maxPly: number; sources: string[]; builtAt: string } | null;
};

export type OpeningExplorer = {
  el: HTMLElement;
  /** Point the panel at a position; null clears it. Safe to call on every navigation. */
  setState(state: XiangqiGameState | null): void;
  /**
   * Whether the panel is open. It starts CLOSED and queries nothing until opened:
   * otherwise every reader scrubbing a game would spend one request per ply on a
   * panel they never looked at. Opening catches up to the current position.
   */
  setActive(active: boolean): void;
  /** Play a move the reader clicked in the table. */
  onPlayMove(handler: (move: XiangqiMove) => void): void;
  /** Fires as the reader hovers a move row (the move, or null on leave), so the
   *  board can preview it. */
  onHoverMove(handler: (move: XiangqiMove | null) => void): void;
};

const MAX_ROWS = 12;
/** Below this many decided games the result bar is shown, but de-emphasized. */
const MIN_DECIDED_FOR_BAR = 5;
const TOP_GAMES_SHOWN = 5;
/** Narrower than this and a percentage inside a bar band is noise, not data. */
const MIN_BAND_PERCENT_FOR_LABEL = 18;

export function createOpeningExplorer(): OpeningExplorer {
  const el = document.createElement('section');
  el.className = 'opening-explorer';
  el.setAttribute('aria-label', 'Opening explorer');

  const head = document.createElement('div');
  head.className = 'opening-explorer__head';
  const title = document.createElement('span');
  title.className = 'opening-explorer__title';
  title.textContent = 'Opening explorer';
  const corpus = document.createElement('span');
  corpus.className = 'opening-explorer__corpus';
  head.append(title, corpus);

  const columns = document.createElement('div');
  columns.className = 'opening-explorer__columns';
  for (const [label, className] of [
    ['Move', 'move'],
    ['Games', 'count'],
    ['Red / Draw / Black', 'bar'],
  ] as const) {
    const cell = document.createElement('span');
    cell.className = `opening-explorer__col opening-explorer__col--${className}`;
    cell.textContent = label;
    columns.append(cell);
  }

  const status = document.createElement('p');
  status.className = 'opening-explorer__status';
  status.textContent = 'Loading opening statistics...';

  const table = document.createElement('div');
  table.className = 'opening-explorer__table';

  const topGames = document.createElement('div');
  topGames.className = 'opening-explorer__top';

  // Named header: the opening the CURRENT position is (lichess anatomy). Hidden
  // until a position resolves to a name; most positions have none.
  const opening = document.createElement('div');
  opening.className = 'opening-explorer__opening';
  opening.hidden = true;

  el.append(head, opening, columns, status, table, topGames);

  const cache = new Map<string, ExplorerResponse>();
  let currentKey: string | null = null;
  let currentState: XiangqiGameState | null = null;
  let inFlight: AbortController | null = null;
  let active = false;
  let pendingState: XiangqiGameState | null = null;
  let playMove: ((move: XiangqiMove) => void) | null = null;
  let hoverMove: ((move: XiangqiMove | null) => void) | null = null;

  function setActive(next: boolean): void {
    if (active === next) return;
    active = next;
    el.hidden = !active;
    if (!active) {
      inFlight?.abort();
      hoverMove?.(null); // closing the book must not strand a hover arrow
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
    inFlight?.abort();
    const controller = new AbortController();
    inFlight = controller;
    status.hidden = false;
    status.textContent = 'Loading opening statistics...';
    table.replaceChildren();
    topGames.replaceChildren();
    void fetchExplorer(key, controller.signal).then((data) => {
      if (controller.signal.aborted || currentKey !== key) return;
      if (data) cache.set(key, data);
      render(data);
    });
  }

  function render(data: ExplorerResponse | null): void {
    table.replaceChildren();
    topGames.replaceChildren();
    if (!data) {
      status.hidden = false;
      status.textContent = 'Opening statistics are unavailable.';
      corpus.textContent = '';
      renderOpening(opening, null);
      return;
    }
    renderOpening(opening, data.opening);
    corpus.textContent = corpusLabel(data);
    if (data.moves.length === 0) {
      status.hidden = false;
      // Past the folded depth every position is unplayed, which is a fact about
      // the corpus rather than a failure; say which it is.
      status.textContent = 'No corpus games reached this position.';
      return;
    }
    status.hidden = true;
    const style = currentXiangqiNotationStyle();
    for (const row of data.moves.slice(0, MAX_ROWS)) {
      table.append(
        moveRow(row, data.total, currentState, style, {
          play: (move) => playMove?.(move),
          hover: (move) => hoverMove?.(move),
        }),
      );
    }
    if (data.topGames.length > 0) topGames.append(topGamesBlock(data.topGames));
  }

  if (typeof window !== 'undefined') {
    window.addEventListener(xiangqiNotationChangedEvent, () => {
      const cached = currentKey ? cache.get(currentKey) : null;
      if (cached) render(cached);
    });
  }

  el.hidden = true;
  return {
    el,
    setState,
    setActive,
    onPlayMove(handler) {
      playMove = handler;
    },
    onHoverMove(handler) {
      hoverMove = handler;
    },
  };
}

function moveRow(
  row: ExplorerMove,
  total: number,
  state: XiangqiGameState | null,
  style: ReturnType<typeof currentXiangqiNotationStyle>,
  handlers: { play: (move: XiangqiMove) => void; hover: (move: XiangqiMove | null) => void },
): HTMLElement {
  const move = { from: row.from, to: row.to } as XiangqiMove;
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'opening-explorer__row';

  const label = document.createElement('span');
  label.className = 'opening-explorer__move';
  label.textContent = state ? formatXiangqiMove(state, move, style) : `${row.from}${row.to}`;

  const count = document.createElement('span');
  count.className = 'opening-explorer__count';
  const share = total > 0 ? Math.round((row.games / total) * 100) : 0;
  count.append(
    textSpan('opening-explorer__count-games', formatGames(row.games)),
    textSpan('opening-explorer__count-share', `${share}%`),
  );
  // `total` is the sum of the move counts, the right denominator for a share but
  // not a distinct-game census: a game that revisits this position and varies is
  // counted under both moves.
  count.title = `${row.games} games played this move, of ${total} recorded from this position`;

  const bar = document.createElement('span');
  bar.className = 'opening-explorer__bar';
  const decided = row.redWins + row.blackWins + row.draws;
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
      const percent = (value / decided) * 100;
      const part = document.createElement('span');
      part.className = `opening-explorer__bar-part opening-explorer__bar-part--${kind}`;
      part.style.width = `${percent.toFixed(1)}%`;
      part.title = `${kind === 'draw' ? 'Draws' : kind === 'red' ? 'Red wins' : 'Black wins'}: ${value}`;
      if (percent >= MIN_BAND_PERCENT_FOR_LABEL) part.textContent = `${Math.round(percent)}%`;
      bar.append(part);
    }
  } else {
    bar.classList.add('opening-explorer__bar--unknown');
    bar.title = 'No recorded results';
  }

  el.append(label, count, bar);
  el.addEventListener('click', () => handlers.play(move));
  el.addEventListener('mouseenter', () => handlers.hover(move));
  el.addEventListener('mouseleave', () => handlers.hover(null));
  return el;
}

// A single side's rating, marked as the winner when its result matches. An
// unrated corpus shows a dash rather than a blank so the "vs" still reads.
function ratingSpan(rating: number | null, won: boolean): HTMLElement {
  const el = document.createElement('span');
  el.className = won
    ? 'opening-explorer__top-rating opening-explorer__top-rating--won'
    : 'opening-explorer__top-rating';
  el.textContent = rating === null ? '–' : String(rating);
  return el;
}

function resultLabel(result: string): string {
  if (result === '1-0') return 'Red won';
  if (result === '0-1') return 'Black won';
  if (result === '1/2-1/2') return 'Draw';
  return '–';
}

function topGamesBlock(samples: ExplorerSample[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'opening-explorer__top-inner';
  const heading = document.createElement('p');
  heading.className = 'opening-explorer__top-heading';
  heading.textContent = 'Top games';
  wrap.append(heading);

  for (const sample of samples.slice(0, TOP_GAMES_SHOWN)) {
    const row = document.createElement('a');
    row.className = 'opening-explorer__top-row';
    // Corpus games live at the historical review route; the live /xiangqi/game/
    // route is for rooms and 404s these ids. Unlisted corpus games are viewable
    // by direct id (the server serves anything not private here).
    row.href = `/historical-xiangqi/game/${encodeURIComponent(sample.id)}`;

    // The corpus is anonymized, so the two RATINGS are the identity on offer —
    // "1008 vs 992" says far more than a lone averaged number. The winning side
    // is emphasised so the row reads as a game, not two loose figures.
    const matchup = document.createElement('span');
    matchup.className = 'opening-explorer__top-matchup';
    const redRating = ratingSpan(sample.redRating, sample.result === '1-0');
    const black = ratingSpan(sample.blackRating, sample.result === '0-1');
    const vs = document.createElement('span');
    vs.className = 'opening-explorer__top-vs';
    vs.textContent = 'vs';
    matchup.append(redRating, vs, black);

    const result = document.createElement('span');
    result.className = 'opening-explorer__top-result';
    result.textContent = resultLabel(sample.result);
    const played = document.createElement('span');
    played.className = 'opening-explorer__top-date';
    played.textContent = sample.playedOn ? sample.playedOn.slice(0, 7) : '';
    row.append(matchup, result, played);
    wrap.append(row);
  }
  return wrap;
}

function renderOpening(el: HTMLElement, name: ExplorerOpening | null): void {
  if (!name) {
    el.hidden = true;
    el.replaceChildren();
    return;
  }
  el.hidden = false;
  el.replaceChildren(
    textSpan('opening-explorer__opening-en', name.en),
    textSpan('opening-explorer__opening-zh', name.zh),
  );
}

function textSpan(className: string, text: string): HTMLElement {
  const el = document.createElement('span');
  el.className = className;
  el.textContent = text;
  return el;
}

function formatGames(games: number): string {
  if (games >= 1000) return `${(games / 1000).toFixed(1)}k`;
  return String(games);
}

function corpusLabel(data: ExplorerResponse): string {
  if (!data.build) return '';
  return `${data.build.gameCount.toLocaleString('en-US')} games`;
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
 * whole panel down. Validate the shape, and treat anything else as unavailable.
 */
function explorerResponse(value: unknown): ExplorerResponse | null {
  if (typeof value !== 'object' || value === null) return null;
  const data = value as Partial<ExplorerResponse>;
  if (!Array.isArray(data.moves)) return null;
  if (typeof data.total !== 'number') return null;
  return {
    position: typeof data.position === 'string' ? data.position : '',
    opening:
      data.opening && typeof data.opening.en === 'string' && typeof data.opening.zh === 'string'
        ? { en: data.opening.en, zh: data.opening.zh }
        : null,
    total: data.total,
    moves: data.moves.filter(
      (move): move is ExplorerMove =>
        typeof move?.from === 'string' &&
        typeof move?.to === 'string' &&
        typeof move?.games === 'number',
    ),
    topGames: Array.isArray(data.topGames)
      ? data.topGames.filter((game): game is ExplorerSample => typeof game?.id === 'string')
      : [],
    build: data.build ?? null,
  };
}
