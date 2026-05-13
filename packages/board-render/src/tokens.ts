// Visual tokens shared between the static SVG renderer and the interactive
// chessground wrapper. The chessground side reads colors via its CSS files
// (chessground.brown.css); mirror any change to those CSS values here so the
// two render paths stay in sync.

export const LIGHT_SQUARE = '#f0d9b5';
export const DARK_SQUARE = '#b58863';
export const FOG_FILL = '#1a1a1a';
export const FOG_OPACITY = 0.78;
export const BOARD_BORDER = '#2a2f37';
