// Mistboard TV renderer for Flip Jungle — a thin adapter over the shared tenant
// watch renderer (watch-tenant-replay.ts). Flip Jungle is SYMMETRIC hidden-identity
// (the banqi pattern): one board, defaulting to the as-played masked replay with a
// Reveal/Hide control (and the `h` key) that swaps in the full-reveal overlay. The
// deal has no sides, so orientation is ignored; captured material lives on the board.
import './live-xiangqi.css';
import type { JungleFlipPlayerView } from '@mistboard/game';
import { type JungleFlipRenderBoard, renderJungleFlipBoardSvg } from './jungle-flip-render.js';
import { jungleFlipResultLabel } from './jungle-flip-result-label.js';
import {
  type JungleFlipPostgameResponse,
  loadJungleFlipPostgame,
  replayMaxPly,
  viewAtPly,
} from './live-jungle-flip-postgame.js';
import type { ReplayHandle } from './replay.js';
import { mountTenantWatchReplay, type TenantWatchReplayOptions } from './watch-tenant-replay.js';

export type JungleFlipWatchReplayOptions = TenantWatchReplayOptions;

// 'truth' is the as-played mask (unflipped tiles face-down); 'revealed' is the
// spoiler overlay. The shared chrome defaults to the hidden key and the Reveal
// control swaps to the truth (revealed) key.
type JungleFlipWatchViewKey = 'truth' | 'revealed';

export function mountJungleFlipWatchReplay(
  root: HTMLElement,
  roomId: string,
  options: JungleFlipWatchReplayOptions,
): Promise<ReplayHandle> {
  return mountTenantWatchReplay<
    JungleFlipPostgameResponse,
    JungleFlipPlayerView,
    JungleFlipWatchViewKey
  >(root, roomId, options, {
    installStyles: () => {},
    loadPostgame: loadJungleFlipPostgame,
    maxPly: replayMaxPly,
    viewEntries: () => [{ key: 'truth', label: 'Truth' }],
    viewAtPly,
    paneKind: () => 'truth',
    renderBoard: (view) =>
      renderJungleFlipBoardSvg(view.board as JungleFlipRenderBoard, {
        lastMove: view.lastMove ?? null,
      }),
    fillCaptures: () => {},
    reveal: { hiddenKey: 'truth', truthKey: 'revealed' },
    resultLabel: (result, postgame) => jungleFlipResultLabel(result, postgame.view.firstColor),
  });
}
