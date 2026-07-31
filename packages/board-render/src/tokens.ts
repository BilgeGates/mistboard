// Visual tokens shared between the static SVG renderer and the interactive
// chessground wrapper. The chessground side reads colors via its CSS files
// (chessground.brown.css); mirror any change to those CSS values here so the
// two render paths stay in sync.

// Wood: the light square is the xiangqi board surface (--xq-board-bg) and the
// dark square is the same tan carried down the wood ramp, so chess-family boards
// read as the same material as the xiangqi ones. Mirrors the :root block in
// apps/web/src/app-base.css.
export const LIGHT_SQUARE = '#f5dca8';
export const DARK_SQUARE = '#bd9051';

// Fog veil tokens — matched to the live-game CSS variables
// (--board-fog-* in apps/web/src/styles.css). Fog is drawn as a translucent
// overlay so the underlying light/dark square color still shows through.
export const FOG_LIGHT_FILL = 'rgba(6, 10, 8, 0.66)';
export const FOG_DARK_FILL = 'rgba(6, 10, 8, 0.72)';
export const FOG_SOLID_LIGHT_FILL = '#17261a';
export const FOG_SOLID_DARK_FILL = FOG_SOLID_LIGHT_FILL;
export const FOG_LINE = 'rgba(0, 0, 0, 0.36)';
export const FOG_LINE_SOFT = 'rgba(255, 255, 255, 0.06)';
export const FOG_SHADOW = '#3a523f';
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
  fogLightFill: string;
  fogDarkFill: string;
  fogSolidLightFill: string;
  fogSolidDarkFill: string;
  fogLine: string;
  fogLineSoft: string;
  fogShadow: string;
};

// Default (wood) — matches the module constants above; this is what every
// caller gets when no palette is passed, and what the in-app 'standard' board
// theme renders.
export const BROWN_PALETTE: BoardPalette = {
  light: LIGHT_SQUARE,
  dark: DARK_SQUARE,
  fogLightFill: FOG_LIGHT_FILL,
  fogDarkFill: FOG_DARK_FILL,
  fogSolidLightFill: FOG_SOLID_LIGHT_FILL,
  fogSolidDarkFill: FOG_SOLID_DARK_FILL,
  fogLine: FOG_LINE,
  fogLineSoft: FOG_LINE_SOFT,
  fogShadow: FOG_SHADOW,
};

// GREEN_PALETTE (Tournament green) was deleted 2026-07-31 along with the board
// picker. It had one consumer left — the OG cards — and leaving it would have
// meant the social cards rendering a board the product no longer has. The
// palette *mechanism* stays: pass a BoardPalette to draw a board off-theme.

// Fog rendering style. 'solid' is the default opaque block style; 'veil' is a
// translucent overlay that preserves board colors.
export type FogStyle = 'striped' | 'solid' | 'veil';
