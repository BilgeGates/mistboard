// Mounts one game as a compact, single-board, autoplaying showcase board that
// hands off via onGameEnd at the end. Split from ./showcase-dispatch.ts because
// this pulls in replay.js (chessground); keeping it separate lets /watch import
// the resolver without the chessground weight.

import type { GameEvent } from '@mistboard/game';
import { type GameMeta, mountReplay, type ReplayHandle } from './replay.js';
import { showcaseRendererKindForSpec } from './showcase-dispatch.js';
import { webVariantTenantForSpecId } from './variant-tenant/registry.js';

// Hold on the final (reveal) frame before the chess board hands off via
// onGameEnd. Matches the legacy homepage hold; the tenant frameworks keep their
// own AUTO_PLAY_LOOP_HOLD_MS (~2.6s). Unifying the two is a Stage-3 pacing pass.
const SHOWCASE_CHESS_HOLD_MS = 8000;

export type ShowcaseBoardOptions = {
  metadataByRoomId: Record<string, GameMeta>;
  // Fired once when the mounted game reaches its final ply; the cycler advances.
  onGameEnd: () => void;
  // POV for the chess (chessground) path; tenants pick their own showcase side.
  pov: 'white' | 'black';
  // Chess event loader (static bundled samples vs the games API). Tenants load
  // their own postgame payloads internally and ignore this.
  loaderForId: (roomId: string) => Promise<GameEvent[]>;
};

export async function mountShowcaseBoard(
  root: HTMLElement,
  specId: string,
  roomId: string,
  options: ShowcaseBoardOptions,
): Promise<ReplayHandle> {
  const tenant =
    showcaseRendererKindForSpec(specId) === 'chess' ? null : webVariantTenantForSpecId(specId);
  if (tenant?.watch) {
    return tenant.watch.mountReplay(root, roomId, {
      autoplay: true,
      metadataByRoomId: options.metadataByRoomId,
      compact: true,
      onGameEnd: options.onGameEnd,
    });
  }

  // Chess (chessground): a single fogged POV board, no controls, paced for the
  // homepage. Mirrors the pre-existing landing hero config minus the internal
  // loop (the cycler owns cross-game advancement via onGameEnd).
  return mountReplay(root, roomId, {
    autoplay: true,
    showControls: false,
    keyboardNav: false,
    revealOnFinish: false,
    clampPace: true,
    metadataMode: 'compact',
    metadataByRoomId: options.metadataByRoomId,
    hideGameIdPill: true,
    showCaptures: true,
    captureLayout: 'split',
    compactClockLayout: 'captures',
    endStatusMode: 'clock',
    betweenGameDelayMs: SHOWCASE_CHESS_HOLD_MS,
    onGameEnd: options.onGameEnd,
    orientation: options.pov,
    orientationForId: () => options.pov,
    panes: { resolver: () => options.pov },
    loaderForId: options.loaderForId,
  });
}
