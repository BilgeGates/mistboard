// Selectable piece sets for shogi (the live Dark Shogi board, its reserves /
// drag ghost, and the regular-shogi rules diagrams).
//
// Two kinds:
//   - TEXT sets draw a glyph on the renderer's pentagonal koma tile:
//       kanji        traditional Mincho characters (the default)
//       kanji-light  the same characters in a cleaner gothic face
//       western      Latin notation (K R B G S N L P), promoted prefixed '+'
//   - IMAGE sets place a bundled lishogi koma SVG per piece (each file is a
//     complete, side-oriented koma — 0XX sente apex-up, 1XX gote apex-down):
//       international  CouchTomato87 line-art icons      (CC BY 4.0)
//       colored        CouchTomato87 color-coded icons   (CC BY 4.0)
//       chess          peanatsu chess-piece silhouettes  (CC BY-SA 3.0)
//     Art is bundled under apps/web/public/piece-sets/<folder>/; attribution is
//     shown in the appearance picker (see SHOGI_IMAGE_SET_CREDITS).
//
// Mirrors the xiangqi piece-set module: a small data table plus resolvers the
// renderer consumes, and a preview for the settings-panel tile.

import type { ShogiPiece, ShogiPieceRole } from '@mistboard/game';

export type ShogiPieceSet =
  | 'kanji'
  | 'kanji-light'
  | 'western'
  | 'international'
  | 'colored'
  | 'chess';

export const SHOGI_PIECE_SETS: ReadonlyArray<{ id: ShogiPieceSet; label: string }> = [
  { id: 'kanji', label: 'Kanji' },
  { id: 'kanji-light', label: 'Kanji light' },
  { id: 'western', label: 'Latin' },
  { id: 'international', label: 'International' },
  { id: 'colored', label: 'Colored' },
  { id: 'chess', label: 'Chess' },
];

export const DEFAULT_SHOGI_PIECE_SET: ShogiPieceSet = 'kanji';

// ── Image sets ────────────────────────────────────────────────────────────────

export type ShogiImageSet = {
  // Asset folder under /piece-sets/.
  folder: string;
  author: string;
  authorUrl: string;
  license: string;
  licenseUrl: string;
};

const IMAGE_SETS: Partial<Record<ShogiPieceSet, ShogiImageSet>> = {
  international: {
    folder: 'international',
    author: 'CouchTomato87',
    authorUrl: 'https://github.com/CouchTomato87',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  },
  colored: {
    folder: 'colored',
    author: 'CouchTomato87',
    authorUrl: 'https://github.com/CouchTomato87',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  },
  chess: {
    folder: 'chess',
    author: 'peanatsu',
    authorUrl: 'https://github.com/peanatsu',
    license: 'CC BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
  },
};

export function shogiImageSet(set: ShogiPieceSet): ShogiImageSet | undefined {
  return IMAGE_SETS[set];
}

// One credit line per distinct (author, license), for the attribution note.
export const SHOGI_IMAGE_SET_CREDITS: ReadonlyArray<{
  sets: string;
  author: string;
  authorUrl: string;
  license: string;
  licenseUrl: string;
}> = [
  {
    sets: 'International, Colored',
    author: 'CouchTomato87',
    authorUrl: 'https://github.com/CouchTomato87/InternationalizedPieces',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  },
  {
    sets: 'Chess',
    author: 'peanatsu',
    authorUrl: 'https://github.com/peanatsu',
    license: 'CC BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
  },
];

// lishogi 2-letter piece codes. Promotion swaps to the promoted code; king and
// gold never promote.
const PIECE_CODE: Record<ShogiPieceRole, string> = {
  K: 'OU',
  R: 'HI',
  B: 'KA',
  G: 'KI',
  S: 'GI',
  N: 'KE',
  L: 'KY',
  P: 'FU',
};
const PROMOTED_CODE: Partial<Record<ShogiPieceRole, string>> = {
  R: 'RY',
  B: 'UM',
  S: 'NG',
  N: 'NK',
  L: 'NY',
  P: 'TO',
};

export function shogiPieceCode(piece: ShogiPiece): string {
  if (piece.promoted) return PROMOTED_CODE[piece.role] ?? PIECE_CODE[piece.role];
  return PIECE_CODE[piece.role];
}

// Asset href for an image-set piece. `own` = the piece belongs to the bottom
// (perspective) player, so it uses the sente-oriented art (apex up, prefix 0);
// the opponent uses the gote art (apex down, prefix 1).
export function shogiImagePieceHref(set: ShogiImageSet, piece: ShogiPiece, own: boolean): string {
  return `/piece-sets/${set.folder}/${own ? '0' : '1'}${shogiPieceCode(piece)}.svg`;
}

// ── Text sets ─────────────────────────────────────────────────────────────────

// Single-character koma faces. King differs by side (王 sente / 玉 gote); the
// rest share a face across colors.
const KANJI: Record<ShogiPieceRole, string> = {
  K: '王',
  R: '飛',
  B: '角',
  G: '金',
  S: '銀',
  N: '桂',
  L: '香',
  P: '歩',
};
const PROMOTED_KANJI: Partial<Record<ShogiPieceRole, string>> = {
  R: '龍',
  B: '馬',
  S: '全',
  N: '圭',
  L: '杏',
  P: 'と',
};

// Latin notation: chess-style initials. Gold/king never promote; the other five
// promote, shown as the base letter prefixed with '+'.
const WESTERN: Record<ShogiPieceRole, string> = {
  K: 'K',
  R: 'R',
  B: 'B',
  G: 'G',
  S: 'S',
  N: 'N',
  L: 'L',
  P: 'P',
};

const KANJI_SERIF = '"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif';
const KANJI_GOTHIC = '"Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif';
const WESTERN_FONT = '"Inter","Helvetica Neue",Arial,sans-serif';

export type ShogiGlyph = {
  // The character(s) to draw on the koma.
  text: string;
  fontFamily: string;
  fontWeight: number;
  // Glyph size as a fraction of the koma tile (font-size = fontScale * tile).
  fontScale: number;
  // Whether a promoted piece is inked red (true for every text set here).
  promotedInk: boolean;
};

const PROMOTABLE = (piece: ShogiPiece): boolean =>
  piece.promoted && piece.role !== 'K' && piece.role !== 'G';

// Resolve the glyph + type styling for one piece in a TEXT set. The renderer owns
// geometry (tile, centering); this owns what character is drawn and how big.
// (Image sets bypass this entirely.)
export function shogiGlyph(set: ShogiPieceSet, piece: ShogiPiece): ShogiGlyph {
  if (set === 'western') {
    const base = WESTERN[piece.role];
    const promoted = PROMOTABLE(piece);
    return {
      text: promoted ? `+${base}` : base,
      fontFamily: WESTERN_FONT,
      fontWeight: 700,
      // '+R' is two characters, so it renders a touch smaller than a lone letter.
      fontScale: promoted ? 0.4 : 0.56,
      promotedInk: true,
    };
  }
  return {
    text: kanjiFace(piece),
    fontFamily: set === 'kanji-light' ? KANJI_GOTHIC : KANJI_SERIF,
    fontWeight: set === 'kanji-light' ? 500 : 600,
    fontScale: 0.58,
    promotedInk: true,
  };
}

function kanjiFace(piece: ShogiPiece): string {
  if (piece.role === 'K') return piece.color === 'black' ? '王' : '玉';
  if (piece.promoted) return PROMOTED_KANJI[piece.role] ?? KANJI[piece.role];
  return KANJI[piece.role];
}

// Settings-tile preview: a representative koma. Text sets show the rook glyph;
// image sets show the bundled sente king art.
export function shogiPieceTilePreview(
  set: ShogiPieceSet,
): { kind: 'text'; text: string } | { kind: 'image'; href: string } {
  const image = shogiImageSet(set);
  if (image) return { kind: 'image', href: `/piece-sets/${image.folder}/0OU.svg` };
  return {
    kind: 'text',
    text: shogiGlyph(set, { color: 'black', role: 'R', promoted: false }).text,
  };
}

// A representative glyph for a TEXT set's settings tile (the rook: 飛 / R).
export function shogiPreviewGlyph(set: ShogiPieceSet): string {
  return shogiGlyph(set, { color: 'black', role: 'R', promoted: false }).text;
}
