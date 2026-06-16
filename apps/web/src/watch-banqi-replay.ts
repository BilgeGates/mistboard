// Mistboard TV renderer for Banqi — a thin adapter over the shared tenant watch
// renderer (watch-tenant-replay.ts). Banqi is symmetric-information: the board is
// public and only the deal is hidden, so the postgame ships a SINGLE truth
// surface (no per-color triptych) and there is no fog to pass to the renderer.
import type { BanqiPlayerView } from '@mistboard/game';
import { fillCapturedPool } from './live-banqi.js';
import {
  type BanqiPostgameResponse,
  type BanqiPostgameViewKey,
  loadBanqiPostgame,
  postgameReplayMaxPly,
  postgameViewAtPly,
  postgameViewEntries,
} from './live-banqi-postgame.js';
import { installBanqiBoardStyles, renderBanqiBoardSvg } from './live-banqi-render.js';
import type { ReplayHandle } from './replay.js';
import { mountTenantWatchReplay, type TenantWatchReplayOptions } from './watch-tenant-replay.js';

export type BanqiWatchReplayOptions = TenantWatchReplayOptions;

function paneKind(key: BanqiPostgameViewKey): 'white' | 'truth' | 'black' {
  if (key === 'red') return 'white';
  if (key === 'black') return 'black';
  return 'truth';
}

export function mountBanqiWatchReplay(
  root: HTMLElement,
  roomId: string,
  options: BanqiWatchReplayOptions,
): Promise<ReplayHandle> {
  return mountTenantWatchReplay<BanqiPostgameResponse, BanqiPlayerView, BanqiPostgameViewKey>(
    root,
    roomId,
    options,
    {
      installStyles: installBanqiBoardStyles,
      loadPostgame: loadBanqiPostgame,
      maxPly: postgameReplayMaxPly,
      viewEntries: (postgame) =>
        postgameViewEntries(postgame).map((entry) => ({ key: entry.key, label: entry.label })),
      viewAtPly: postgameViewAtPly,
      paneKind,
      // Symmetric board: no fog/perspective to apply.
      renderBoard: (view, orientation) => renderBanqiBoardSvg(view, orientation),
      fillCaptures: (host, view, owner) => fillCapturedPool(host, view.captured, owner),
    },
  );
}
