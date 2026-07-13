// Jungle (Dou Shou Qi) review surface: the jungle presentation bundle over the
// generic tree-review controller (mountTreeReview). Jungle is perfect-information
// and has no client engine, so `engine: null` — the eval gauge and engine panel
// are omitted, but the interactive branching board, move tree, control bar, and
// replay all work. This is the first non-xiangqi consumer of mountTreeReview.

import type { JungleColor, JungleGameState, JungleMove, JunglePlayerView } from '@mistboard/game';
import { rectangularGridAspect } from '../board-metrics.js';
import { createJungleInteractiveBoard } from '../jungle-board.js';
import { animateJungleBoardMove, JUNGLE_BOARD_VIEW } from '../jungle-render.js';
import type { NodeShape } from './game-tree.js';
import { jungleTreeAdapter } from './jungle-tree-adapter.js';
import {
  mountTreeReview,
  type TreePresentation,
  type TreeReviewConfig,
  type TreeReviewHandle,
} from './tree-review.js';

/** Config for a jungle review mount. */
export type JungleReviewConfig = TreeReviewConfig<JungleMove>;

/** Handle returned by mountJungleReview: snapshot the current tree to persist it. */
export type JungleReviewHandle = TreeReviewHandle;

// Jungle has no client engine and no board overlay layer, so Arrow/Marker are
// unused (setArrows/setMarkers are no-ops); the shapeTo* hooks are never invoked
// but the type requires them, so they pass the shape through opaquely.
const junglePresentation: TreePresentation<
  JungleMove,
  JungleGameState,
  JunglePlayerView,
  JungleColor,
  unknown,
  unknown
> = {
  adapter: jungleTreeAdapter,
  engine: null,
  boardHostClassName: 'jungle-postgame-board jungle-live-board',
  boardWrapClassName: 'dxq-postgame__board-wrap review-board-host',
  defaultBoardAriaLabel: 'Jungle board',
  boardAspect: rectangularGridAspect(JUNGLE_BOARD_VIEW),
  boardCols: 7,
  // Jungle pieces pick up their look from the render call (not a CSS piece set),
  // and a full re-render happens on every navigation, so no appearance event.
  perspective: (flipped) => (flipped ? 'black' : 'red'),
  // Review plays BOTH sides: the interactive seat is the side to move.
  seatFor: (view) => (view.status.type === 'playing' ? view.status.turn : null),
  createBoard: (opts) => createJungleInteractiveBoard(opts),
  animateMove: animateJungleBoardMove,
  shapeToArrow: (s: NodeShape) => s,
  shapeToMarker: (s: NodeShape) => s,
};

export function mountJungleReview(
  root: HTMLElement,
  config: JungleReviewConfig,
): JungleReviewHandle {
  return mountTreeReview(root, junglePresentation, config);
}
