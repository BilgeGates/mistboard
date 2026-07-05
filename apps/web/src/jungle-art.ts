// Shared Jungle / Flip Jungle art recipe — the SINGLE source of truth for the dobutsu
// token + terrain look, imported by the vanilla board (jungle-render.ts), the flip board
// (jungle-flip-render.ts), and the ingress markers (variant-mini-boards.ts). Adjust the
// look here once and every jungle surface follows.
//
// CANONICAL: this recipe + the in-app piece set (apps/web/public/.../dobutsu) are the
// source of truth. The Dou Shou Qi blog widget (brianhliou.github.io,
// assets/js/jungle-replay.js) is a DOWNSTREAM copy that should match these values.
// Drop new piece art in public/, push it to the blog with `npm run publish:jungle-art`,
// and verify both are aligned with `npm run check:jungle-art` (diffs this recipe against
// the blog widget, and the blog's pieces against the canonical public set).

import type { JungleColor, JunglePieceRole } from '@mistboard/game';

// The composition spec. Ratios are relative to the token's nominal size (a cell-sized
// box); the blog uses CELL=48, so e.g. its 1.55px ring stroke is 1.55/48 ≈ 0.032.
export const JUNGLE_ART = {
  /** Cream disc face under every revealed animal. */
  discFill: '#fff2cf',
  /** Ink ring colour by side (also the last-mover/legibility cue). */
  ink: { red: '#b5322b', black: '#28323c' } as Record<JungleColor, string>,
  /** Disc radius ÷ token size. */
  discRadiusRatio: 0.485,
  /** Ring radius ÷ token size. */
  ringRadiusRatio: 0.45,
  /** Ring stroke width ÷ token size (1.55px at the blog's CELL=48). */
  ringStrokeRatio: 0.032,
  /** Per-role art trim so silhouettes sit consistently inside the disc; default 1. The
   *  v2 "Dobutsu Minimal" masters are pre-fitted (per-animal optical sizing baked into
   *  the PNGs), so no trims — adjust sizing in the masters, not here. */
  fit: {} as Partial<Record<JunglePieceRole, number>>,
  /** Soft drop-shadow under each token (blog: drop-shadow(0 1.5px 2px rgba(58,44,32,.34))). */
  shadow: { dx: 0, dy: 1.5, std: 1, color: '#3a2c20', opacity: 0.34 },
  /** Flip Jungle face-down tile: a banqi-style flat jade disc (neutral — the deal is
   *  hidden from both sides), sized to sit INSIDE the last-move ring. Ratios ÷ cell;
   *  mirrors live-banqi-render's .banqi-back (r = PIECE_SIZE·0.46 ≈ 0.374·cell). */
  faceDown: { fill: '#2f8f6b', stroke: '#184a38', radiusRatio: 0.374, strokeRatio: 0.031 },
} as const;

const PIECES_DIR = '/piece-sets/jungle/dobutsu';
const BOARD_DIR = '/piece-sets/jungle/dobutsu/board';
/** Cache-buster for the piece PNGs; bump when the art in public/ changes. v2 = the
 *  "Dobutsu Minimal" edition (2026-07-02). */
const PIECES_VERSION = 2;
/** Cache-buster for board terrain PNGs; bump when board art in public/ changes. */
const BOARD_VERSION = 2;

/** Dobutsu animal cutout href (same masters as the blog's jungle-dobutsu-pieces). */
export function jungleDobutsuPieceHref(color: JungleColor, role: JunglePieceRole): string {
  return `${PIECES_DIR}/${color}-${role}.png?v=${PIECES_VERSION}`;
}

/** Board terrain / tile art href: 'grass' | 'water' | 'den' | 'trap' | 'flip-board' | 'flip-back'. */
export function jungleBoardAssetHref(name: string): string {
  return `${BOARD_DIR}/${name}.png?v=${BOARD_VERSION}`;
}

/** A `<defs>` drop-shadow filter (not CSS, so it also renders in the rsvg/resvg OG pipeline). */
export function jungleShadowFilterDef(id: string): string {
  const { dx, dy, std, color, opacity } = JUNGLE_ART.shadow;
  return (
    `<filter id="${id}" x="-25%" y="-25%" width="150%" height="160%">` +
    `<feDropShadow dx="${dx}" dy="${dy}" stdDeviation="${std}" flood-color="${color}" flood-opacity="${opacity}"/>` +
    `</filter>`
  );
}

/** An <image> that covers its box (the terrain/tile layers). */
export function jungleCoverImage(href: string, x: number, y: number, w: number, h: number): string {
  return `<image href="${href}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>`;
}

export type FramedTokenOptions = {
  /** Token centre. */
  cx: number;
  cy: number;
  /** Nominal token size (the disc is sized from this, not the literal disc diameter). */
  size: number;
  ink: JungleColor;
  role: JunglePieceRole;
  /** Override the ring stroke ratio (markers use a heavier ring so it survives at thumbnail size). */
  ringStrokeRatio?: number;
  /** Optional drop-shadow filter id (boards pass one; markers usually don't). */
  filterId?: string;
};

/** The framed dobutsu token: cream disc + cutout (trimmed per role) + ink ring. */
export function framedTokenSvg(opts: FramedTokenOptions): string {
  const { cx, cy, size, ink, role, ringStrokeRatio, filterId } = opts;
  const discR = size * JUNGLE_ART.discRadiusRatio;
  const ringR = size * JUNGLE_ART.ringRadiusRatio;
  const ringW = size * (ringStrokeRatio ?? JUNGLE_ART.ringStrokeRatio);
  const imgSize = size * (JUNGLE_ART.fit[role] ?? 1);
  const open = filterId ? `<g filter="url(#${filterId})">` : '<g>';
  return [
    open,
    `<circle cx="${cx}" cy="${cy}" r="${discR}" fill="${JUNGLE_ART.discFill}"/>`,
    `<image href="${jungleDobutsuPieceHref(ink, role)}" x="${cx - imgSize / 2}" y="${cy - imgSize / 2}" width="${imgSize}" height="${imgSize}" preserveAspectRatio="xMidYMid meet"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${ringR}" fill="none" stroke="${JUNGLE_ART.ink[ink]}" stroke-width="${ringW}"/>`,
    `</g>`,
  ].join('');
}

/** Flip Jungle face-down tile: the banqi-style neutral jade disc (no identity), sized to
 *  sit inside the last-move ring. `cell` is the cell size; pass a filter id for a shadow. */
export function jungleFaceDownDiscSvg(
  cx: number,
  cy: number,
  cell: number,
  filterId?: string,
): string {
  const { fill, stroke, radiusRatio, strokeRatio } = JUNGLE_ART.faceDown;
  const open = filterId ? `<g filter="url(#${filterId})">` : '<g>';
  return `${open}<circle cx="${cx}" cy="${cy}" r="${cell * radiusRatio}" fill="${fill}" stroke="${stroke}" stroke-width="${cell * strokeRatio}"/></g>`;
}

/** Last-move marker: a bold bright-amber ring on a dark backing so it stays obvious on
 *  the grass/water terrain (a faint yellow washed out). */
export function jungleLastMoveRingSvg(
  x: number,
  y: number,
  cell: number,
  // Stroke widths ÷ cell. Default is the bold jungle ring; callers (Flip Jungle) can pass
  // thinner ratios for a lighter indicator.
  opts: { edgeRatio?: number; ringRatio?: number } = {},
): string {
  const inset = cell * 0.05;
  const hx = x + inset;
  const hy = y + inset;
  const hs = cell - inset * 2;
  const edge = cell * (opts.edgeRatio ?? 0.13);
  const ring = cell * (opts.ringRatio ?? 0.09);
  return (
    // Dark backing for contrast on any tile, then an amber ring + a stronger fill.
    `<rect x="${hx}" y="${hy}" width="${hs}" height="${hs}" rx="4" fill="rgba(255,170,0,0.34)" stroke="#201503" stroke-width="${edge}"/>` +
    `<rect x="${hx}" y="${hy}" width="${hs}" height="${hs}" rx="4" fill="none" stroke="#ffb000" stroke-width="${ring}"/>`
  );
}
