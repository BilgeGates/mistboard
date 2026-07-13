// Flip Jungle (jungle-flip) review surface: the jungle-flip presentation bundle over
// the generic tree-review controller (mountTreeReview). Jungle-flip has a symmetric
// hidden deal but no client engine, so `engine: null`. Like banqi the adapter is
// DEAL-BOUND (a factory over the reconstructed deal), so the presentation is built
// per-game rather than held as a module constant.

import type {
  JungleFlipDeal,
  JungleFlipGameState,
  JungleFlipMove,
  JungleFlipPlayerView,
  JungleFlipSeat,
} from '@mistboard/game';
import { rectangularGridAspect } from '../board-metrics.js';
import { createJungleFlipInteractiveBoard } from '../jungle-flip-board.js';
import { JUNGLE_FLIP_BOARD_VIEW } from '../jungle-flip-render.js';
import type { NodeShape, VariantTreeAdapter } from './game-tree.js';
import { makeJungleFlipTreeAdapter } from './jungle-flip-tree-adapter.js';
import {
  mountTreeReview,
  type TreePresentation,
  type TreeReviewConfig,
  type TreeReviewHandle,
} from './tree-review.js';

/** Config for a jungle-flip review mount. */
export type JungleFlipReviewConfig = TreeReviewConfig<JungleFlipMove>;

/** Handle returned by mountJungleFlipReview: snapshot the current tree to persist it. */
export type JungleFlipReviewHandle = TreeReviewHandle;

// No client engine and no overlay layer, so Arrow/Marker are unused; the shapeTo*
// hooks pass the shape through opaquely. Jungle-flip is symmetric-info (both seats
// see the identical board), so `perspective` never changes the render.
function makeJungleFlipPresentation(
  adapter: VariantTreeAdapter<JungleFlipMove, JungleFlipGameState, JungleFlipPlayerView>,
): TreePresentation<
  JungleFlipMove,
  JungleFlipGameState,
  JungleFlipPlayerView,
  JungleFlipSeat,
  unknown,
  unknown
> {
  return {
    adapter,
    engine: null,
    boardHostClassName: 'jungle-flip-postgame-board jungle-flip-live-board',
    boardWrapClassName: 'dxq-postgame__board-wrap review-board-host',
    defaultBoardAriaLabel: 'Flip Jungle board',
    boardAspect: rectangularGridAspect(JUNGLE_FLIP_BOARD_VIEW),
    // 4×4 board: keep capture tiles compact so the board grows to fill the box.
    boardCols: 8,
    perspective: (flipped) => (flipped ? 'black' : 'red'),
    seatFor: (view) => (view.status.type === 'playing' ? view.status.turn : null),
    createBoard: (opts) => createJungleFlipInteractiveBoard(opts),
    // No glide animation (a flip has no travel; board re-renders on nav).
    animateMove: () => {},
    shapeToArrow: (s: NodeShape) => s,
    shapeToMarker: (s: NodeShape) => s,
  };
}

export function mountJungleFlipReview(
  root: HTMLElement,
  gameId: string,
  deal: JungleFlipDeal,
  config: JungleFlipReviewConfig,
): JungleFlipReviewHandle {
  const adapter = makeJungleFlipTreeAdapter(gameId, deal);
  return mountTreeReview(root, makeJungleFlipPresentation(adapter), config);
}
