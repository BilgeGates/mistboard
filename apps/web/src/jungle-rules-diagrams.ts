// Inline board diagrams for the Jungle + Flip Jungle rules articles.
//
// Built on the live board renderers (renderJungleBoardSvg / renderJungleFlipBoardSvg)
// so every diagram shows the exact furniture a player sees (rivers, dens, traps,
// animal discs) and AUTOMATICALLY inherits bespoke animal art the moment the graphics
// session swaps the renderers' glyphs for images. This module only CONSUMES the
// renderers; it never touches their piece-drawing internals.
//
// Each diagram passes a unique idSuffix so its namespaced <defs> (gradients, clip,
// drop-shadow) never collide when several boards share one article page.

import {
  createInitialJungleBoard,
  type JungleBoard,
  type JungleFlipSquare,
  type JunglePieceRole,
} from '@mistboard/game';
import { framedTokenSvg, jungleShadowFilterDef } from './jungle-art.js';
import {
  type JungleFlipRenderBoard,
  type JungleFlipRenderEntry,
  renderJungleFlipBoardSvg,
} from './jungle-flip-render.js';
import { type JungleRenderOptions, renderJungleBoardSvg } from './jungle-render.js';

// The live renderers emit a viewBox-only <svg class="jungle(-flip)-live-svg"> whose
// global CSS rule is width/height 100% (sized by its live board container). In an
// article figure there is no such container, so each diagram carries its own inline
// width cap + height:auto (inline beats the class rule), exactly like the shogi4
// rules diagrams self-size.
function responsive(svg: string, maxWidth: number): string {
  return svg.replace(
    '<svg ',
    `<svg width="100%" style="max-width:${maxWidth}px;height:auto;display:block;margin:0 auto" `,
  );
}

function jungleDiagram(
  idSuffix: string,
  board: JungleBoard,
  options: Omit<JungleRenderOptions, 'idSuffix'>,
  maxWidth: number,
): string {
  return responsive(renderJungleBoardSvg(board, { ...options, idSuffix }), maxWidth);
}

function flipDiagram(
  idSuffix: string,
  board: JungleFlipRenderBoard,
  options: { selected?: JungleFlipSquare; targets?: readonly JungleFlipSquare[] },
  maxWidth: number,
): string {
  return responsive(
    renderJungleFlipBoardSvg(board, {
      idSuffix,
      selected: options.selected ?? null,
      targets: options.targets ?? [],
    }),
    maxWidth,
  );
}

// ── Vanilla Jungle (7×9) ─────────────────────────────────────────────────────

export const JUNGLE_START_BOARD = jungleDiagram(
  '-start',
  createInitialJungleBoard(),
  { perspective: 'red' },
  440,
);

// The one rank exception: a rat captures the elephant. Placed on the central dry
// lane (the d-file is land even where it splits the two rivers).
const RAT_ELEPHANT_BOARD: JungleBoard = {
  d4: { color: 'red', role: 'rat' },
  d5: { color: 'black', role: 'elephant' },
};
export const JUNGLE_RAT_ELEPHANT = jungleDiagram(
  '-rat-elephant',
  RAT_ELEPHANT_BOARD,
  { selected: 'd4', targets: ['d5'] },
  360,
);

// A piece on an enemy trap loses all rank, so even a cat takes a lion. d2 is one of
// the three red traps ringing the red den on d1.
const TRAP_BOARD: JungleBoard = {
  d3: { color: 'red', role: 'cat' },
  d2: { color: 'black', role: 'lion' },
};
export const JUNGLE_TRAP = jungleDiagram(
  '-trap',
  TRAP_BOARD,
  { selected: 'd3', targets: ['d2'] },
  360,
);

// Only the rat enters the water; in the river it is safe from land pieces and swims
// between water squares. b5 is the west lake; a5 is the dry lane beside it.
const SWIM_BOARD: JungleBoard = {
  b5: { color: 'red', role: 'rat' },
  a5: { color: 'black', role: 'wolf' },
};
export const JUNGLE_RAT_SWIMS = jungleDiagram(
  '-swim',
  SWIM_BOARD,
  { selected: 'b5', targets: ['b4', 'b6'] },
  360,
);

// The lion (and tiger) leap a river in a straight line and land on the far bank.
// b3 sits below the west lake; the lion clears b4/b5/b6 to land on b7.
const JUMP_BOARD: JungleBoard = {
  b3: { color: 'red', role: 'lion' },
};
export const JUNGLE_LION_JUMP = jungleDiagram(
  '-jump',
  JUMP_BOARD,
  { selected: 'b3', targets: ['b7'] },
  360,
);

// A rat anywhere in the water, either color, blocks the leap: the same lion now has
// no jump because a black rat sits on b5.
const BLOCK_BOARD: JungleBoard = {
  b3: { color: 'red', role: 'lion' },
  b5: { color: 'black', role: 'rat' },
};
export const JUNGLE_RAT_BLOCKS = jungleDiagram('-block', BLOCK_BOARD, { selected: 'b3' }, 360);

// ── Rank ladder (shared by both articles) ────────────────────────────────────
// The eight animals laid out weakest to strongest, drawn as the same FRAMED
// dobutsu tokens the boards use (cream disc + cutout + ink ring) so the animals
// read on any page background — the cream disc keeps them legible in dark mode,
// the same way banqi's ladder sits its pieces on a light panel. Labels use
// `currentColor` so they follow the article's theme-adaptive text colour. Each
// animal outranks everything to its left; the rat-beats-elephant wrap is left to
// the prose + the dedicated demo board.
const RANK_ORDER: JunglePieceRole[] = [
  'rat',
  'cat',
  'dog',
  'wolf',
  'leopard',
  'tiger',
  'lion',
  'elephant',
];
const RANK_LABEL: Record<JunglePieceRole, string> = {
  rat: 'Rat',
  cat: 'Cat',
  dog: 'Dog',
  wolf: 'Wolf',
  leopard: 'Leopard',
  tiger: 'Tiger',
  lion: 'Lion',
  elephant: 'Elephant',
};
export const JUNGLE_RANK_LADDER = (() => {
  const slot = 80;
  const token = 62;
  const topPad = 6;
  const cy = topPad + token / 2;
  const labelY = topPad + token + 16;
  const width = RANK_ORDER.length * slot;
  const height = labelY + 8;
  const shadowId = 'jungle-rank-shadow';
  const cells = RANK_ORDER.map((role, i) => {
    const cx = i * slot + slot / 2;
    return [
      framedTokenSvg({ cx, cy, size: token, ink: 'red', role, filterId: shadowId }),
      `<text x="${cx}" y="${labelY}" font-size="12" fill="currentColor" text-anchor="middle" font-weight="600">${i + 1}. ${RANK_LABEL[role]}</text>`,
    ].join('');
  }).join('');
  const svg = `<svg class="jungle-rank-ladder" viewBox="0 0 ${width} ${height}" role="img" xmlns="http://www.w3.org/2000/svg" aria-label="The eight Jungle animals in rank order, weakest to strongest"><defs>${jungleShadowFilterDef(shadowId)}</defs>${cells}</svg>`;
  return responsive(svg, 680);
})();

// ── Flip Jungle (4×4) ────────────────────────────────────────────────────────

const FACE_DOWN: JungleFlipRenderEntry = { faceDown: true };

const FLIP_SETUP_BOARD: JungleFlipRenderBoard = {
  a1: FACE_DOWN,
  b1: FACE_DOWN,
  c1: FACE_DOWN,
  d1: FACE_DOWN,
  a2: FACE_DOWN,
  b2: FACE_DOWN,
  c2: FACE_DOWN,
  d2: FACE_DOWN,
  a3: FACE_DOWN,
  b3: FACE_DOWN,
  c3: FACE_DOWN,
  d3: FACE_DOWN,
  a4: FACE_DOWN,
  b4: FACE_DOWN,
  c4: FACE_DOWN,
  d4: FACE_DOWN,
};
export const JUNGLE_FLIP_SETUP = flipDiagram('-flip-setup', FLIP_SETUP_BOARD, {}, 340);

// Mid-game: a couple of identities revealed, the rest still face-down. The red wolf
// can flip a neighbour or step to an empty square.
const FLIP_TURN_BOARD: JungleFlipRenderBoard = {
  a1: FACE_DOWN,
  d1: FACE_DOWN,
  b2: { faceDown: false, color: 'red', role: 'wolf' },
  c1: FACE_DOWN,
  c3: { faceDown: false, color: 'black', role: 'leopard' },
  a4: FACE_DOWN,
  d4: FACE_DOWN,
  b4: FACE_DOWN,
};
export const JUNGLE_FLIP_TURN = flipDiagram(
  '-flip-turn',
  FLIP_TURN_BOARD,
  { selected: 'b2', targets: ['b3'] },
  340,
);

// Equal ranks trade off the board (同归于尽): the red wolf and the black wolf meet,
// and both are removed.
const FLIP_MUTUAL_BOARD: JungleFlipRenderBoard = {
  a1: FACE_DOWN,
  d4: FACE_DOWN,
  b2: { faceDown: false, color: 'red', role: 'wolf' },
  b3: { faceDown: false, color: 'black', role: 'wolf' },
};
export const JUNGLE_FLIP_MUTUAL = flipDiagram(
  '-flip-mutual',
  FLIP_MUTUAL_BOARD,
  { selected: 'b2', targets: ['b3'] },
  340,
);
