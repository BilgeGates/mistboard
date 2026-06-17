// Mistboard TV renderer for Jieqi — a thin adapter over the shared tenant watch
// renderer (watch-tenant-replay.ts). Jieqi has NO fog (positions are public;
// only a face-down piece's IDENTITY is hidden, which the server-computed
// per-color views already render as backs) and identity-hiding is SYMMETRIC — a
// face-down piece is a blank back to BOTH players — so the red-view and
// black-view boards are pixel-identical to each other and differ from truth only
// in that truth flips the unmoved identities up. A triptych would show the same
// board three times, so the watch renders a single board. It defaults to the
// as-played hidden view (face-down backs) with a Reveal/Hide control, matching
// the postgame review.
import type { JieqiPlayerView } from '@mistboard/game';
import { fillCapturedPool } from './live-jieqi.js';
import {
  type JieqiPostgameResponse,
  type JieqiPostgameViewKey,
  loadJieqiPostgame,
  postgameReplayMaxPly,
  postgameViewAtPly,
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
      // A single board (the per-color boards are identical — jieqi hides identities
      // symmetrically). The pane's fallback key is 'truth' (always present); the
      // board itself defaults to the as-played hidden view via `reveal` below, and
      // the Reveal/Hide control swaps to truth. The 'Truth' label is hidden in CSS.
      viewEntries: () => [{ key: 'truth', label: 'Truth' }],
      // Default to the as-played (hidden-identity) board; reveal swaps to truth.
      reveal: { hiddenKey: 'red', truthKey: 'truth' },
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
