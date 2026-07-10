import type { XiangqiMove } from '@mistboard/game';
import './game-shell.css';
import './live-xiangqi.css';
import './dark-xiangqi-postgame.css';
import './xiangqi-postgame.css';
import {
  type HistoricalXiangqiResult,
  historicalXiangqiOutcomeLabel,
  historicalXiangqiReviewUrl,
} from './historical-xiangqi-search.js';
import { createGameMetaCard } from './review/game-meta-card.js';
import { mountXiangqiReview } from './review/xiangqi-review.js';
import { buildXiangqiReplayFromMoves, type XiangqiReplay } from './review/xiangqi-review-model.js';
import { buildNav } from './site-shell.js';

export type HistoricalXiangqiGameDetail = {
  id: string;
  sourceId: string;
  sourceGameId: string | null;
  sourceUrl: string | null;
  eventName: string | null;
  site: string | null;
  round: string | null;
  board: string | null;
  playedOn: string | null;
  redNameRaw: string | null;
  blackNameRaw: string | null;
  result: HistoricalXiangqiResult;
  termination: string | null;
  plyCount: number;
  moveFormat: string;
  moves: XiangqiMove[];
  tags: Record<string, unknown>;
  qualityFlags: string[];
  visibility: string;
};

type LoadResult =
  | { ok: true; game: HistoricalXiangqiGameDetail }
  | { ok: false; status: number; error: string };

export function mountHistoricalXiangqiPostgame(root: HTMLElement, gameId: string): void {
  root.classList.add('landing-page', 'xiangqi-postgame-route');
  root.replaceChildren(buildNav(), loadingView());
  void loadHistoricalXiangqiGame(gameId)
    .then((result) => {
      if (result.ok) {
        renderHistoricalXiangqiGame(root, result.game);
        return;
      }
      renderError(root, errorTitle(result.status), errorBody(result));
    })
    .catch(() => {
      renderError(root, 'Game unavailable', 'The historical game could not be loaded.');
    });
}

export async function loadHistoricalXiangqiGame(gameId: string): Promise<LoadResult> {
  const response = await fetch(historicalXiangqiGameApiUrl(gameId), {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    const body = await safeJson(response);
    return {
      ok: false,
      status: response.status,
      error: typeof body?.error === 'string' ? body.error : 'request_failed',
    };
  }
  const body = (await response.json()) as { game: HistoricalXiangqiGameDetail };
  return { ok: true, game: body.game };
}

export function historicalXiangqiGameApiUrl(gameId: string): string {
  const url = new URL(
    `/api/historical-xiangqi/games/${encodeURIComponent(gameId)}`,
    window.location.href,
  );
  return url.pathname;
}

function renderHistoricalXiangqiGame(root: HTMLElement, game: HistoricalXiangqiGameDetail): void {
  const replay = buildXiangqiReplayFromMoves(game.moves);
  const metaCard = createGameMetaCard({
    glyph: '象',
    headline: ['Historical game'],
    variantName: 'Elephant Chess',
    subline: [formatDate(game.playedOn), game.eventName].filter(Boolean).join(' · '),
    players: [
      { color: 'red', name: game.redNameRaw ?? 'Red' },
      { color: 'black', name: game.blackNameRaw ?? 'Black' },
    ],
    status: resultStatus(game),
  });

  root.replaceChildren(buildNav());
  mountXiangqiReview(root, {
    pageClassName: 'xiangqi-review',
    ariaLabel: 'Historical Xiangqi game review',
    title: 'Xiangqi game',
    summary: `${resultStatus(game)} · ${replay.maxPly} plies`,
    boardAriaLabel: 'Xiangqi board',
    actions: historicalActions(game),
    metaCard: metaCard.el,
    details: historicalDetails(game, replay),
    moves: replay.moves,
    analysis: null,
  });
}

function historicalActions(game: HistoricalXiangqiGameDetail): HTMLElement {
  const actions = document.createElement('nav');
  actions.className = 'dxq-postgame__actions';
  actions.setAttribute('aria-label', 'Historical game links');

  const search = document.createElement('a');
  search.className = 'dxq-postgame__link dxq-postgame__link--primary';
  search.href = '/historical-xiangqi/games';
  search.textContent = 'Search games';
  actions.append(search);

  const permalink = document.createElement('a');
  permalink.className = 'dxq-postgame__link';
  permalink.href = historicalXiangqiReviewUrl(game.id);
  permalink.textContent = 'Permalink';
  actions.append(permalink);

  if (game.sourceUrl) {
    const source = document.createElement('a');
    source.className = 'dxq-postgame__link';
    source.href = game.sourceUrl;
    source.rel = 'noreferrer';
    source.textContent = 'Source';
    actions.append(source);
  }
  return actions;
}

function historicalDetails(game: HistoricalXiangqiGameDetail, replay: XiangqiReplay): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'dxq-postgame__panel';
  const heading = document.createElement('h2');
  heading.textContent = 'Archive';
  const details = document.createElement('dl');
  details.className = 'dxq-postgame__details';
  addDetail(details, 'Date', formatDate(game.playedOn));
  addDetail(details, 'Event', game.eventName ?? 'Unknown');
  addDetail(details, 'Site', game.site ?? 'Unknown');
  addDetail(details, 'Round', game.round ?? 'Unknown');
  addDetail(details, 'Format', game.moveFormat);
  if (replay.illegalAt) {
    addDetail(
      details,
      'Import',
      `Truncated at ply ${replay.illegalAt.ply}: ${replay.illegalAt.move.from}-${replay.illegalAt.move.to}`,
    );
  }
  if (game.qualityFlags.length > 0) addDetail(details, 'Flags', game.qualityFlags.join(', '));
  panel.append(heading, details);
  return panel;
}

function addDetail(details: HTMLElement, label: string, value: string): void {
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = value;
  details.append(dt, dd);
}

function loadingView(): HTMLElement {
  const shell = document.createElement('main');
  shell.className = 'dxq-postgame__notice';
  const heading = document.createElement('h1');
  heading.textContent = 'Loading game';
  shell.append(heading);
  return shell;
}

function renderError(root: HTMLElement, titleText: string, bodyText: string): void {
  const shell = document.createElement('main');
  shell.className = 'dxq-postgame__error';
  const title = document.createElement('h1');
  title.textContent = titleText;
  const body = document.createElement('p');
  body.textContent = bodyText;
  shell.append(title, body);
  root.replaceChildren(buildNav(), shell);
}

function errorTitle(status: number): string {
  if (status === 404) return 'Game not found';
  if (status === 503) return 'Archive unavailable';
  return 'Archive unavailable';
}

function errorBody(result: Extract<LoadResult, { ok: false }>): string {
  if (result.status === 404) return 'This historical Xiangqi game is not available.';
  if (result.status === 503) return 'The historical game archive is not available.';
  return result.error;
}

async function safeJson(response: Response): Promise<{ error?: unknown } | null> {
  try {
    return (await response.json()) as { error?: unknown };
  } catch {
    return null;
  }
}

function resultStatus(game: HistoricalXiangqiGameDetail): string {
  const result = historicalXiangqiOutcomeLabel(game.result);
  return game.termination ? `${result} by ${labelize(game.termination)}` : result;
}

function formatDate(value: string | null): string {
  if (!value) return 'Unknown date';
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function labelize(value: string): string {
  return value.split('-').filter(Boolean).map(capitalize).join(' ');
}

function capitalize(value: string): string {
  if (!value) return value;
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
