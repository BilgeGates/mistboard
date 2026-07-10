// SVG piece sprites for the FoW Xiangqi spike.
//
// Authored in-repo so we own the licensing. Two glyph sets per the traditional
// red/black convention (the "two-sets" tradition used in Chinese chess sets):
//   Red:   帥 仕 相 傌 俥 炮 兵
//   Black: 將 士 象 馬 車 砲 卒
//
// Older xiangqi boards still import renderXiangqiPiece from this module. Keep
// that public entry point, but delegate it to the selectable family renderer so
// the default international set reaches every xiangqi surface.

import type { XiangqiColor, XiangqiPiece, XiangqiPieceRole } from '@mistboard/game';
import { readStoredXiangqiPieceSet } from './xiangqi-appearance-storage.js';
import {
  renderXiangqiPieceGlyphed,
  type XiangqiPieceSet,
  type XiangqiPieceRenderOptions as XiangqiPieceSetRenderOptions,
} from './xiangqi-piece-sets.js';

const CHARACTERS: Record<XiangqiColor, Record<XiangqiPieceRole, string>> = {
  red: {
    general: '帥',
    advisor: '仕',
    elephant: '相',
    horse: '傌',
    chariot: '俥',
    cannon: '炮',
    soldier: '兵',
  },
  black: {
    general: '將',
    advisor: '士',
    elephant: '象',
    horse: '馬',
    chariot: '車',
    cannon: '砲',
    soldier: '卒',
  },
};

export type XiangqiPieceRenderOptions = XiangqiPieceSetRenderOptions & {
  pieceSet?: XiangqiPieceSet;
};

export function xiangqiCharacter(color: XiangqiColor, role: XiangqiPieceRole): string {
  return CHARACTERS[color][role];
}

export function renderXiangqiPiece(
  piece: XiangqiPiece,
  opts: XiangqiPieceRenderOptions = {},
): string {
  const { pieceSet, ...renderOpts } = opts;
  return renderXiangqiPieceGlyphed(piece, pieceSet ?? readStoredXiangqiPieceSet(), renderOpts);
}
