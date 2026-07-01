// Renderer dispatch for the homepage showcase viewer, shared with /watch's
// channel dispatch so the two can't drift. Keyed on a game's SPEC ID (not its
// render family): two variants in the same family (e.g. jieqi and Dark Mini
// Xiangqi both render "xiangqi") must resolve to distinct renderers, and a switch
// across kinds re-mounts rather than loadGame.
//
// Deliberately chessground-free (no replay.js import) so /watch can import the
// resolver without pulling chessground into its module-init path. The mount
// itself (which needs mountReplay) lives in ./showcase-board.ts.

import { isGameSpecId } from './variant-public-surfaces.js';
import { webVariantTenantForSpecId } from './variant-tenant/registry.js';

// A game spec id (when a web tenant owns a watch renderer for it), or 'chess'
// (the chessground fallback for the unregistered dark-chess stack).
export type ShowcaseRendererKind = string;

export function showcaseRendererKindForSpec(specId: string | null): ShowcaseRendererKind {
  const tenant = webVariantTenantForSpecId(specId);
  return tenant?.watch && specId ? specId : 'chess';
}

// Normalize a persisted games.variant value to a game spec id for dispatch.
// Legacy dark-chess rows store 'fog'; everything else is already a spec id.
// Unknown values fall back to dark-chess (the chessground renderer, always safe).
export function specIdForShowcaseVariant(variant: string): string {
  if (variant === 'fog') return 'dark-chess';
  return isGameSpecId(variant) ? variant : 'dark-chess';
}

// Next index in pool order after the current one (wraps). Pool order is the
// server's cross-variant interleave, so sequential cycling honors it. A current
// room that was dropped from the pool (currentIndex -1) restarts at the front.
export function nextShowcaseIndex(poolLength: number, currentIndex: number): number {
  if (poolLength <= 0) return -1;
  return (currentIndex + 1) % poolLength;
}
