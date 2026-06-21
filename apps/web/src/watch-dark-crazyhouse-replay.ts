import type {
  Color,
  CrazyhouseDropRole,
  CrazyhouseHand,
  CrazyhousePlayerView,
} from '@mistboard/game';
import {
  CRAZYHOUSE_HAND_ORDER,
  crazyhouseHandPieceSvg,
  renderCrazyhouseBoardSvg,
} from './crazyhouse-render.js';
import './live-dark-crazyhouse.css';
import './dark-crazyhouse-postgame.css';
import {
  type DarkCrazyhousePostgameResponse,
  type DarkCrazyhousePostgameViewKey,
  loadDarkCrazyhousePostgame,
  postgameReplayMaxPly,
  postgameViewAtPly,
  postgameViewEntries,
} from './dark-crazyhouse-postgame.js';
import type { ReplayHandle } from './replay.js';
import type { ReplayPaneHandle } from './replay-board.js';
import {
  type FogTriptychWatchOptions,
  mountFogTriptychWatchReplay,
} from './watch-fog-triptych-replay.js';

export type DarkCrazyhouseWatchReplayOptions = FogTriptychWatchOptions;

function paneKind(key: DarkCrazyhousePostgameViewKey): 'white' | 'truth' | 'black' {
  if (key === 'white') return 'white';
  if (key === 'black') return 'black';
  return 'truth';
}

function resultLabel(result: string): string {
  if (result === 'white-wins') return 'White wins';
  if (result === 'black-wins') return 'Black wins';
  return 'Draw';
}

function resultChipKind(result: string): 'white' | 'black' | 'draw' {
  if (result === 'white-wins') return 'white';
  if (result === 'black-wins') return 'black';
  return 'draw';
}

function handForColorAtPly(
  postgame: DarkCrazyhousePostgameResponse,
  color: Color,
  ply: number,
): CrazyhouseHand {
  const history = postgame.history?.[color];
  if (history && history.length > 0) {
    let selected = history[0] ?? null;
    for (const snapshot of history) {
      if (snapshot.ply > ply) break;
      selected = snapshot;
    }
    if (selected) return selected.view.hand;
  }
  return postgame.views?.[color]?.hand ?? {};
}

function reservePiece(role: CrazyhouseDropRole, color: Color, count: number): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'dczh-postgame__reserve-piece';
  wrap.innerHTML = crazyhouseHandPieceSvg(role, color);
  const badge = document.createElement('span');
  badge.className = 'dczh-postgame__reserve-count';
  badge.textContent = String(count);
  wrap.append(badge);
  return wrap;
}

function renderReserve(
  host: HTMLElement,
  color: Color,
  ply: number,
  postgame: DarkCrazyhousePostgameResponse,
  revealed: readonly Color[],
): void {
  host.classList.add('dczh-postgame__reserve');
  if (!revealed.includes(color)) {
    const note = document.createElement('span');
    note.className = 'dczh-postgame__reserve-empty';
    note.textContent = 'hidden';
    host.append(note);
    return;
  }
  const hand = handForColorAtPly(postgame, color, ply);
  const entries = CRAZYHOUSE_HAND_ORDER.filter((role) => (hand[role] ?? 0) > 0);
  if (entries.length === 0) {
    const note = document.createElement('span');
    note.className = 'dczh-postgame__reserve-empty';
    note.textContent = '(no pieces in hand)';
    host.append(note);
    return;
  }
  for (const role of entries) {
    host.append(reservePiece(role, color, hand[role] ?? 0));
  }
}

function renderCaptures(args: {
  pane: ReplayPaneHandle;
  bottomColor: Color;
  topColor: Color;
  key: DarkCrazyhousePostgameViewKey;
  ply: number;
  postgame: DarkCrazyhousePostgameResponse;
}): void {
  const revealed: readonly Color[] =
    args.key === 'truth' ? ['white', 'black'] : [args.key as Color];
  renderReserve(args.pane.topCapturesEl, args.topColor, args.ply, args.postgame, revealed);
  renderReserve(args.pane.capturesEl, args.bottomColor, args.ply, args.postgame, revealed);
}

export function mountDarkCrazyhouseWatchReplay(
  root: HTMLElement,
  roomId: string,
  options: DarkCrazyhouseWatchReplayOptions,
): Promise<ReplayHandle> {
  return mountFogTriptychWatchReplay<
    DarkCrazyhousePostgameResponse,
    CrazyhousePlayerView,
    DarkCrazyhousePostgameViewKey,
    Color
  >(root, roomId, options, {
    firstColor: 'white',
    firstLabel: 'White',
    secondColor: 'black',
    secondLabel: 'Black',
    boardClass: 'crazyhouse-live-board',
    installStyles: () => {},
    loadPostgame: loadDarkCrazyhousePostgame,
    maxPly: postgameReplayMaxPly,
    viewEntries: postgameViewEntries,
    viewAtPly: postgameViewAtPly,
    paneKind,
    renderBoard: (view, orientation, key) =>
      renderCrazyhouseBoardSvg(view, { perspective: orientation, showFog: key !== 'truth' }),
    renderCaptures,
    resultChipKind,
    resultLabel,
  });
}
