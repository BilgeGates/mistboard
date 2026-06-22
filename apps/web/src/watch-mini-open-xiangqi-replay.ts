import type { MiniXiangqiPlayerView } from '@mistboard/game';
import {
  installMiniXiangqiBoardStyles,
  renderMiniXiangqiBoardSvg,
} from './live-mini-xiangqi-render.js';
import {
  loadMiniXiangqiPostgame,
  type MiniXiangqiPostgameResponse,
  postgameReplayMaxPly,
  postgameViewAtPly,
  postgameViewEntries,
} from './mini-xiangqi-postgame.js';
import type { MiniXiangqiViewKey } from './mini-xiangqi-view.js';
import type { ReplayHandle } from './replay.js';
import { mountTenantWatchReplay, type TenantWatchReplayOptions } from './watch-tenant-replay.js';

export type MiniOpenXiangqiWatchReplayOptions = TenantWatchReplayOptions;

function paneKind(_key: MiniXiangqiViewKey): 'white' | 'truth' | 'black' {
  return 'truth';
}

export function mountMiniOpenXiangqiWatchReplay(
  root: HTMLElement,
  roomId: string,
  options: MiniOpenXiangqiWatchReplayOptions,
): Promise<ReplayHandle> {
  return mountTenantWatchReplay<
    MiniXiangqiPostgameResponse,
    MiniXiangqiPlayerView,
    MiniXiangqiViewKey
  >(root, roomId, options, {
    installStyles: installMiniXiangqiBoardStyles,
    loadPostgame: loadMiniXiangqiPostgame,
    maxPly: postgameReplayMaxPly,
    viewEntries: (postgame) =>
      postgameViewEntries(postgame).map((entry) => ({ key: entry.key, label: entry.label })),
    viewAtPly: postgameViewAtPly,
    paneKind,
    renderBoard: (view, orientation) =>
      renderMiniXiangqiBoardSvg(view, orientation, { showFog: false }),
    fillCaptures: (host) => host.replaceChildren(),
  });
}
