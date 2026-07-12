import {
  algebraicMoveLabels,
  type Color,
  coordinateMoveLabel,
  darkChessVariant,
  type GameEvent,
  type GameState,
  type PieceRole,
  type PlayerView,
  replayGameEvents,
} from '@mistboard/game';
import './game-shell.css';
import './landing.css';
import './game-route.css';
// Reuse the shared dxq-postgame scaffold (.dxq-postgame__*) the other fog
// variants ride; the board renderer + its fog theme live in our own files.
import './dark-xiangqi-postgame.css';
import { computeCaptures } from './captures.js';
import { chessPieceGlyphSvg, renderDarkChessBoardSvg } from './dark-chess-render.js';
import { revealKingCaptureForLoser } from './replay-board.js';
import { fillCapturedPoolWith } from './review/captured-pool.js';
import { createFlankCaptures } from './review/flank-captures.js';
import { buildReviewMeta, labelize, reviewResultLabel } from './review/game-review-meta.js';
import { createMoveList, type MoveListEntry } from './review/move-list.js';
import { mountReviewLayout } from './review/review-layout.js';
import { buildNav } from './site-shell.js';
import { setBoardFamily } from './theme.js';

// Postgame review for the flagship Dark Chess (8x8 fog-of-war chess). Unlike the
// tenant variants, Dark Chess has no server postgame endpoint with per-seat view
// histories: the fog views are projected on the client from the raw event log
// (the same computation the live room and legacy chessground replay run). This
// module supplies the three board hosts (truth dominant + White/Black POV
// secondaries) + moves + actions; the shared review layout owns the shell,
// scrubber, keyboard, flip, and viewport-fill sizing.

type FeaturedGame = {
  roomId: string;
  variant: string;
  result: string;
  termination: string;
  plyCount: number;
  whiteName: string | null;
  blackName: string | null;
  endedAt?: string;
  rated?: boolean;
  initialMs?: number | null;
  incrementMs?: number | null;
  timeControl?: Record<string, unknown> | null;
  players?: Array<{
    color: string;
    name: string;
    rating: number | null;
    kind: 'account' | 'guest' | 'engine';
  }>;
};

type DarkChessBoardKey = Color | 'truth';

type BoardTarget = {
  key: DarkChessBoardKey;
  label: string;
  el: HTMLElement;
  board: HTMLElement;
  leftCaptures: HTMLElement | null;
  rightCaptures: HTMLElement | null;
};

const BOARD_ENTRIES: ReadonlyArray<{ key: DarkChessBoardKey; label: string }> = [
  { key: 'white', label: 'White view' },
  { key: 'truth', label: 'Server truth' },
  { key: 'black', label: 'Black view' },
];

export function mountDarkChessPostgame(
  root: HTMLElement,
  game: FeaturedGame,
  events: GameEvent[],
): void {
  setBoardFamily('chess');
  // Route class matches the fog siblings so the shared dxq-postgame heading
  // colors (var(--site-heading)) apply on this dark-themed review page.
  root.classList.add('landing-page', 'game-route', 'dark-chess-postgame-route');
  const maxPly = events.filter((event) => event.type === 'move-played').length;

  const targets: BoardTarget[] = BOARD_ENTRIES.map((entry) => {
    const el = document.createElement('section');
    el.className = 'dxq-postgame__board-wrap';
    const heading = document.createElement('h2');
    heading.className = 'dxq-postgame__board-title';
    heading.textContent = entry.label;
    const board = document.createElement('div');
    board.className = 'dxq-postgame__board dark-chess-live-board';
    board.setAttribute('aria-label', `${entry.label} final Dark Chess board`);
    // Every board gets flank capture columns, but only the current PRIMARY
    // board's are filled (renderBoards) — a promoted POV board shows captures,
    // the small secondaries stay uncluttered. In a two-player fog game the
    // capture ledger is common knowledge (you made the capture or you lost the
    // piece), so the POV boards show the same list as the truth board.
    const flank = createFlankCaptures(board);
    el.append(heading, flank.host);
    return {
      ...entry,
      el,
      board,
      leftCaptures: flank.leftColumn,
      rightCaptures: flank.rightColumn,
    };
  });

  const moveList = createMoveList(buildMoveEntries(events), { title: 'Moves' });

  const status = `${reviewResultLabel(game.result)} by ${labelize(game.termination)}`;
  const { metaCard, details } = buildReviewMeta({
    markerId: 'dark-chess',
    variantName: 'Fog Chess',
    game,
    status,
  });

  root.replaceChildren(buildNav());
  mountReviewLayout(root, {
    pageClassName: 'dark-chess-review',
    ariaLabel: 'Dark Chess postgame',
    title: 'Dark Chess',
    summary: `${status} · ${game.plyCount} plies`,
    actions: postgameActions(game),
    metaCard,
    details,
    moves: moveList.el,
    boards: targets.map((target) => ({
      key: target.key,
      el: target.el,
      tier: target.key === 'truth' ? 'primary' : 'secondary',
    })),
    boardAspect: 1,
    // Flank capture tiles size to slot-width / boardCols. The two flank columns
    // are budgeted back into the slot width, so a low count (8 = one per file)
    // over-inflates the tiles and starves the board of width. 13 lands the tiles
    // a touch under one board cell and lets the board fill the freed space.
    boardCols: 13,
    secondaryWidthPx: 116,
    maxPly,
    renderBoards({ ply, flipped, primaryKey }) {
      const orientation: Color = flipped ? 'black' : 'white';
      const opponent: Color = orientation === 'white' ? 'black' : 'white';
      const state = replayGameEvents(sliceToPly(events, ply)).state;
      const seatViews = seatViewsAtPly(state);
      const captured = capturedAtPly(events, ply);
      for (const target of targets) {
        if (target.key === 'truth') {
          target.board.innerHTML = sizedBoardSvg(
            renderDarkChessBoardSvg(
              { board: state.board, visibleSquares: [], lastMove: state.lastMove },
              { perspective: orientation, showFog: false },
            ),
          );
        } else {
          target.board.innerHTML = sizedBoardSvg(
            renderDarkChessBoardSvg(seatViews[target.key], {
              perspective: orientation,
              showFog: true,
            }),
          );
        }
        if (target.leftCaptures && target.rightCaptures) {
          target.leftCaptures.replaceChildren();
          target.rightCaptures.replaceChildren();
          if (target.key === primaryKey) {
            fillCapturedPoolWith(target.leftCaptures, captured, orientation, chessGlyph);
            fillCapturedPoolWith(target.rightCaptures, captured, opponent, chessGlyph);
          }
        }
      }
    },
    renderMoves({ ply }, jump) {
      moveList.update(ply, jump);
    },
  });
}

// The White/Black fog views at a ply. On a finished king-capture game the loser
// saw their king die: reveal the attacker on the capture square in the loser's
// POV, matching what that player actually saw (and the legacy replay).
function seatViewsAtPly(state: GameState): Record<Color, PlayerView> {
  let whiteView = darkChessVariant.getPlayerView(state, 'white');
  let blackView = darkChessVariant.getPlayerView(state, 'black');
  if (
    state.status.type === 'finished' &&
    state.status.reason === 'king-captured' &&
    state.lastMove
  ) {
    const attacker = state.board[state.lastMove.to];
    if (attacker) {
      const loser = state.status.winner === 'white' ? 'black' : 'white';
      if (loser === 'black') {
        blackView = revealKingCaptureForLoser(blackView, state.lastMove, attacker);
      } else {
        whiteView = revealKingCaptureForLoser(whiteView, state.lastMove, attacker);
      }
    }
  }
  return { white: whiteView, black: blackView };
}

// Captured material at a ply, expressed as { owner, role } where owner is the
// color that LOST the piece (so the flank pool renders each side's losses).
function capturedAtPly(events: GameEvent[], ply: number): Array<{ owner: Color; role: PieceRole }> {
  // computeCaptures tally[color] = roles that `color` captured (its trophies,
  // i.e. the opponent's pieces). Flip to losses: a piece White lost is one Black
  // captured, and it is a White piece — so owner = White.
  const tally = computeCaptures(sliceToPly(events, ply));
  return [
    ...tally.black.map((role) => ({ owner: 'white' as Color, role })),
    ...tally.white.map((role) => ({ owner: 'black' as Color, role })),
  ];
}

function chessGlyph(entry: { color: Color; role: PieceRole }): string {
  return chessPieceGlyphSvg(entry.role, entry.color);
}

// Events up to (and including) the ply-th move-played event. Non-move events
// (clock, start, resign) before that cutoff are retained so the projection stays
// well-formed. Mirrors the legacy replay slicer.
function sliceToPly(events: GameEvent[], ply: number): GameEvent[] {
  const result: GameEvent[] = [];
  let moves = 0;
  for (const event of events) {
    if (event.type === 'move-played') {
      if (moves >= ply) break;
      result.push(event);
      moves += 1;
    } else {
      result.push(event);
    }
  }
  return result;
}

function buildMoveEntries(events: GameEvent[]): MoveListEntry[] {
  const labels = algebraicMoveLabels(events, events[0]?.roomId ?? 'replay');
  const entries: MoveListEntry[] = [];
  for (const [index, event] of events.entries()) {
    if (event.type !== 'move-played') continue;
    entries.push({
      ply: entries.length + 1,
      label: labels.get(index + 1) ?? coordinateMoveLabel(event.move),
    });
  }
  return entries;
}

function postgameActions(game: FeaturedGame): HTMLElement {
  const actions = document.createElement('nav');
  actions.className = 'dxq-postgame__actions';
  actions.setAttribute('aria-label', 'Game links');
  const play = document.createElement('a');
  play.className = 'dxq-postgame__link dxq-postgame__link--primary';
  play.href = '/';
  play.textContent = 'Play again';
  const home = document.createElement('a');
  home.className = 'dxq-postgame__link';
  home.href = '/';
  home.textContent = 'Back home';
  const room = document.createElement('a');
  room.className = 'dxq-postgame__link';
  room.href = `/room/${encodeURIComponent(game.roomId)}`;
  room.textContent = 'Room';
  actions.append(play, home, room);
  return actions;
}

// The board SVG renders at an intrinsic pixel size; make it fill its host so the
// review layout's viewport-fill sizing drives the on-screen dimensions.
function sizedBoardSvg(svg: string): string {
  return svg.replace(/^<svg\b/, '<svg style="display:block;width:100%;height:auto"');
}
