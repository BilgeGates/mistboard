// Fortress Xiangqi review surface: the fortress presentation bundle over the
// generic tree-review controller (mountTreeReview). Fortress is perfect-information,
// so the tree reconstructs every position (including drops) from the move list.
//
// SLICE 1 (this file): interactive BOARD moves + branching tree, no engine
// (engine: null → no eval gauge / engine panel) and no reserve strips / drop
// gesture. Fortress DOES have a ready Fairy-Stockfish engine (ceval
// 'fortressxiangqi'); wiring the `engine` bundle + a server whole-game analysis
// route is the next slice.

import {
  type FortressXiangqiColor,
  type FortressXiangqiGameState,
  type FortressXiangqiMove,
  type FortressXiangqiPlayerView,
  isFortressXiangqiDropMove,
} from '@mistboard/game';
import { createFortressXiangqiInteractiveBoard } from '../fortress-xiangqi-board.js';
import { animateFortressXiangqiBoardMove } from '../fortress-xiangqi-render.js';
import { fortressXiangqiTreeAdapter } from './fortress-xiangqi-tree-adapter.js';
import type { NodeShape } from './game-tree.js';
import {
  mountTreeReview,
  type TreePresentation,
  type TreeReviewConfig,
  type TreeReviewHandle,
} from './tree-review.js';

/** Config for a Fortress Xiangqi review mount. */
export type FortressXiangqiReviewConfig = TreeReviewConfig<FortressXiangqiMove>;

/** Handle returned by mountFortressXiangqiReview: snapshot the tree to persist it. */
export type FortressXiangqiReviewHandle = TreeReviewHandle;

const fortressPresentation: TreePresentation<
  FortressXiangqiMove,
  FortressXiangqiGameState,
  FortressXiangqiPlayerView,
  FortressXiangqiColor,
  unknown,
  unknown
> = {
  adapter: fortressXiangqiTreeAdapter,
  engine: null,
  boardHostClassName: 'fortress-xiangqi-postgame-board fortress-xiangqi-live-board',
  boardWrapClassName: 'dxq-postgame__board-wrap review-board-host',
  defaultBoardAriaLabel: 'Fortress Xiangqi board',
  boardAspect: 516 / 588,
  boardCols: 7,
  perspective: (flipped) => (flipped ? 'black' : 'red'),
  seatFor: (view) => (view.status.type === 'playing' ? view.status.turn : null),
  createBoard: (opts) => createFortressXiangqiInteractiveBoard(opts),
  // Only board moves glide; a drop has no origin square, so it renders discretely.
  animateMove: (boardEl, move, perspective, opts) => {
    if (!isFortressXiangqiDropMove(move)) {
      animateFortressXiangqiBoardMove(boardEl, move, perspective, opts);
    }
  },
  shapeToArrow: (s: NodeShape) => s,
  shapeToMarker: (s: NodeShape) => s,
};

export function mountFortressXiangqiReview(
  root: HTMLElement,
  config: FortressXiangqiReviewConfig,
): FortressXiangqiReviewHandle {
  return mountTreeReview(root, fortressPresentation, config);
}
