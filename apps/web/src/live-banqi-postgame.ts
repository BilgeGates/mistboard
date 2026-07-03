import type {
  BanqiColor,
  BanqiGameStatus,
  BanqiMove,
  BanqiPlayerView,
  BanqiSeat,
} from '@mistboard/game';
import './live-xiangqi.css';
import './landing.css';
import './game-route.css';
import { banqiResultLabel, seatInkLabel } from './banqi-result-label.js';
import { banqiEnabled } from './feature-flags.js';
import { fillCapturedPool } from './live-banqi.js';
import { installBanqiBoardStyles, renderBanqiBoardSvg } from './live-banqi-render.js';
import { createPane } from './replay-board.js';
import { createShareButton } from './replay-meta.js';
import { mountReviewLayout } from './review/review-layout.js';
import { buildNav } from './site-shell.js';

// Postgame review for banqi. Banqi is SYMMETRIC-information: a face-down tile is
// hidden from both seats equally, so there is a single review board (no per-seat
// split). The shared review layout owns the shell, scrubber, keyboard, flip, and
// viewport-fill sizing; this module supplies the board host + move list and a
// Reveal toggle (button / `h`) that swaps the as-played masked replay ('truth'
// history) for the spoiler overlay ('revealed' history, every face-down identity
// unmasked at that ply).

export type BanqiPostgameViewKey = BanqiColor | 'truth' | 'revealed';

export type BanqiPostgameResponse = {
  game: {
    roomId: string;
    variant: 'banqi';
    mode: string;
    result: string;
    termination: string;
    plyCount: number;
    startedAt: string;
    endedAt: string;
    rated: boolean;
    visibility: string;
    initialMs: number | null;
    incrementMs: number | null;
  };
  state: {
    status: BanqiGameStatus;
    moveNumber: number;
    clock?: unknown;
    timeControl?: { initialMs: number; incrementMs: number };
  };
  timeline: Array<{
    type: string;
    at: number;
    color?: BanqiColor;
    move?: BanqiMove;
    ply?: number;
    winner?: BanqiColor;
    reason?: string;
  }>;
  view: BanqiPlayerView;
  views?: Partial<Record<BanqiPostgameViewKey, BanqiPlayerView>>;
  history?: Partial<Record<BanqiPostgameViewKey, Array<{ ply: number; view: BanqiPlayerView }>>>;
};

type BanqiMoveEntry = { move: BanqiMove; ply: number; color: BanqiSeat };

type LoadResult =
  | { ok: true; postgame: BanqiPostgameResponse }
  | { ok: false; status: number; error: string };

export function mountBanqiPostgame(root: HTMLElement, roomId: string): void {
  root.classList.add('landing-page', 'game-route');
  installBanqiBoardStyles();
  root.replaceChildren(buildNav(), loadingView());
  if (!banqiEnabled()) {
    renderError(root, 'Banqi unavailable', 'This route is not enabled in this build.');
    return;
  }
  void loadBanqiPostgame(roomId)
    .then((result) => {
      if (result.ok) {
        renderPostgame(root, result.postgame);
        return;
      }
      renderError(root, errorTitle(result.status), errorBody(result));
    })
    .catch(() => {
      renderError(root, 'Postgame unavailable', 'The game could not be loaded.');
    });
}

export async function loadBanqiPostgame(roomId: string): Promise<LoadResult> {
  const response = await fetch(banqiPostgameApiUrl(roomId));
  if (!response.ok) {
    const body = await safeJson(response);
    return {
      ok: false,
      status: response.status,
      error: typeof body?.error === 'string' ? body.error : 'request_failed',
    };
  }
  return {
    ok: true,
    postgame: (await response.json()) as BanqiPostgameResponse,
  };
}

export function banqiPostgameApiUrl(roomId: string): string {
  const url = new URL(`/api/banqi/games/${encodeURIComponent(roomId)}`, window.location.href);
  return url.pathname;
}

function renderPostgame(root: HTMLElement, postgame: BanqiPostgameResponse): void {
  const pane = createPane('', 'truth', true, 'split');
  pane.boardEl.classList.add('banqi-postgame-board', 'banqi-live-board');

  const moves: BanqiMoveEntry[] = postgame.timeline
    .filter(
      (entry): entry is typeof entry & { move: BanqiMove; ply: number; color: BanqiSeat } =>
        entry.type === 'move-played' &&
        !!entry.move &&
        typeof entry.ply === 'number' &&
        !!entry.color,
    )
    .map((entry) => ({ move: entry.move, ply: entry.ply, color: entry.color }));

  const movesCard = document.createElement('section');
  movesCard.className = 'review-moves-card';
  const movesHeading = document.createElement('h2');
  movesHeading.className = 'review-moves-card__title';
  movesHeading.textContent = 'Moves';
  const moveList = document.createElement('ol');
  moveList.className = 'move-list';
  movesCard.append(movesHeading, moveList);

  // Default to the as-played board: unflipped tiles show as face-down backs, the
  // way the position actually looked. The toggle (button / `h`) reveals the deal.
  let revealed = false;
  let lastCtx: { ply: number; flipped: boolean } | null = null;

  const revealBtn = document.createElement('button');
  revealBtn.type = 'button';
  revealBtn.className = 'review-action-link';
  revealBtn.textContent = 'Reveal tiles';
  revealBtn.setAttribute('aria-pressed', 'false');
  revealBtn.title = 'Toggle face-down tile identities (h)';

  const paintBoard = (ctx: { ply: number; flipped: boolean }): void => {
    const orientation: BanqiColor = ctx.flipped ? 'black' : 'red';
    // Reveal on → 'revealed' (every face-down identity). Reveal off → 'truth'
    // (the as-played mask). Banqi is symmetric, so both seats render the identical
    // board; only the masking differs.
    const viewKey: BanqiPostgameViewKey = revealed ? 'revealed' : 'truth';
    const view =
      postgameViewAtPly(postgame, viewKey, ctx.ply) ??
      postgameViewAtPly(postgame, 'truth', ctx.ply) ??
      postgame.view;
    pane.boardEl.innerHTML = renderBanqiBoardSvg(view, orientation, {});
    renderCapturedPools(pane.topCapturesEl, pane.capturesEl, view, orientation);
  };

  const toggleReveal = (): void => {
    revealed = !revealed;
    revealBtn.textContent = revealed ? 'Hide tiles' : 'Reveal tiles';
    revealBtn.setAttribute('aria-pressed', String(revealed));
    if (lastCtx) paintBoard(lastCtx);
  };
  revealBtn.onclick = toggleReveal;

  root.replaceChildren(buildNav());
  // The shared review layout binds its playback keys on `document`; the reveal
  // toggle joins them there (typing targets are ignored, like the layout does).
  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.isContentEditable ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT')
    ) {
      return;
    }
    if (event.key === 'h' || event.key === 'H') {
      event.preventDefault();
      toggleReveal();
    }
  });

  mountReviewLayout(root, {
    pageClassName: 'banqi-review',
    ariaLabel: 'Banqi postgame',
    title: 'Banqi',
    summary: `${banqiResultLabel(postgame.game.result, postgame.view.firstColor)} by ${labelize(postgame.game.termination)} · ${postgame.game.plyCount} plies`,
    actions: banqiActions(postgame, revealBtn),
    moves: movesCard,
    boards: [{ key: 'truth', el: pane.el, tier: 'primary' }],
    boardAspect: 568 / 312,
    maxPly: postgameReplayMaxPly(postgame),
    renderBoards(ctx) {
      lastCtx = { ply: ctx.ply, flipped: ctx.flipped };
      paintBoard(lastCtx);
    },
    renderMoves({ ply }, jump) {
      renderMoveRows(moveList, moves, ply, postgame.view.firstColor, jump);
    },
  });
}

function banqiActions(postgame: BanqiPostgameResponse, revealBtn: HTMLButtonElement): HTMLElement {
  const actions = document.createElement('div');
  actions.className = 'review-actions';
  const share = createShareButton();
  const home = reviewActionLink('Home', '/');
  const room = reviewActionLink('Room', `/room/${encodeURIComponent(postgame.game.roomId)}`);
  actions.append(revealBtn, share, home, room);
  return actions;
}

function reviewActionLink(label: string, href: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'review-action-link';
  link.href = href;
  link.textContent = label;
  return link;
}

// Lichess convention: a player's captured material sits next to that player. The
// bottom strip is the viewer's side (orientation), so it shows what the viewer
// captured (the opponent's lost pieces); the top strip shows what the opponent
// captured (the viewer's lost pieces). fillCapturedPool filters by former owner.
function renderCapturedPools(
  top: HTMLElement,
  bottom: HTMLElement,
  view: BanqiPlayerView,
  orientation: BanqiColor,
): void {
  top.replaceChildren();
  bottom.replaceChildren();
  const opponent = oppositeBanqiColor(orientation);
  fillCapturedPool(top, view.captured, orientation);
  fillCapturedPool(bottom, view.captured, opponent);
}

function oppositeBanqiColor(color: BanqiColor): BanqiColor {
  return color === 'red' ? 'black' : 'red';
}

// Banqi is symmetric, so the review reduces to the single truth surface. Exported
// for the watch-replay surface to reuse the per-ply view selection, mirroring the
// jieqi postgame module's exported helpers.
export function postgameViewEntries(
  postgame: BanqiPostgameResponse,
): Array<{ key: BanqiPostgameViewKey; label: string; view: BanqiPlayerView }> {
  return [{ key: 'truth', label: 'Server truth', view: postgame.view }];
}

export function postgameReplayMaxPly(postgame: BanqiPostgameResponse): number {
  const history = Object.values(postgame.history ?? {}).flat();
  return Math.max(postgame.game.plyCount, ...history.map((snapshot) => snapshot.ply), 0);
}

export function postgameViewAtPly(
  postgame: BanqiPostgameResponse,
  key: BanqiPostgameViewKey,
  ply: number,
): BanqiPlayerView | null {
  const history = postgame.history?.[key];
  if (!history || history.length === 0) return null;
  let selected = history[0] ?? null;
  for (const snapshot of history) {
    if (snapshot.ply > ply) break;
    selected = snapshot;
  }
  return selected?.view ?? null;
}

// Two ply per row (one full move): the first-mover seat takes the left cell, the
// second-mover seat the right, keyed by ply parity (ply 1 is the first mover).
function renderMoveRows(
  list: HTMLOListElement,
  moves: BanqiMoveEntry[],
  activePly: number,
  firstColor: BanqiColor | null,
  onJump: (ply: number) => void,
): void {
  list.replaceChildren();
  if (moves.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'move-row move-empty';
    empty.textContent = 'No moves';
    list.append(empty);
    return;
  }
  const byPly = new Map<number, BanqiMoveEntry>();
  for (const move of moves) byPly.set(move.ply, move);
  const maxPly = Math.max(...moves.map((move) => move.ply));
  const fullMoves = Math.ceil(maxPly / 2);
  for (let moveNumber = 1; moveNumber <= fullMoves; moveNumber += 1) {
    const row = document.createElement('li');
    row.className = 'move-row';
    const number = document.createElement('span');
    number.className = 'move-number';
    number.textContent = String(moveNumber);
    row.append(
      number,
      moveCell(
        byPly.get(moveNumber * 2 - 1),
        'white',
        moveNumber * 2 - 1,
        activePly,
        firstColor,
        onJump,
      ),
      moveCell(byPly.get(moveNumber * 2), 'black', moveNumber * 2, activePly, firstColor, onJump),
    );
    list.append(row);
  }
  scrollActiveMoveIntoView(list);
}

function moveCell(
  entry: BanqiMoveEntry | undefined,
  cell: 'white' | 'black',
  ply: number,
  activePly: number,
  firstColor: BanqiColor | null,
  onJump: (ply: number) => void,
): HTMLElement {
  if (!entry) {
    const empty = document.createElement('span');
    empty.className = `${cell}-ply move-empty`;
    return empty;
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `${cell}-ply${activePly === ply ? ' active' : ''}`;
  button.textContent = moveLabel(entry.move);
  button.title = `${seatInkLabel(entry.color, firstColor)} ply ${ply}: ${moveLabel(entry.move)}`;
  button.onclick = () => onJump(ply);
  return button;
}

function scrollActiveMoveIntoView(list: HTMLOListElement): void {
  window.requestAnimationFrame(() => {
    const active = list.querySelector<HTMLButtonElement>('button.active');
    if (!active) return;
    const listRect = list.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const centeredDelta =
      activeRect.top - listRect.top - (list.clientHeight - activeRect.height) / 2;
    list.scrollTo({ top: Math.max(0, list.scrollTop + centeredDelta), behavior: 'auto' });
  });
}

// A flip (self-move) reads as the flipped square; a board move as from-to.
function moveLabel(move: BanqiMove): string {
  return move.from === move.to ? `${move.from} flip` : `${move.from}-${move.to}`;
}

export function banqiInitialPlyFromSearch(search: string): number | null {
  const raw = new URLSearchParams(search).get('ply');
  if (raw === null || !/^\d+$/.test(raw)) return null;
  return Number.parseInt(raw, 10);
}

function loadingView(): HTMLElement {
  const shell = document.createElement('main');
  shell.className = 'game-shell';
  const heading = document.createElement('h1');
  heading.textContent = 'Loading game';
  shell.append(heading);
  return shell;
}

function renderError(root: HTMLElement, titleText: string, bodyText: string): void {
  const shell = document.createElement('main');
  shell.className = 'game-shell';
  const title = document.createElement('h1');
  title.textContent = titleText;
  const body = document.createElement('p');
  body.textContent = bodyText;
  shell.append(title, body);
  root.replaceChildren(buildNav(), shell);
}

function errorTitle(status: number): string {
  if (status === 404) return 'Game not found';
  if (status === 503) return 'Postgame unavailable';
  return 'Postgame unavailable';
}

function errorBody(result: Extract<LoadResult, { ok: false }>): string {
  if (result.status === 404) return 'This Banqi game is not available.';
  if (result.status === 503) return 'The postgame service is not available.';
  return result.error;
}

async function safeJson(response: Response): Promise<{ error?: unknown } | null> {
  try {
    return (await response.json()) as { error?: unknown };
  } catch {
    return null;
  }
}

function labelize(value: string): string {
  return value.split('-').filter(Boolean).map(capitalize).join(' ');
}

function capitalize(value: string): string {
  if (!value) return value;
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
