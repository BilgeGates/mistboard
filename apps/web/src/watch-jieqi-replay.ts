// Mistboard TV renderer for Jieqi — a thin adapter over the shared tenant watch
// renderer (watch-tenant-replay.ts). Jieqi has NO fog (positions are public;
// only a face-down piece's IDENTITY is hidden, which the server-computed
// per-color views already render as backs), so the per-color triptych is just
// three views of the same public board and the renderer takes no fog option.
import type { JieqiPlayerView } from '@mistboard/game';
import { fillCapturedPool } from './live-jieqi.js';
import {
  type JieqiPostgameResponse,
  type JieqiPostgameViewKey,
  loadJieqiPostgame,
  postgameReplayMaxPly,
  postgameViewAtPly,
  postgameViewEntries,
} from './live-jieqi-postgame.js';
import { installJieqiBoardStyles, renderJieqiBoardSvg } from './live-jieqi-render.js';
import type { ReplayHandle } from './replay.js';
import { mountTenantWatchReplay, type TenantWatchReplayOptions } from './watch-tenant-replay.js';

export type JieqiWatchReplayOptions = TenantWatchReplayOptions;

function paneKind(key: JieqiPostgameViewKey): 'white' | 'truth' | 'black' {
  if (key === 'red') return 'white';
  if (key === 'black') return 'black';
  return 'truth';
}

export function mountJieqiWatchReplay(
  root: HTMLElement,
  roomId: string,
  options: JieqiWatchReplayOptions,
): Promise<ReplayHandle> {
  return mountTenantWatchReplay<JieqiPostgameResponse, JieqiPlayerView, JieqiPostgameViewKey>(
    root,
    roomId,
    options,
    {
      installStyles: installJieqiBoardStyles,
      loadPostgame: loadJieqiPostgame,
      maxPly: postgameReplayMaxPly,
      viewEntries: (postgame) =>
        postgameViewEntries(postgame).map((entry) => ({ key: entry.key, label: entry.label })),
      viewAtPly: postgameViewAtPly,
      paneKind,
      // No fog: the truth view shows every identity; per-color views render the
      // opponent's face-down pieces as backs (keyed off the view entry's
      // faceDown flag, not a render option).
      renderBoard: (view, orientation) => renderJieqiBoardSvg(view, orientation, {}),
      fillCaptures: (host, view, owner) => fillCapturedPool(host, view.captured, owner),
    },
  );
}
