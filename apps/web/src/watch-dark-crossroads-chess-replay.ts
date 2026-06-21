import type { CrossroadsChessColor, CrossroadsChessPlayerView } from '@mistboard/game';
import './live-crossroads-chess.css';
import './dark-crossroads-chess-postgame.css';
import {
  readCrossroadsChessAppearance,
  renderCrossroadsChessBoardSvg,
} from './crossroads-chess-render.js';
import {
  type DarkCrossroadsChessPostgameResponse,
  type DarkCrossroadsChessPostgameViewKey,
  loadDarkCrossroadsChessPostgame,
  postgameReplayMaxPly,
  postgameViewAtPly,
  postgameViewEntries,
} from './dark-crossroads-chess-postgame.js';
import type { ReplayHandle } from './replay.js';
import {
  type FogTriptychWatchOptions,
  mountFogTriptychWatchReplay,
} from './watch-fog-triptych-replay.js';

export type DarkCrossroadsChessWatchReplayOptions = FogTriptychWatchOptions;

function paneKind(key: DarkCrossroadsChessPostgameViewKey): 'white' | 'truth' | 'black' {
  if (key === 'white') return 'white';
  if (key === 'red') return 'black';
  return 'truth';
}

function resultLabel(result: string): string {
  if (result === 'white-wins') return 'White wins';
  if (result === 'red-wins') return 'Red wins';
  return 'Draw';
}

function resultChipKind(result: string): 'white' | 'red' | 'draw' {
  if (result === 'white-wins') return 'white';
  if (result === 'red-wins') return 'red';
  return 'draw';
}

export function mountDarkCrossroadsChessWatchReplay(
  root: HTMLElement,
  roomId: string,
  options: DarkCrossroadsChessWatchReplayOptions,
): Promise<ReplayHandle> {
  return mountFogTriptychWatchReplay<
    DarkCrossroadsChessPostgameResponse,
    CrossroadsChessPlayerView,
    DarkCrossroadsChessPostgameViewKey,
    CrossroadsChessColor
  >(root, roomId, options, {
    firstColor: 'white',
    firstLabel: 'White',
    secondColor: 'red',
    secondLabel: 'Red',
    boardClass: 'crossroads-live-board',
    layoutClass: 'watch-crossroads-layout',
    installStyles: () => {},
    loadPostgame: loadDarkCrossroadsChessPostgame,
    maxPly: postgameReplayMaxPly,
    viewEntries: postgameViewEntries,
    viewAtPly: postgameViewAtPly,
    paneKind,
    renderBoard: (view, orientation, key) =>
      renderCrossroadsChessBoardSvg(view, {
        perspective: orientation,
        showFog: key !== 'truth',
        ...readCrossroadsChessAppearance(),
      }),
    resultChipKind,
    resultLabel,
  });
}
