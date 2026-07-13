// Flip Xiangqi (banqi) review surface: the banqi presentation bundle over the
// generic tree-review controller (mountTreeReview). Banqi has a hidden deal but no
// client engine, so `engine: null` — the eval gauge and engine panel are omitted,
// but the interactive branching board (flip + move), move tree, control bar, and
// replay all work. Unlike jungle/xiangqi the adapter is DEAL-BOUND (a factory over
// the reconstructed deal), so the presentation is built per-game rather than held
// as a module constant.

import type {
  BanqiDeal,
  BanqiGameState,
  BanqiMove,
  BanqiPlayerView,
  BanqiSeat,
} from '@mistboard/game';
import { createBanqiInteractiveBoard } from '../banqi-board.js';
import { makeBanqiTreeAdapter } from './banqi-tree-adapter.js';
import type { NodeShape, VariantTreeAdapter } from './game-tree.js';
import {
  mountTreeReview,
  type TreePresentation,
  type TreeReviewConfig,
  type TreeReviewHandle,
} from './tree-review.js';

/** Config for a banqi review mount. */
export type BanqiReviewConfig = TreeReviewConfig<BanqiMove>;

/** Handle returned by mountBanqiReview: snapshot the current tree to persist it. */
export type BanqiReviewHandle = TreeReviewHandle;

// Banqi has no client engine and the renderer has no overlay layer, so Arrow/Marker
// are unused (setArrows/setMarkers are no-ops); the shapeTo* hooks are never invoked
// but the type requires them, so they pass the shape through opaquely. Banqi is
// symmetric-info — the same board shows to both seats — so `perspective` never
// changes the render (the Flip control is a visual no-op here, kept for parity).
function makeBanqiPresentation(
  adapter: VariantTreeAdapter<BanqiMove, BanqiGameState, BanqiPlayerView>,
): TreePresentation<BanqiMove, BanqiGameState, BanqiPlayerView, BanqiSeat, unknown, unknown> {
  return {
    adapter,
    engine: null,
    boardHostClassName: 'banqi-postgame-board banqi-live-board',
    boardWrapClassName: 'dxq-postgame__board-wrap review-board-host',
    defaultBoardAriaLabel: 'Flip Xiangqi board',
    // 8×4 board (WIDTH 568 / HEIGHT 312 from live-banqi-render).
    boardAspect: 568 / 312,
    // Discs sit inset within their cell, so capture tiles size a touch under one
    // cell (board width / 10), matching the linear postgame.
    boardCols: 10,
    perspective: (flipped) => (flipped ? 'black' : 'red'),
    // Review plays BOTH sides: the interactive seat is the side to move.
    seatFor: (view) => (view.status.type === 'playing' ? view.status.turn : null),
    createBoard: (opts) => createBanqiInteractiveBoard(opts),
    // No glide animation for banqi (a flip has no travel; board re-renders on nav).
    animateMove: () => {},
    shapeToArrow: (s: NodeShape) => s,
    shapeToMarker: (s: NodeShape) => s,
  };
}

export function mountBanqiReview(
  root: HTMLElement,
  gameId: string,
  deal: BanqiDeal,
  config: BanqiReviewConfig,
): BanqiReviewHandle {
  const adapter = makeBanqiTreeAdapter(gameId, deal);
  return mountTreeReview(root, makeBanqiPresentation(adapter), config);
}
