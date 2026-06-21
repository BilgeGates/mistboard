import type { ShogiColor, ShogiHand, ShogiHandRole, ShogiPlayerView } from '@mistboard/game';
import './live-dark-shogi.css';
import './dark-shogi-postgame.css';
import {
  type DarkShogiPostgameResponse,
  type DarkShogiPostgameViewKey,
  loadDarkShogiPostgame,
  postgameReplayMaxPly,
  postgameViewAtPly,
  postgameViewEntries,
} from './dark-shogi-postgame.js';
import type { ReplayHandle } from './replay.js';
import type { ReplayPaneHandle } from './replay-board.js';
import { renderShogiBoardSvg, SHOGI_HAND_ORDER, shogiHandKomaSvg } from './shogi-render.js';
import {
  type FogTriptychWatchOptions,
  mountFogTriptychWatchReplay,
} from './watch-fog-triptych-replay.js';

export type DarkShogiWatchReplayOptions = FogTriptychWatchOptions;

function paneKind(key: DarkShogiPostgameViewKey): 'white' | 'truth' | 'black' {
  if (key === 'black') return 'black';
  if (key === 'white') return 'white';
  return 'truth';
}

function resultLabel(result: string): string {
  if (result === 'black-wins') return 'Black wins';
  if (result === 'white-wins') return 'White wins';
  return 'Draw';
}

function resultChipKind(result: string): 'white' | 'black' | 'draw' {
  if (result === 'white-wins') return 'white';
  if (result === 'black-wins') return 'black';
  return 'draw';
}

function handForColorAtPly(
  postgame: DarkShogiPostgameResponse,
  color: ShogiColor,
  ply: number,
): ShogiHand {
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

function reserveKoma(
  role: ShogiHandRole,
  color: ShogiColor,
  count: number,
  pointsUp: boolean,
): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'dsg-postgame__reserve-koma';
  wrap.innerHTML = shogiHandKomaSvg(role, color, pointsUp);
  const badge = document.createElement('span');
  badge.className = 'dsg-postgame__reserve-count';
  badge.textContent = String(count);
  wrap.append(badge);
  return wrap;
}

function renderReserve(
  host: HTMLElement,
  color: ShogiColor,
  ply: number,
  postgame: DarkShogiPostgameResponse,
  revealed: readonly ShogiColor[],
  pointsUp: boolean,
): void {
  host.classList.add('dsg-postgame__reserve');
  if (!revealed.includes(color)) {
    const note = document.createElement('span');
    note.className = 'dsg-postgame__reserve-empty';
    note.textContent = 'hidden';
    host.append(note);
    return;
  }
  const hand = handForColorAtPly(postgame, color, ply);
  const entries = SHOGI_HAND_ORDER.filter((role) => (hand[role] ?? 0) > 0);
  if (entries.length === 0) {
    const note = document.createElement('span');
    note.className = 'dsg-postgame__reserve-empty';
    note.textContent = '(no pieces in hand)';
    host.append(note);
    return;
  }
  for (const role of entries) {
    host.append(reserveKoma(role, color, hand[role] ?? 0, pointsUp));
  }
}

function renderCaptures(args: {
  pane: ReplayPaneHandle;
  bottomColor: ShogiColor;
  topColor: ShogiColor;
  key: DarkShogiPostgameViewKey;
  ply: number;
  postgame: DarkShogiPostgameResponse;
}): void {
  const revealed: readonly ShogiColor[] =
    args.key === 'truth' ? ['black', 'white'] : [args.key as ShogiColor];
  renderReserve(args.pane.topCapturesEl, args.topColor, args.ply, args.postgame, revealed, false);
  renderReserve(args.pane.capturesEl, args.bottomColor, args.ply, args.postgame, revealed, true);
}

export function mountDarkShogiWatchReplay(
  root: HTMLElement,
  roomId: string,
  options: DarkShogiWatchReplayOptions,
): Promise<ReplayHandle> {
  return mountFogTriptychWatchReplay<
    DarkShogiPostgameResponse,
    ShogiPlayerView,
    DarkShogiPostgameViewKey,
    ShogiColor
  >(root, roomId, options, {
    firstColor: 'black',
    firstLabel: 'Black',
    secondColor: 'white',
    secondLabel: 'White',
    boardClass: 'shogi-live-board',
    installStyles: () => {},
    loadPostgame: loadDarkShogiPostgame,
    maxPly: postgameReplayMaxPly,
    viewEntries: postgameViewEntries,
    viewAtPly: postgameViewAtPly,
    paneKind,
    renderBoard: (view, orientation, key) =>
      renderShogiBoardSvg(view, { perspective: orientation, showFog: key !== 'truth' }),
    renderCaptures,
    resultChipKind,
    resultLabel,
  });
}
