// Visual tokens shared between the static SVG renderer and the interactive
// chessground wrapper. The chessground side reads colors via its CSS files
// (chessground.brown.css); mirror any change to those CSS values here so the
// two render paths stay in sync.

export const LIGHT_SQUARE = '#f0d9b5';
export const DARK_SQUARE = '#b58863';
export const BOARD_BORDER = '#2a2f37';

// Fog stripe tokens — matched to the live-game CSS variables
// (--board-fog-* in apps/web/src/styles.css). The textured fog gives the
// same diagonal-stripe look chessground uses on the live board.
export const FOG_LIGHT_FILL = 'rgba(17, 14, 11, 0.74)';
export const FOG_DARK_FILL = 'rgba(12, 10, 8, 0.78)';
export const FOG_LINE = 'rgba(0, 0, 0, 0.36)';
export const FOG_LINE_SOFT = 'rgba(255, 255, 255, 0.06)';
export const FOG_TILE_SIZE = 14;
// Legacy flat-fog values, kept for any caller that hasn't migrated.
export const FOG_FILL = '#1a1a1a';
export const FOG_OPACITY = 0.78;
