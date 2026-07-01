import type { DropMiniXiangqiPlayerView } from '@mistboard/game';
import './drop-mini-xiangqi.css';
import {
  type DropMiniXiangqiPostgameResponse,
  loadDropMiniXiangqiPostgame,
  postgameReplayMaxPly,
  postgameViewAtPly,
  postgameViewEntries,
} from './drop-mini-xiangqi-postgame.js';
import {
  type DropMiniXiangqiViewKey,
  dropMiniXiangqiBoardView,
  fillDropMiniXiangqiReserve,
} from './drop-mini-xiangqi-view.js';
import {
  installMiniXiangqiBoardStyles,
  renderMiniXiangqiBoardSvg,
} from './live-mini-xiangqi-render.js';
import type { ReplayHandle } from './replay.js';
import { mountTenantWatchReplay, type TenantWatchReplayOptions } from './watch-tenant-replay.js';

export type DropMiniXiangqiWatchReplayOptions = TenantWatchReplayOptions;

function paneKind(_key: DropMiniXiangqiViewKey): 'white' | 'truth' | 'black' {
  return 'truth';
}

export function mountDropMiniXiangqiWatchReplay(
  root: HTMLElement,
  roomId: string,
  options: DropMiniXiangqiWatchReplayOptions,
): Promise<ReplayHandle> {
  return mountTenantWatchReplay<
    DropMiniXiangqiPostgameResponse,
    DropMiniXiangqiPlayerView,
    DropMiniXiangqiViewKey
  >(root, roomId, options, {
    installStyles: installMiniXiangqiBoardStyles,
    loadPostgame: loadDropMiniXiangqiPostgame,
    maxPly: postgameReplayMaxPly,
    viewEntries: (postgame) =>
      postgameViewEntries(postgame).map((entry) => ({ key: entry.key, label: entry.label })),
    viewAtPly: postgameViewAtPly,
    paneKind,
    renderBoard: (view, orientation) =>
      renderMiniXiangqiBoardSvg(dropMiniXiangqiBoardView(view), orientation, { showFog: false }),
    fillCaptures: (host, view, owner) => fillDropMiniXiangqiReserve(host, view, owner),
    // Reserves (droppable hand) are essential to the position: show them as
    // vertical strips flanking the board in the compact showcase.
    sidedCaptures: true,
  });
}
