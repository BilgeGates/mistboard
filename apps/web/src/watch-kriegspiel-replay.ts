import type { Color, KriegspielPlayerView } from '@mistboard/game';
import './live-kriegspiel.css';
import './kriegspiel-postgame.css';
import {
  type KriegspielPostgameResponse,
  type KriegspielPostgameViewKey,
  loadKriegspielPostgame,
  postgameReplayMaxPly,
  postgameViewAtPly,
  postgameViewEntries,
} from './kriegspiel-postgame.js';
import { renderKriegspielBoardSvg } from './kriegspiel-render.js';
import type { ReplayHandle } from './replay.js';
import {
  type FogTriptychWatchOptions,
  mountFogTriptychWatchReplay,
} from './watch-fog-triptych-replay.js';

export type KriegspielWatchReplayOptions = FogTriptychWatchOptions;

function paneKind(key: KriegspielPostgameViewKey): 'white' | 'truth' | 'black' {
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

export function mountKriegspielWatchReplay(
  root: HTMLElement,
  roomId: string,
  options: KriegspielWatchReplayOptions,
): Promise<ReplayHandle> {
  return mountFogTriptychWatchReplay<
    KriegspielPostgameResponse,
    KriegspielPlayerView,
    KriegspielPostgameViewKey,
    Color
  >(root, roomId, options, {
    firstColor: 'white',
    firstLabel: 'White',
    secondColor: 'black',
    secondLabel: 'Black',
    boardClass: 'kriegspiel-live-board',
    installStyles: () => {},
    loadPostgame: loadKriegspielPostgame,
    maxPly: postgameReplayMaxPly,
    viewEntries: postgameViewEntries,
    viewAtPly: postgameViewAtPly,
    paneKind,
    renderBoard: (view, orientation, key) =>
      renderKriegspielBoardSvg(view, { perspective: orientation, showFog: key !== 'truth' }),
    resultChipKind,
    resultLabel,
  });
}
