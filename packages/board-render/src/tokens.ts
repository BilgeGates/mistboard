// Visual tokens shared between the static SVG renderer and the interactive
// chessground wrapper. The chessground side reads colors via its CSS files
// (chessground.brown.css); mirror any change to those CSS values here so the
// two render paths stay in sync.

export const LIGHT_SQUARE = '#f0d9b5';
export const DARK_SQUARE = '#b58863';
// Board frame — matched to --board-frame in apps/web/src/styles.css so
// every surface (live game, replay, article static SVG, article stepper)
// uses the same brown wood frame.
export const BOARD_FRAME = '#5f412c';
export const BOARD_BORDER = BOARD_FRAME;

// Fog stripe tokens — matched to the live-game CSS variables
// (--board-fog-* in apps/web/src/styles.css). The textured fog gives the
// same diagonal-stripe look chessground uses on the live board.
export const FOG_LIGHT_FILL = 'rgba(17, 14, 11, 0.74)';
export const FOG_DARK_FILL = 'rgba(12, 10, 8, 0.78)';
export const FOG_LINE = 'rgba(0, 0, 0, 0.36)';
export const FOG_LINE_SOFT = 'rgba(255, 255, 255, 0.06)';
export const FOG_SHADOW = 'rgba(255, 244, 224, 0.1)';
export const FOG_TILE_SIZE = 14;
// Legacy flat-fog values, kept for any caller that hasn't migrated.
export const FOG_FILL = '#1a1a1a';
export const FOG_OPACITY = 0.78;

// ── Palettes ──────────────────────────────────────────────────────────────
// A palette bundles every color the static renderer needs so a single board
// can be drawn in a theme other than the module-level default. Mirror values
// from the matching `[data-board-theme="…"]` block in apps/web/src/styles.css.
export type BoardPalette = {
  light: string;
  dark: string;
  frame: string;
  fogLightFill: string;
  fogDarkFill: string;
  fogLine: string;
  fogLineSoft: string;
  fogShadow: string;
};

// Default (brown) — matches the module constants above; this is what every
// caller gets when no palette is passed.
export const BROWN_PALETTE: BoardPalette = {
  light: LIGHT_SQUARE,
  dark: DARK_SQUARE,
  frame: BOARD_FRAME,
  fogLightFill: FOG_LIGHT_FILL,
  fogDarkFill: FOG_DARK_FILL,
  fogLine: FOG_LINE,
  fogLineSoft: FOG_LINE_SOFT,
  fogShadow: FOG_SHADOW,
};

// Tournament green — the product's *default* in-app theme
// (apps/web/src/theme.ts), mirrored from the green block in styles.css.
export const GREEN_PALETTE: BoardPalette = {
  light: '#eeeed2',
  dark: '#769656',
  frame: '#2a3a2a',
  fogLightFill: 'rgba(14, 22, 14, 0.74)',
  fogDarkFill: 'rgba(8, 16, 10, 0.8)',
  fogLine: 'rgba(8, 24, 12, 0.36)',
  fogLineSoft: 'rgba(255, 255, 255, 0.08)',
  fogShadow: 'rgba(238, 238, 210, 0.14)',
};

// Fog rendering style. 'striped' is the live-board diagonal texture; 'solid'
// fills each fogged square with a flat frosted overlay (cleaner at share-card
// scale, where fine stripes turn to noise after scraper recompression).
export type FogStyle = 'striped' | 'solid';
