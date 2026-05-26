import type { Color, PieceRole, PlayerView, Square } from '@mistboard/game';
import type { CaptureTally } from './captures.js';
import { captureRow } from './live-captures.js';
import type { LiveRefs } from './live-state.js';
import { currentCaptures, currentDevViews } from './live-view.js';
import { files, oppositeColor, ranks } from './web-utils.js';

type DevViewRefs = Pick<LiveRefs, 'devViews' | 'devViewsSection'>;

export function renderDevViews(refs: DevViewRefs): void {
  const views = currentDevViews();
  refs.devViews.replaceChildren();
  refs.devViewsSection.hidden = views === null;
  if (!views) return;

  const tally = currentCaptures();
  refs.devViews.append(
    devViewCard('Player view', views.player, tally, [views.player.perspective]),
    devViewCard(`${capitalize(views.opponent)} view`, views.opponentView, tally, [views.opponent]),
    devViewCard('True view', views.truth, tally, ['white', 'black']),
  );
}

function devViewCard(
  label: string,
  view: PlayerView,
  tally: CaptureTally,
  capturingColors: Color[],
): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'dev-view-card';

  const title = document.createElement('strong');
  title.textContent = label;

  const meta = document.createElement('span');
  meta.textContent = `${view.perspective} · ${view.status.type === 'playing' ? `${view.status.turn} to move` : view.status.type}`;

  const board = document.createElement('div');
  board.className = 'dev-board';
  board.setAttribute('aria-label', label);

  const visible = new Set(view.visibleSquares);
  const rankOrder = view.perspective === 'white' ? [...ranks].reverse() : [...ranks];
  const fileOrder = view.perspective === 'white' ? files : [...files].reverse();
  for (const rank of rankOrder) {
    for (const file of fileOrder) {
      const square = `${file}${rank}` as Square;
      const cell = document.createElement('span');
      const hidden = !visible.has(square);
      cell.className = [
        'dev-square',
        (fileOrdinal(file) + rank) % 2 === 0 ? 'dark' : 'light',
        hidden ? 'hidden' : '',
      ]
        .filter(Boolean)
        .join(' ');
      const piece = view.board[square];
      cell.textContent = piece && !hidden ? pieceGlyphForRole(piece.role, piece.color) : '';
      board.append(cell);
    }
  }

  const captures = document.createElement('div');
  captures.className = 'dev-captures captures-strip';
  for (const color of capturingColors) {
    const row = captureRow(tally[color], oppositeColor(color));
    if (row) captures.append(row);
  }

  card.append(title, meta, board, captures);
  return card;
}

function fileOrdinal(file: (typeof files)[number]): number {
  return files.indexOf(file);
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function pieceGlyphForRole(role: PieceRole, color: Color): string {
  const labels = {
    white: {
      bishop: '♗',
      king: '♔',
      knight: '♘',
      pawn: '♙',
      queen: '♕',
      rook: '♖',
    },
    black: {
      bishop: '♝',
      king: '♚',
      knight: '♞',
      pawn: '♟',
      queen: '♛',
      rook: '♜',
    },
  } satisfies Record<Color, Record<PieceRole, string>>;
  return labels[color][role];
}
