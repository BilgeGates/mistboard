import type { XiangqiColor, XiangqiPieceRole } from '@mistboard/game';
import { tokenPieceSize } from './board-metrics.js';

type LabRole = XiangqiPieceRole | 'treasure';

type LabPiece = {
  color: XiangqiColor;
  role: LabRole;
};

type PositionedPiece = LabPiece & {
  file: number;
  rank: number;
};

type ImageFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PieceVariant = {
  id: string;
  label: string;
  note: string;
  ringWidth: number;
  shadeDx?: number;
  shadeDy?: number;
  shadeOpacity?: number;
  strokeGainRadius?: number;
  strokeGainOpacity?: number;
};

const CELL = 72;
const MARGIN = 42;
const FILES = 7;
const RANKS = 8;
const BOARD_WIDTH = MARGIN * 2 + (FILES - 1) * CELL;
const BOARD_HEIGHT = MARGIN * 2 + (RANKS - 1) * CELL;
const PIECE_SIZE = tokenPieceSize(CELL);

const RED_INK = '#c30d0d';
const BLACK_INK = '#202427';
const DISC_FILL = '#fef0d7';
const GRID_INK = '#5a3a14';
const BOARD_FILL = '#f5dca8';

const ROLE_LABELS: Record<LabRole, string> = {
  general: 'General',
  advisor: 'Advisor',
  elephant: 'Elephant',
  horse: 'Horse',
  chariot: 'Chariot',
  cannon: 'Cannon',
  soldier: 'Soldier',
  treasure: 'Treasure',
};

const ROLE_ORDER: LabRole[] = [
  'general',
  'advisor',
  'elephant',
  'horse',
  'chariot',
  'cannon',
  'soldier',
  'treasure',
];

const IMAGE_FRAMES: Record<LabRole, ImageFrame> = {
  general: { x: -7, y: -7, width: 114, height: 114 },
  advisor: { x: -7, y: -7, width: 114, height: 114 },
  elephant: { x: -5, y: -5, width: 110, height: 110 },
  horse: { x: -7, y: -7, width: 114, height: 114 },
  chariot: { x: -5.5, y: -7, width: 111, height: 114 },
  cannon: { x: -11, y: -11, width: 122, height: 122 },
  soldier: { x: 0, y: 0, width: 100, height: 100 },
  treasure: { x: -7, y: -7, width: 114, height: 114 },
};

const VARIANTS: PieceVariant[] = [
  {
    id: 'baseline',
    label: 'Current',
    note: 'Production ring and art scale.',
    ringWidth: 2.8,
  },
  {
    id: 'ring4',
    label: 'Ring 4',
    note: 'A lighter outer ring test, still visibly stronger than production.',
    ringWidth: 4,
  },
  {
    id: 'ring5',
    label: 'Ring 5',
    note: 'The thicker outer ring that read well in the first pass.',
    ringWidth: 5,
  },
  {
    id: 'ring4-stroke',
    label: 'Ring 4 + stroke',
    note: 'Ring 4 with a moderate figure-only stroke gain.',
    ringWidth: 4,
    strokeGainRadius: 0.42,
    strokeGainOpacity: 0.8,
  },
  {
    id: 'ring5-stroke',
    label: 'Ring 5 + stroke',
    note: 'Ring 5 with the same moderate figure-only stroke gain.',
    ringWidth: 5,
    strokeGainRadius: 0.42,
    strokeGainOpacity: 0.8,
  },
  {
    id: 'ring4-bold',
    label: 'Ring 4 + bold',
    note: 'A heavier figure-only stroke gain, to test legibility before source edits.',
    ringWidth: 4,
    strokeGainRadius: 0.58,
    strokeGainOpacity: 0.82,
  },
  {
    id: 'ring4-shade',
    label: 'Ring 4 + shade',
    note: 'A small directional shade plus light stroke gain, no art scaling or pinline.',
    ringWidth: 4,
    shadeDx: 0.8,
    shadeDy: 0.9,
    shadeOpacity: 0.28,
    strokeGainRadius: 0.28,
    strokeGainOpacity: 0.72,
  },
];

const BOARD_PIECES: PositionedPiece[] = [
  { color: 'black', role: 'advisor', file: 4, rank: 8 },
  { color: 'black', role: 'general', file: 5, rank: 8 },
  { color: 'black', role: 'treasure', file: 6, rank: 8 },
  { color: 'black', role: 'soldier', file: 0, rank: 7 },
  { color: 'black', role: 'chariot', file: 1, rank: 7 },
  { color: 'black', role: 'soldier', file: 5, rank: 7 },
  { color: 'black', role: 'soldier', file: 6, rank: 7 },
  { color: 'black', role: 'horse', file: 1, rank: 6 },
  { color: 'black', role: 'chariot', file: 2, rank: 6 },
  { color: 'black', role: 'elephant', file: 5, rank: 6 },
  { color: 'black', role: 'cannon', file: 0, rank: 5 },
  { color: 'black', role: 'soldier', file: 3, rank: 5 },
  { color: 'red', role: 'cannon', file: 1, rank: 4 },
  { color: 'red', role: 'elephant', file: 1, rank: 3 },
  { color: 'red', role: 'soldier', file: 5, rank: 3 },
  { color: 'red', role: 'horse', file: 6, rank: 3 },
  { color: 'red', role: 'soldier', file: 0, rank: 2 },
  { color: 'red', role: 'soldier', file: 1, rank: 2 },
  { color: 'red', role: 'soldier', file: 3, rank: 2 },
  { color: 'red', role: 'soldier', file: 6, rank: 2 },
  { color: 'red', role: 'treasure', file: 0, rank: 1 },
  { color: 'red', role: 'general', file: 1, rank: 1 },
  { color: 'red', role: 'advisor', file: 2, rank: 1 },
];

export function mountXiangqiPieceLab(root: HTMLElement): void {
  root.classList.add('xiangqi-piece-lab-route');
  root.replaceChildren();
  installStyles();

  const page = document.createElement('main');
  page.className = 'xq-piece-lab';

  const header = document.createElement('header');
  header.className = 'xq-piece-lab__header';
  const title = document.createElement('h1');
  title.textContent = 'Xiangqi Piece Lab';
  const summary = document.createElement('p');
  summary.textContent =
    'International set readability probes at full-board, Fortress-board, and widget scale.';
  header.append(title, summary);

  const legend = document.createElement('section');
  legend.className = 'xq-piece-lab__legend';
  for (const variant of VARIANTS) legend.append(variantButton(variant));

  const featureBoard = document.createElement('section');
  featureBoard.className = 'xq-piece-lab__feature-board';
  featureBoard.append(featureBoardCard(VARIANTS[0]));

  const boardGrid = document.createElement('section');
  boardGrid.className = 'xq-piece-lab__boards';
  for (const variant of VARIANTS) boardGrid.append(boardCard(variant));

  const strips = document.createElement('section');
  strips.className = 'xq-piece-lab__strips';
  for (const variant of VARIANTS) strips.append(stripCard(variant));

  page.append(header, legend, featureBoard, boardGrid, strips);
  root.append(page);
}

function variantButton(variant: PieceVariant): HTMLElement {
  const item = document.createElement('article');
  item.className = 'xq-piece-lab__legend-item';
  const sample = document.createElement('div');
  sample.className = 'xq-piece-lab__legend-sample';
  sample.innerHTML = renderPiece({ color: 'red', role: 'horse' }, variant, {
    scope: `legend-${variant.id}`,
  });
  const label = document.createElement('h2');
  label.textContent = variant.label;
  const note = document.createElement('p');
  note.textContent = variant.note;
  item.append(sample, label, note);
  return item;
}

function featureBoardCard(variant: PieceVariant): HTMLElement {
  const article = document.createElement('article');
  article.className = 'xq-piece-lab__feature-board-card';

  const heading = document.createElement('h2');
  heading.textContent = `${variant.label} full board`;

  const board = document.createElement('div');
  board.className = 'xq-piece-lab__feature-board-box';
  board.innerHTML = renderBoard(variant, `board-feature-${variant.id}`);

  article.append(heading, board);
  return article;
}

function boardCard(variant: PieceVariant): HTMLElement {
  const article = document.createElement('article');
  article.className = 'xq-piece-lab__board-card';

  const heading = document.createElement('h2');
  heading.textContent = variant.label;

  const sideBySide = document.createElement('div');
  sideBySide.className = 'xq-piece-lab__board-pair';

  const full = document.createElement('div');
  full.className = 'xq-piece-lab__board-box xq-piece-lab__board-box-full';
  full.innerHTML = renderBoard(variant, `board-full-${variant.id}`);

  const small = document.createElement('div');
  small.className = 'xq-piece-lab__board-box xq-piece-lab__board-box-small';
  small.innerHTML = renderBoard(variant, `board-small-${variant.id}`);

  sideBySide.append(full, small);
  article.append(heading, sideBySide);
  return article;
}

function stripCard(variant: PieceVariant): HTMLElement {
  const article = document.createElement('article');
  article.className = 'xq-piece-lab__strip-card';
  const heading = document.createElement('h2');
  heading.textContent = variant.label;

  for (const size of [64, 48, 36]) {
    const row = document.createElement('div');
    row.className = 'xq-piece-lab__strip-row';
    const label = document.createElement('span');
    label.className = 'xq-piece-lab__strip-label';
    label.textContent = `${size}px`;
    row.append(label);
    for (const color of ['red', 'black'] as const) {
      for (const role of ROLE_ORDER) {
        const token = document.createElement('span');
        token.className = 'xq-piece-lab__token';
        token.style.setProperty('--lab-piece-size', `${size}px`);
        token.title = `${color} ${ROLE_LABELS[role]}`;
        token.innerHTML = renderPiece({ color, role }, variant, {
          scope: `strip-${variant.id}-${size}-${color}-${role}`,
        });
        row.append(token);
      }
    }
    article.append(row);
  }

  article.prepend(heading);
  return article;
}

function renderBoard(variant: PieceVariant, scope: string): string {
  return [
    `<svg class="xq-piece-lab-board" viewBox="0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeAttr(variant.label)} Fortress Xiangqi preview">`,
    `<rect class="xq-piece-lab-board__bg" x="0" y="0" width="${BOARD_WIDTH}" height="${BOARD_HEIGHT}" rx="10"/>`,
    `<rect class="xq-piece-lab-board__river" x="${MARGIN}" y="${MARGIN + 3 * CELL}" width="${(FILES - 1) * CELL}" height="${CELL}"/>`,
    `<g class="xq-piece-lab-board__grid">${gridLines()}${palaceCrosses()}</g>`,
    `<rect class="xq-piece-lab-board__last" x="${point(1, 4).x - CELL / 2}" y="${point(1, 4).y - CELL / 2}" width="${CELL}" height="${CELL}"/>`,
    `<rect class="xq-piece-lab-board__last" x="${point(5, 6).x - CELL / 2}" y="${point(5, 6).y - CELL / 2}" width="${CELL}" height="${CELL}"/>`,
    BOARD_PIECES.map((piece, index) => {
      const center = point(piece.file, piece.rank);
      return renderPiece(piece, variant, {
        scope: `${scope}-${index}`,
        x: center.x - PIECE_SIZE / 2,
        y: center.y - PIECE_SIZE / 2,
        size: PIECE_SIZE,
        className: 'xq-piece-lab-board__piece',
      });
    }).join(''),
    `</svg>`,
  ].join('');
}

function renderPiece(
  piece: LabPiece,
  variant: PieceVariant,
  opts: { scope: string; x?: number; y?: number; size?: number; className?: string },
): string {
  const color = piece.color === 'red' ? RED_INK : BLACK_INK;
  const frame = IMAGE_FRAMES[piece.role];
  const posAttrs =
    opts.size !== undefined || opts.x !== undefined || opts.y !== undefined
      ? ` x="${format(opts.x ?? 0)}" y="${format(opts.y ?? 0)}" width="${format(opts.size ?? 100)}" height="${format(opts.size ?? 100)}"`
      : '';
  const classAttr = opts.className ? ` class="${escapeAttr(opts.className)}"` : '';
  const filter = hasFigureFilter(variant)
    ? ` filter="url(#${escapeAttr(`${opts.scope}-figure-filter`)})"`
    : '';
  return [
    `<svg${classAttr}${posAttrs} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-label="${piece.color} ${ROLE_LABELS[piece.role]}">`,
    filterDefs(opts.scope, color, variant),
    `<circle cx="50" cy="50" r="46" fill="${DISC_FILL}"/>`,
    imageMark(piece, frame, filter),
    `<circle cx="50" cy="50" r="46" fill="none" stroke="${color}" stroke-width="${variant.ringWidth}"/>`,
    `</svg>`,
  ].join('');
}

function filterDefs(scope: string, color: string, variant: PieceVariant): string {
  if (!hasFigureFilter(variant)) return '';
  const shadeColor = color === RED_INK ? '#7b0909' : '#050607';
  const parts: string[] = ['<defs>'];
  parts.push(
    `<filter id="${escapeAttr(`${scope}-figure-filter`)}" x="-16%" y="-16%" width="132%" height="132%" color-interpolation-filters="sRGB">`,
  );
  if (variant.shadeOpacity) {
    parts.push(
      `<feFlood flood-color="${shadeColor}" flood-opacity="${variant.shadeOpacity}" result="shade-color"/>`,
      '<feComposite in="shade-color" in2="SourceAlpha" operator="in" result="shade-mask"/>',
      `<feOffset in="shade-mask" dx="${format(variant.shadeDx ?? 1)}" dy="${format(variant.shadeDy ?? 1)}" result="figure-shade"/>`,
    );
  }
  if (variant.strokeGainRadius) {
    parts.push(
      `<feMorphology in="SourceAlpha" operator="dilate" radius="${format(variant.strokeGainRadius)}" result="stroke-gain-mask"/>`,
      `<feFlood flood-color="${color}" flood-opacity="${variant.strokeGainOpacity ?? 0.74}" result="stroke-gain-color"/>`,
      '<feComposite in="stroke-gain-color" in2="stroke-gain-mask" operator="in" result="stroke-gain"/>',
    );
  }
  parts.push('<feMerge>');
  if (variant.shadeOpacity) parts.push('<feMergeNode in="figure-shade"/>');
  if (variant.strokeGainRadius) parts.push('<feMergeNode in="stroke-gain"/>');
  parts.push('<feMergeNode in="SourceGraphic"/>', '</feMerge>', '</filter>', '</defs>');
  return parts.join('');
}

function hasFigureFilter(variant: PieceVariant): boolean {
  return Boolean(variant.shadeOpacity || variant.strokeGainRadius);
}

function imageMark(piece: LabPiece, frame: ImageFrame, attrs: string): string {
  return `<image href="${pieceHref(piece)}" x="${format(frame.x)}" y="${format(frame.y)}" width="${format(frame.width)}" height="${format(frame.height)}" preserveAspectRatio="xMidYMid meet"${attrs}/>`;
}

function pieceHref(piece: LabPiece): string {
  return `/piece-sets/xiangqi/international/${piece.color}-${piece.role}.png?v=11`;
}

function gridLines(): string {
  const parts: string[] = [];
  const left = MARGIN;
  const right = MARGIN + (FILES - 1) * CELL;
  const top = MARGIN;
  const bottom = MARGIN + (RANKS - 1) * CELL;
  for (let r = 0; r < RANKS; r += 1) {
    const y = MARGIN + r * CELL;
    parts.push(`<line x1="${left}" y1="${y}" x2="${right}" y2="${y}"/>`);
  }
  const riverTop = MARGIN + 3 * CELL;
  const riverBottom = MARGIN + 4 * CELL;
  for (let f = 0; f < FILES; f += 1) {
    const x = MARGIN + f * CELL;
    if (f === 0 || f === FILES - 1) {
      parts.push(`<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}"/>`);
    } else {
      parts.push(`<line x1="${x}" y1="${top}" x2="${x}" y2="${riverTop}"/>`);
      parts.push(`<line x1="${x}" y1="${riverBottom}" x2="${x}" y2="${bottom}"/>`);
    }
  }
  return parts.join('');
}

function palaceCrosses(): string {
  return [
    palaceCross(0, 1, 2, 3),
    palaceCross(4, 6, 6, 8),
  ].join('');
}

function palaceCross(fileLo: number, fileHi: number, rankLo: number, rankHi: number): string {
  const a = point(fileLo, rankLo);
  const b = point(fileHi, rankHi);
  const c = point(fileHi, rankLo);
  const d = point(fileLo, rankHi);
  return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/><line x1="${c.x}" y1="${c.y}" x2="${d.x}" y2="${d.y}"/>`;
}

function point(file: number, rank: number): { x: number; y: number } {
  return {
    x: MARGIN + file * CELL,
    y: MARGIN + (RANKS - rank) * CELL,
  };
}

function format(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function installStyles(): void {
  if (document.getElementById('xiangqi-piece-lab-styles')) return;
  const style = document.createElement('style');
  style.id = 'xiangqi-piece-lab-styles';
  style.textContent = `
    .xiangqi-piece-lab-route {
      min-height: 100vh;
      background: #f4f1e9;
      color: #1d1c19;
    }
    .xq-piece-lab {
      width: min(1480px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 30px 0 52px;
    }
    .xq-piece-lab__header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 24px;
      margin-bottom: 18px;
      border-bottom: 1px solid rgba(41, 37, 32, 0.16);
      padding-bottom: 14px;
    }
    .xq-piece-lab__header h1 {
      margin: 0;
      font-size: clamp(28px, 3vw, 42px);
      letter-spacing: 0;
    }
    .xq-piece-lab__header p {
      max-width: 560px;
      margin: 0;
      color: #5f5a51;
      font-size: 14px;
      line-height: 1.45;
      text-align: right;
    }
    .xq-piece-lab__legend {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 20px;
    }
    .xq-piece-lab__legend-item,
    .xq-piece-lab__feature-board-card,
    .xq-piece-lab__board-card,
    .xq-piece-lab__strip-card {
      background: #fffaf0;
      border: 1px solid rgba(41, 37, 32, 0.14);
      border-radius: 8px;
      box-shadow: 0 8px 20px rgba(41, 37, 32, 0.07);
    }
    .xq-piece-lab__legend-item {
      display: grid;
      grid-template-columns: 60px minmax(0, 1fr);
      grid-template-rows: auto auto;
      gap: 2px 10px;
      min-width: 0;
      padding: 10px;
    }
    .xq-piece-lab__legend-sample {
      grid-row: 1 / 3;
      width: 60px;
      height: 60px;
    }
    .xq-piece-lab__legend-sample svg {
      display: block;
      width: 100%;
      height: 100%;
    }
    .xq-piece-lab__legend-item h2,
    .xq-piece-lab__feature-board-card h2,
    .xq-piece-lab__board-card h2,
    .xq-piece-lab__strip-card h2 {
      margin: 0;
      font-size: 14px;
      line-height: 1.2;
      letter-spacing: 0;
    }
    .xq-piece-lab__legend-item p {
      margin: 0;
      color: #645d52;
      font-size: 12px;
      line-height: 1.28;
    }
    .xq-piece-lab__boards {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
      margin-bottom: 18px;
    }
    .xq-piece-lab__feature-board {
      margin-bottom: 18px;
    }
    .xq-piece-lab__feature-board-card,
    .xq-piece-lab__board-card {
      padding: 12px;
    }
    .xq-piece-lab__feature-board-card h2,
    .xq-piece-lab__board-card h2 {
      margin-bottom: 10px;
    }
    .xq-piece-lab__feature-board-box {
      width: min(860px, 100%);
      margin: 0 auto;
      overflow: hidden;
      border-radius: 8px;
      background: #efe3c7;
    }
    .xq-piece-lab__feature-board-box svg {
      display: block;
      width: 100%;
      height: auto;
    }
    .xq-piece-lab__board-pair {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 132px;
      gap: 10px;
      align-items: start;
    }
    .xq-piece-lab__board-box {
      overflow: hidden;
      border-radius: 8px;
      background: #efe3c7;
    }
    .xq-piece-lab__board-box svg {
      display: block;
      width: 100%;
      height: auto;
    }
    .xq-piece-lab__board-box-small {
      width: 132px;
    }
    .xq-piece-lab-board__bg {
      fill: ${BOARD_FILL};
    }
    .xq-piece-lab-board__river {
      fill: ${BOARD_FILL};
    }
    .xq-piece-lab-board__grid line {
      stroke: ${GRID_INK};
      stroke-width: 2;
      stroke-linecap: round;
    }
    .xq-piece-lab-board__last {
      fill: rgba(250, 204, 21, 0.22);
      stroke: rgba(180, 83, 9, 0.55);
      stroke-width: 2;
      pointer-events: none;
    }
    .xq-piece-lab-board__piece {
      pointer-events: none;
      filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.18));
    }
    .xq-piece-lab__strips {
      display: grid;
      gap: 12px;
    }
    .xq-piece-lab__strip-card {
      padding: 12px;
    }
    .xq-piece-lab__strip-card h2 {
      margin-bottom: 8px;
    }
    .xq-piece-lab__strip-row {
      display: flex;
      align-items: center;
      gap: 5px;
      min-height: calc(var(--lab-piece-size, 48px) + 4px);
      overflow-x: auto;
      padding: 2px 0;
    }
    .xq-piece-lab__strip-label {
      flex: 0 0 44px;
      color: #6d665c;
      font-size: 12px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .xq-piece-lab__token {
      flex: 0 0 var(--lab-piece-size);
      width: var(--lab-piece-size);
      height: var(--lab-piece-size);
    }
    .xq-piece-lab__token svg {
      display: block;
      width: 100%;
      height: 100%;
    }
    @media (max-width: 1120px) {
      .xq-piece-lab__legend,
      .xq-piece-lab__boards {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (max-width: 720px) {
      .xq-piece-lab {
        width: min(100vw - 18px, 520px);
        padding-top: 18px;
      }
      .xq-piece-lab__header {
        display: block;
      }
      .xq-piece-lab__header p {
        margin-top: 8px;
        text-align: left;
      }
      .xq-piece-lab__legend,
      .xq-piece-lab__boards {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.append(style);
}
