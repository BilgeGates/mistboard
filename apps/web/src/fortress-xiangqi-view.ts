import {
  FORTRESS_DROP_ROLES,
  type FortressXiangqiBoardMove,
  type FortressXiangqiColor,
  type FortressXiangqiDropRole,
  type FortressXiangqiMove,
  type FortressXiangqiPlayerView,
  type FortressXiangqiSquare,
  isFortressXiangqiDropMove,
} from '@mistboard/game';
import { renderFortressXiangqiPieceInline } from './fortress-xiangqi-render.js';
import { readStoredXiangqiPieceSet } from './xiangqi-appearance-storage.js';

export function fortressXiangqiBoardMoves(
  view: FortressXiangqiPlayerView,
  from?: FortressXiangqiSquare | null,
): FortressXiangqiBoardMove[] {
  return view.legalMoves.filter(
    (move): move is FortressXiangqiBoardMove =>
      !isFortressXiangqiDropMove(move) &&
      (from === undefined || from === null || move.from === from),
  );
}

export function fortressXiangqiDropTargets(
  view: FortressXiangqiPlayerView,
  role: FortressXiangqiDropRole | null,
): FortressXiangqiSquare[] {
  if (!role) return [];
  return view.legalMoves
    .filter((move) => isFortressXiangqiDropMove(move) && move.drop === role)
    .map((move) => (move as { to: FortressXiangqiSquare }).to);
}

const DROP_ROLE_LETTER: Record<FortressXiangqiDropRole, string> = {
  chariot: 'R',
  horse: 'N',
  cannon: 'C',
  soldier: 'P',
  treasure: 'T',
  advisor: 'A',
  elephant: 'E',
};

export function fortressXiangqiMoveLabel(move: FortressXiangqiMove): string {
  if (isFortressXiangqiDropMove(move)) return `${DROP_ROLE_LETTER[move.drop]}@${move.to}`;
  return `${move.from}-${move.to}`;
}

export function fillFortressXiangqiReserve(
  host: HTMLElement,
  view: FortressXiangqiPlayerView,
  owner: FortressXiangqiColor,
  options: {
    interactive?: boolean;
    selectedRole?: FortressXiangqiDropRole | null;
    onSelect?(role: FortressXiangqiDropRole): void;
  } = {},
): void {
  // Reuse the shared drop-mini reserve styling for a consistent pocket look.
  host.classList.add('drop-mini-reserve-strip');
  host
    .closest<HTMLElement>('.board-shell, .replay-pane')
    ?.classList.add('drop-mini-reserve-container');
  host.replaceChildren();
  const entries = FORTRESS_DROP_ROLES.map((role) => ({
    role,
    count: view.hands[owner][role] ?? 0,
  })).filter((entry) => entry.count > 0);
  host.classList.toggle('has-captures', entries.length > 0);
  if (entries.length === 0) return;

  const pieceSet = readStoredXiangqiPieceSet();
  const row = document.createElement('div');
  row.className = 'drop-mini-reserve-row';
  for (const entry of entries) {
    const tile = options.interactive
      ? document.createElement('button')
      : document.createElement('span');
    tile.className = [
      'drop-mini-reserve-piece',
      entry.count > 1 ? 'has-count' : '',
      options.selectedRole === entry.role ? 'selected' : '',
    ]
      .filter(Boolean)
      .join(' ');
    if (tile instanceof HTMLButtonElement) {
      tile.type = 'button';
      tile.dataset.drop = entry.role;
      tile.setAttribute('aria-grabbed', options.selectedRole === entry.role ? 'true' : 'false');
      tile.addEventListener('click', () => options.onSelect?.(entry.role));
    }
    tile.setAttribute('aria-label', `${owner} ${entry.role} x${entry.count}`);
    tile.innerHTML = renderFortressXiangqiPieceInline({ color: owner, role: entry.role }, pieceSet);
    if (entry.count > 1) tile.append(countBadge(entry.count));
    row.append(tile);
  }
  host.append(row);
}

function countBadge(count: number): HTMLElement {
  const badge = document.createElement('span');
  badge.className = 'captures-count-badge';
  badge.textContent = String(count);
  return badge;
}
