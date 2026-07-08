import {
  DROP_MINI_XIANGQI_SPEC_ID,
  type DropMiniXiangqiGameState,
  type DropMiniXiangqiPlayerView,
  FORTRESS_XIANGQI_SPEC_ID,
  type FortressXiangqiColor,
  type FortressXiangqiGameState,
  type FortressXiangqiPlayerView,
  getDropMiniXiangqiPlayerView,
  getFortressXiangqiPlayerView,
  getMiniXiangqiOpenPlayerView,
  MINI_XIANGQI_SPEC_ID,
  type MiniXiangqiColor,
  type MiniXiangqiGameState,
} from '@mistboard/game';
import './drop-mini-xiangqi.css';
import { dropMiniXiangqiBoardView, fillDropMiniXiangqiReserve } from './drop-mini-xiangqi-view.js';
import {
  installFortressXiangqiBoardStyles,
  renderFortressXiangqiBoardSvg,
} from './fortress-xiangqi-render.js';
import { fillFortressXiangqiReserve } from './fortress-xiangqi-view.js';
import {
  installMiniXiangqiBoardStyles,
  renderMiniXiangqiBoardSvg,
} from './live-mini-xiangqi-render.js';
import { xiangqiAppearanceChangedEvent } from './theme.js';

const HOME_PUZZLE_PIECE_SIZE = 64;

type HomeDailyPuzzle = {
  daily: {
    day: string;
    persisted: boolean;
    selectedAt: string | null;
    slot: string;
    source: string;
  };
  puzzle: {
    goal:
      | { type: 'checkmate'; winner?: MiniXiangqiColor }
      | { type: 'winning-advantage'; winner?: MiniXiangqiColor; centipawns?: number };
    id: string;
    initial: MiniXiangqiGameState | DropMiniXiangqiGameState | FortressXiangqiGameState;
    sideToMove: MiniXiangqiColor | null;
    solutionPlyCount: number;
    themes: string[];
    title: string;
    variant: string;
  };
};

export async function buildHomePuzzleWidget(): Promise<HTMLElement | null> {
  const daily = await loadHomeDailyPuzzle();
  return daily ? renderHomePuzzleWidget(daily) : null;
}

// Last successfully loaded daily puzzle, cached so repeat visits can render the
// widget synchronously at first paint (exact real footprint, no pop-in) and
// swap in place if the day rolled over. Best-effort: storage may be unavailable
// (private mode) or stale-shaped after a schema change; both read as a miss.
const HOME_PUZZLE_CACHE_KEY = 'mistboard:home-daily-puzzle';

export function cachedHomeDailyPuzzle(): HomeDailyPuzzle | null {
  try {
    const raw = window.localStorage.getItem(HOME_PUZZLE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HomeDailyPuzzle>;
    return isHomeDailyPuzzle(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function loadHomeDailyPuzzle(): Promise<HomeDailyPuzzle | null> {
  try {
    const response = await fetch('/api/puzzles/daily?slot=homepage', {
      credentials: 'same-origin',
    });
    if (!response.ok) return null;
    const body = (await response.json()) as Partial<HomeDailyPuzzle>;
    if (!isHomeDailyPuzzle(body)) return null;
    try {
      window.localStorage.setItem(HOME_PUZZLE_CACHE_KEY, JSON.stringify(body));
    } catch {
      // storage full/unavailable: caching is best-effort
    }
    return body;
  } catch {
    return null;
  }
}

export function renderHomePuzzleWidget(daily: HomeDailyPuzzle): HTMLElement {
  installMiniXiangqiBoardStyles();
  installFortressXiangqiBoardStyles();
  const { puzzle } = daily;
  const link = document.createElement('a');
  link.className = 'home-puzzle-widget';
  link.href = `/puzzles/${encodeURIComponent(puzzle.id)}`;
  link.setAttribute('aria-label', `Puzzle of the day: ${puzzle.title}`);

  const paint = () => link.replaceChildren(...renderHomePuzzleWidgetContent(puzzle));
  paint();
  window.addEventListener(xiangqiAppearanceChangedEvent, paint);
  return link;
}

function renderHomePuzzleWidgetContent(puzzle: HomeDailyPuzzle['puzzle']): HTMLElement[] {
  const title = document.createElement('span');
  title.className = 'home-puzzle-widget-title';
  title.textContent = `Puzzle of the day - ${variantLabel(puzzle.variant)}`;

  const turn = document.createElement('span');
  turn.className = 'home-puzzle-widget-turn';
  turn.textContent = `${colorLabel(puzzle.sideToMove)} to play`;

  return [title, renderHomePuzzleBox(puzzle), turn];
}

// The flush board box: a square filling the rail, with the board hugging the inner
// (center-facing) edge and any drop reserve stacked as a single column on the outer
// edge. Title/turn captions sit outside the box (see landing.css).
function renderHomePuzzleBox(puzzle: HomeDailyPuzzle['puzzle']): HTMLElement {
  const box = document.createElement('div');
  box.className = 'home-puzzle-box';
  const turn = puzzle.sideToMove ?? 'red';

  if (puzzle.variant === FORTRESS_XIANGQI_SPEC_ID) {
    const view = getFortressXiangqiPlayerView(puzzle.initial as FortressXiangqiGameState, turn);
    box.append(
      homePuzzleBoardSurface(renderFortressXiangqiBoardSvg(view, turn, { interactive: false })),
      fortressReserveColumn(view, turn),
    );
    return box;
  }

  if (puzzle.variant === DROP_MINI_XIANGQI_SPEC_ID) {
    const dropView = getDropMiniXiangqiPlayerView(puzzle.initial as DropMiniXiangqiGameState, turn);
    box.append(
      homePuzzleBoardSurface(
        renderMiniXiangqiBoardSvg(dropMiniXiangqiBoardView(dropView), turn, {
          interactive: false,
          pieceSize: HOME_PUZZLE_PIECE_SIZE,
          showFog: false,
        }),
      ),
      dropReserveColumn(dropView, turn),
    );
    return box;
  }

  box.append(
    homePuzzleBoardSurface(
      renderMiniXiangqiBoardSvg(
        getMiniXiangqiOpenPlayerView(puzzle.initial as MiniXiangqiGameState, turn),
        turn,
        { interactive: false, pieceSize: HOME_PUZZLE_PIECE_SIZE, showFog: false },
      ),
    ),
  );
  return box;
}

// Both hands stacked in one column on the outer edge (opponent above, side-to-play
// below). Each fill already collapses identical pieces to a chip + count badge.
function fortressReserveColumn(
  view: FortressXiangqiPlayerView,
  perspective: FortressXiangqiColor,
): HTMLElement {
  const col = document.createElement('div');
  col.className = 'home-puzzle-reserve';
  const opponent: FortressXiangqiColor = perspective === 'red' ? 'black' : 'red';
  for (const owner of [opponent, perspective] as const) {
    const hand = document.createElement('div');
    hand.className = 'home-puzzle-hand';
    hand.setAttribute('aria-label', `${owner} reserve`);
    fillFortressXiangqiReserve(hand, view, owner);
    col.append(hand);
  }
  return col;
}

function dropReserveColumn(
  dropView: DropMiniXiangqiPlayerView,
  perspective: MiniXiangqiColor,
): HTMLElement {
  const col = document.createElement('div');
  col.className = 'home-puzzle-reserve';
  const opponent: MiniXiangqiColor = perspective === 'red' ? 'black' : 'red';
  for (const owner of [opponent, perspective] as const) {
    const hand = document.createElement('div');
    hand.className = 'home-puzzle-hand';
    hand.setAttribute('aria-label', `${owner} reserve`);
    fillDropMiniXiangqiReserve(hand, dropView, owner);
    col.append(hand);
  }
  return col;
}

function homePuzzleBoardSurface(svg: string): HTMLElement {
  const board = document.createElement('div');
  board.className = 'home-puzzle-widget-board';
  board.innerHTML = svg;
  // Hug the board to the inner (center-facing) edge so the reserve + pillarbox slack
  // fall to the outer edge and the gutter to the center column stays uniform.
  board.querySelector('svg')?.setAttribute('preserveAspectRatio', 'xMinYMid meet');
  return board;
}

function isHomeDailyPuzzle(value: Partial<HomeDailyPuzzle>): value is HomeDailyPuzzle {
  return (
    typeof value.daily?.day === 'string' &&
    typeof value.daily.slot === 'string' &&
    typeof value.puzzle?.id === 'string' &&
    typeof value.puzzle.title === 'string' &&
    typeof value.puzzle.variant === 'string' &&
    typeof value.puzzle.solutionPlyCount === 'number' &&
    typeof value.puzzle.initial === 'object' &&
    value.puzzle.initial !== null
  );
}

function variantLabel(variant: string): string {
  if (variant === FORTRESS_XIANGQI_SPEC_ID) return 'Fortress';
  if (variant === DROP_MINI_XIANGQI_SPEC_ID) return 'Drop Mini Xiangqi';
  if (variant === MINI_XIANGQI_SPEC_ID) return 'Mini Xiangqi';
  return variant
    .split('-')
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');
}

function colorLabel(color: MiniXiangqiColor | null): string {
  return color === 'black' ? 'Black' : 'Red';
}
