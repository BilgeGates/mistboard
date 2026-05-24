import type { Color, Square } from '@mistboard/game';
import { fogPatternDefs, type PieceOnBoard, renderBoardSvg } from './board-svg.js';
import { boardsInLayout, type CompositionLayout, layoutPlacements } from './layouts.js';
import type { BoardPalette, FogStyle } from './tokens.js';

export type BoardSpec = {
  pieces: PieceOnBoard[];
  fogSquares?: Square[];
  orientation?: Color;
  label?: string;
};

export type CompositionOptions = {
  layout: CompositionLayout;
  boards: BoardSpec[];
  canvasWidth: number;
  boardY: number;
  boardSize: number;
  gap?: number;
  labelY?: number;
  labelFill?: string;
  labelFontSize?: number;
  labelLetterSpacing?: number;
  palette?: BoardPalette;
  fogStyle?: FogStyle;
};

const DEFAULT_GAP = 144;
const FONT_FAMILY = 'system-ui, -apple-system, Helvetica, Arial, sans-serif';
const DEFAULT_LABEL_FILL = '#9ca3af';
const DEFAULT_LABEL_FONT_SIZE = 22;
const DEFAULT_LABEL_LETTER_SPACING = 2;

// Returns inner SVG content (labels above each board, then the boards).
// Caller is responsible for the outer <svg> wrapper, background, and any
// surrounding chrome (brand wordmark, captions, footer).
export function renderBoardComposition(opts: CompositionOptions): string {
  const {
    layout,
    boards,
    canvasWidth,
    boardY,
    boardSize,
    gap = DEFAULT_GAP,
    labelY = boardY - 20,
    labelFill = DEFAULT_LABEL_FILL,
    labelFontSize = DEFAULT_LABEL_FONT_SIZE,
    labelLetterSpacing = DEFAULT_LABEL_LETTER_SPACING,
    palette,
    fogStyle,
  } = opts;

  const expected = boardsInLayout(layout);
  if (boards.length !== expected) {
    throw new Error(`Layout '${layout}' expects ${expected} board(s), got ${boards.length}`);
  }

  const xs = layoutPlacements(layout, canvasWidth, boardSize, gap);
  const parts: string[] = [fogPatternDefs(boardSize, palette)];

  for (let i = 0; i < boards.length; i += 1) {
    const label = boards[i]!.label;
    if (!label) continue;
    const cx = xs[i]! + boardSize / 2;
    parts.push(
      `<text x="${cx}" y="${labelY}" text-anchor="middle" fill="${labelFill}" font-family="${FONT_FAMILY}" font-size="${labelFontSize}" letter-spacing="${labelLetterSpacing}">${escapeLabel(label)}</text>`,
    );
  }
  for (let i = 0; i < boards.length; i += 1) {
    const b = boards[i]!;
    parts.push(
      renderBoardSvg(
        b.pieces,
        b.fogSquares ?? [],
        xs[i]!,
        boardY,
        boardSize,
        b.orientation ?? 'white',
        { palette, fogStyle },
      ),
    );
  }
  return parts.join('');
}

function escapeLabel(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
