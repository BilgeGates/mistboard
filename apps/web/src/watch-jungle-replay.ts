// Mistboard TV renderer for Jungle — a thin adapter over the shared tenant watch
// renderer (watch-tenant-replay.ts). Jungle is PERFECT-INFORMATION: the board was
// always fully visible, so there is one truth surface (no per-color triptych), no
// reveal toggle, and no captured-pool fill (the board itself carries the material).
import './live-xiangqi.css';
import type { JungleBoard, JunglePlayerView } from '@mistboard/game';
import { renderJungleBoardSvg } from './jungle-render.js';
import {
  type JunglePostgameResponse,
  junglePostgameMaxPly,
  junglePostgameViewAtPly,
  loadJunglePostgame,
} from './live-jungle-postgame.js';
import type { ReplayHandle } from './replay.js';
import { mountTenantWatchReplay, type TenantWatchReplayOptions } from './watch-tenant-replay.js';

export type JungleWatchReplayOptions = TenantWatchReplayOptions;

type JungleWatchViewKey = 'truth';

export function mountJungleWatchReplay(
  root: HTMLElement,
  roomId: string,
  options: JungleWatchReplayOptions,
): Promise<ReplayHandle> {
  return mountTenantWatchReplay<JunglePostgameResponse, JunglePlayerView, JungleWatchViewKey>(
    root,
    roomId,
    options,
    {
      installStyles: () => {},
      loadPostgame: loadJunglePostgame,
      maxPly: junglePostgameMaxPly,
      viewEntries: () => [{ key: 'truth', label: 'Truth' }],
      viewAtPly: (postgame, _key, ply) => junglePostgameViewAtPly(postgame, ply),
      paneKind: () => 'truth',
      renderBoard: (view, orientation) =>
        renderJungleBoardSvg(view.board as JungleBoard, {
          perspective: orientation,
          lastMove: view.lastMove ?? null,
        }),
      // Perfect-info board carries its own material; no captured-pool strips.
      fillCaptures: () => {},
    },
  );
}
