import {
  createInitialMiniXiangqiBoard,
  type MiniXiangqiColor,
  type MiniXiangqiPieceRole,
  type MiniXiangqiPlayerView,
} from '@mistboard/game';
import { miniXiangqiPieceGhostSvg } from './live-mini-xiangqi-render.js';
import type { ReplayPaneHandle } from './replay-board.js';

const CAPTURE_ORDER: MiniXiangqiPieceRole[] = ['chariot', 'cannon', 'horse', 'soldier', 'general'];

export type MiniXiangqiCaptureSet = Record<MiniXiangqiColor, MiniXiangqiPieceRole[]>;

function rolesFromBoard(
  board: ReturnType<typeof createInitialMiniXiangqiBoard>,
  color: MiniXiangqiColor,
): MiniXiangqiPieceRole[] {
  return Object.values(board)
    .filter((piece) => piece?.color === color)
    .map((piece) => piece.role);
}

const INITIAL_BOARD = createInitialMiniXiangqiBoard();
const INITIAL_RED = rolesFromBoard(INITIAL_BOARD, 'red');
const INITIAL_BLACK = rolesFromBoard(INITIAL_BOARD, 'black');

function truthRoles(
  view: MiniXiangqiPlayerView | null,
  color: MiniXiangqiColor,
): MiniXiangqiPieceRole[] {
  if (!view) return color === 'red' ? INITIAL_RED : INITIAL_BLACK;
  const roles: MiniXiangqiPieceRole[] = [];
  for (const entry of Object.values(view.board)) {
    if (entry && 'piece' in entry && entry.piece.color === color) roles.push(entry.piece.role);
  }
  return roles;
}

function capturedRoles(
  initial: MiniXiangqiPieceRole[],
  current: MiniXiangqiPieceRole[],
): MiniXiangqiPieceRole[] {
  const remaining = new Map<MiniXiangqiPieceRole, number>();
  for (const role of current) remaining.set(role, (remaining.get(role) ?? 0) + 1);
  const out: MiniXiangqiPieceRole[] = [];
  for (const role of initial) {
    const left = remaining.get(role) ?? 0;
    if (left > 0) remaining.set(role, left - 1);
    else out.push(role);
  }
  return out;
}

export function miniXiangqiCapturesFromTruthView(
  truth: MiniXiangqiPlayerView | null,
): MiniXiangqiCaptureSet {
  return {
    red: capturedRoles(INITIAL_BLACK, truthRoles(truth, 'black')),
    black: capturedRoles(INITIAL_RED, truthRoles(truth, 'red')),
  };
}

function captureRow(roles: MiniXiangqiPieceRole[], color: MiniXiangqiColor): HTMLElement | null {
  if (roles.length === 0) return null;
  const row = document.createElement('div');
  row.className = 'captures-row mini-xq-captures-row';
  const sorted = [...roles].sort((a, b) => CAPTURE_ORDER.indexOf(a) - CAPTURE_ORDER.indexOf(b));
  for (const role of sorted) {
    const span = document.createElement('span');
    span.className = 'mini-xq-capture-piece';
    span.setAttribute('aria-label', `${color} ${role}`);
    span.innerHTML = miniXiangqiPieceGhostSvg({ color, role });
    row.append(span);
  }
  return row;
}

function setCaptures(
  target: HTMLElement,
  roles: MiniXiangqiPieceRole[],
  color: MiniXiangqiColor,
): void {
  const row = captureRow(roles, color);
  target.replaceChildren(...(row ? [row] : []));
  target.classList.toggle('has-captures', roles.length > 0);
}

export function renderMiniXiangqiPaneCaptureSplit(
  pane: ReplayPaneHandle,
  captures: MiniXiangqiCaptureSet,
  bottomColor: MiniXiangqiColor,
): void {
  const topColor: MiniXiangqiColor = bottomColor === 'red' ? 'black' : 'red';
  setCaptures(pane.topCapturesEl, captures[topColor], bottomColor);
  setCaptures(pane.capturesEl, captures[bottomColor], topColor);
}
