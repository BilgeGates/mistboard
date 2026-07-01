import {
  DROP_MINI_XIANGQI_SPEC_ID,
  type DropMiniXiangqiGameState,
  getDropMiniXiangqiPlayerView,
  getMiniXiangqiOpenPlayerView,
  MINI_XIANGQI_SPEC_ID,
  type MiniXiangqiColor,
  type MiniXiangqiGameState,
} from '@mistboard/game';
import { dropMiniXiangqiBoardView } from './drop-mini-xiangqi-view.js';
import {
  installMiniXiangqiBoardStyles,
  renderMiniXiangqiBoardSvg,
} from './live-mini-xiangqi-render.js';

type HomeDailyPuzzle = {
  daily: {
    day: string;
    persisted: boolean;
    selectedAt: string | null;
    slot: string;
    source: string;
  };
  puzzle: {
    goal: { type: 'checkmate'; winner?: MiniXiangqiColor };
    id: string;
    initial: MiniXiangqiGameState | DropMiniXiangqiGameState;
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

export async function loadHomeDailyPuzzle(): Promise<HomeDailyPuzzle | null> {
  try {
    const response = await fetch('/api/puzzles/daily?slot=homepage', {
      credentials: 'same-origin',
    });
    if (!response.ok) return null;
    const body = (await response.json()) as Partial<HomeDailyPuzzle>;
    return isHomeDailyPuzzle(body) ? body : null;
  } catch {
    return null;
  }
}

export function renderHomePuzzleWidget(daily: HomeDailyPuzzle): HTMLElement {
  installMiniXiangqiBoardStyles();
  const { puzzle } = daily;
  const link = document.createElement('a');
  link.className = 'home-puzzle-widget';
  link.href = `/puzzles/${encodeURIComponent(puzzle.id)}`;
  link.setAttribute('aria-label', `Puzzle of the day: ${puzzle.title}`);

  const title = document.createElement('span');
  title.className = 'home-puzzle-widget-title';
  title.textContent = `Puzzle of the day - ${variantLabel(puzzle.variant)}`;

  const board = document.createElement('div');
  board.className = 'home-puzzle-widget-board';
  board.innerHTML = renderHomePuzzleBoard(puzzle);

  const turn = document.createElement('span');
  turn.className = 'home-puzzle-widget-turn';
  turn.textContent = `${colorLabel(puzzle.sideToMove)} to move`;

  link.append(title, board, turn);
  return link;
}

function renderHomePuzzleBoard(puzzle: HomeDailyPuzzle['puzzle']): string {
  const turn = puzzle.sideToMove ?? 'red';
  if (puzzle.variant === DROP_MINI_XIANGQI_SPEC_ID) {
    const dropView = getDropMiniXiangqiPlayerView(puzzle.initial as DropMiniXiangqiGameState, turn);
    return renderMiniXiangqiBoardSvg(dropMiniXiangqiBoardView(dropView), turn, {
      interactive: false,
      showFog: false,
    });
  }
  return renderMiniXiangqiBoardSvg(
    getMiniXiangqiOpenPlayerView(puzzle.initial as MiniXiangqiGameState, turn),
    turn,
    {
      interactive: false,
      showFog: false,
    },
  );
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
