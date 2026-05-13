export { PIECE_SVGS } from './pieces.js';
export {
  BOARD_BORDER,
  DARK_SQUARE,
  FOG_FILL,
  FOG_OPACITY,
  LIGHT_SQUARE,
} from './tokens.js';
export { renderBoardSvg } from './board-svg.js';
export type { FogSquare, PieceOnBoard } from './board-svg.js';
export { boardsInLayout, layoutPlacements } from './layouts.js';
export type { CompositionLayout } from './layouts.js';
export { renderBoardComposition } from './composition.js';
export type { BoardSpec, CompositionOptions } from './composition.js';
export { startingPositionFromBackRank } from './positions.js';
