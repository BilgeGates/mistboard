import {
  DROP_MINI_XIANGQI_DROP_ROLES,
  DROP_MINI_XIANGQI_SPEC_ID,
  type DropMiniXiangqiDropRole,
  type DropMiniXiangqiGameState,
  type DropMiniXiangqiMove,
  getDropMiniXiangqiPlayerView,
  getMiniXiangqiOpenPlayerView,
  MINI_XIANGQI_SPEC_ID,
  type MiniXiangqiColor,
  type MiniXiangqiGameState,
  type MiniXiangqiMove,
  type MiniXiangqiSquare,
} from '@mistboard/game';
import './drop-mini-xiangqi.css';
import './puzzles.css';
import {
  dropMiniXiangqiBoardMoves,
  dropMiniXiangqiBoardView,
  dropMiniXiangqiDropTargets,
  dropMiniXiangqiTargetMoves,
  fillDropMiniXiangqiReserve,
} from './drop-mini-xiangqi-view.js';
import {
  installMiniXiangqiBoardStyles,
  MINI_XIANGQI_PIECE_PX,
  miniXiangqiPieceGhostSvg,
  renderMiniXiangqiBoardSvg,
} from './live-mini-xiangqi-render.js';
import { buildNav } from './site-shell.js';
import { setBoardFamily } from './theme.js';
import { installBoardDrag } from './variant-tenant/board-drag.js';
import { installHandDrag } from './variant-tenant/hand-drag.js';

type PuzzleVariant = typeof MINI_XIANGQI_SPEC_ID | typeof DROP_MINI_XIANGQI_SPEC_ID;
type PuzzleVariantFilter = 'all' | PuzzleVariant;
type PuzzleMove = MiniXiangqiMove | DropMiniXiangqiMove;

type PuzzleSummary = {
  id: string;
  variant: PuzzleVariant;
  title: string;
  sideToMove: MiniXiangqiColor | null;
  goal: { type: 'checkmate'; winner?: MiniXiangqiColor };
  themes: string[];
  solutionPlyCount: number;
};

type MiniPuzzleDetail = PuzzleSummary & {
  variant: typeof MINI_XIANGQI_SPEC_ID;
  initial: MiniXiangqiGameState;
};

type DropPuzzleDetail = PuzzleSummary & {
  variant: typeof DROP_MINI_XIANGQI_SPEC_ID;
  initial: DropMiniXiangqiGameState;
};

type PuzzleDetail = MiniPuzzleDetail | DropPuzzleDetail;
type PuzzleState = MiniXiangqiGameState | DropMiniXiangqiGameState;

type PuzzleAttempt =
  | {
      ok: true;
      complete: boolean;
      ply: number;
      state: PuzzleState;
      lastMove?: PuzzleMove;
    }
  | {
      ok: false;
      code: 'incorrect-move' | 'illegal-move' | 'line-too-long' | 'wrong-move-shape';
      ply: number;
      state: PuzzleState;
      move: PuzzleMove;
    };

type FeedbackKind = 'neutral' | 'good' | 'bad' | 'pending';

type PuzzleSession = {
  puzzle: PuzzleDetail;
  state: PuzzleState;
  playedMoves: PuzzleMove[];
  selectedSquare: MiniXiangqiSquare | null;
  selectedDrop: DropMiniXiangqiDropRole | null;
  draggingFrom: MiniXiangqiSquare | null;
  feedback: { kind: FeedbackKind; text: string };
  submitting: boolean;
};

type PuzzleNavigation = {
  index: number;
  total: number;
  hasPrevious: boolean;
  hasNext: boolean;
  goPrevious: () => void;
  goNext: () => void;
};

const SOLVED_PUZZLES_STORAGE_KEY = 'mistboard:puzzles:solved';
const AUTO_NEXT_STORAGE_KEY = 'mistboard:puzzles:auto-next';
const AUTO_NEXT_DELAY_MS = 150;
const PUZZLE_VARIANT_FILTERS: readonly PuzzleVariantFilter[] = [
  'all',
  MINI_XIANGQI_SPEC_ID,
  DROP_MINI_XIANGQI_SPEC_ID,
];

export async function mountPuzzles(
  root: HTMLElement,
  initialPuzzleId: string | null = null,
): Promise<void> {
  installMiniXiangqiBoardStyles();
  setBoardFamily('xiangqi');
  root.classList.add('puzzles-page');

  const shell = document.createElement('main');
  shell.className = 'site-section puzzles-shell';
  const header = document.createElement('div');
  header.className = 'puzzles-header';
  const title = document.createElement('h1');
  title.className = 'site-section-heading';
  title.textContent = 'Puzzles';
  header.append(title);

  const layout = document.createElement('div');
  layout.className = 'puzzles-layout';
  const detail = document.createElement('section');
  detail.className = 'puzzle-detail';
  const controls = document.createElement('aside');
  controls.className = 'puzzles-sidebar';
  layout.append(detail, controls);
  shell.append(header, layout);
  root.replaceChildren(buildNav(), shell);

  let summaries: PuzzleSummary[] = [];
  let selectedId = initialPuzzleId;
  let variantFilter: PuzzleVariantFilter = 'all';
  let session: PuzzleSession | null = null;
  const solvedIds = loadSolvedPuzzleIds();
  let autoNext = loadAutoNextEnabled();
  let autoNextTimer: number | null = null;
  let loadToken = 0;

  const queueSummaries = (): PuzzleSummary[] => filterPuzzlesByVariant(summaries, variantFilter);

  const renderControls = (): void => {
    renderQueuePanel(
      controls,
      summaries,
      queueSummaries(),
      selectedId,
      solvedIds,
      variantFilter,
      autoNext,
      async (nextFilter) => {
        variantFilter = nextFilter;
        const queue = queueSummaries();
        const nextId =
          selectedId && queue.some((puzzle) => puzzle.id === selectedId)
            ? selectedId
            : (queue[0]?.id ?? null);
        renderControls();
        if (nextId) {
          await selectPuzzle(nextId, true);
        } else {
          selectedId = null;
          session = null;
          renderStatus(detail, 'No puzzles');
        }
      },
      (enabled) => {
        autoNext = enabled;
        saveAutoNextEnabled(enabled);
        renderControls();
      },
    );
  };

  const clearAutoNextTimer = (): void => {
    if (autoNextTimer === null) return;
    window.clearTimeout(autoNextTimer);
    autoNextTimer = null;
  };

  const scheduleAutoNext = (navigation: PuzzleNavigation): void => {
    if (!autoNext || !navigation.hasNext) return;
    clearAutoNextTimer();
    autoNextTimer = window.setTimeout(() => {
      autoNextTimer = null;
      navigation.goNext();
    }, AUTO_NEXT_DELAY_MS);
  };

  const renderSession = (): void => {
    if (!session) return;
    const navigation = navigationFor(queueSummaries(), selectedId, selectPuzzle);
    renderPuzzleDetail(
      detail,
      session,
      renderSession,
      navigation,
      (id) => {
        solvedIds.add(id);
        saveSolvedPuzzleIds(solvedIds);
        renderControls();
        scheduleAutoNext(navigation);
      },
      clearAutoNextTimer,
    );
    renderControls();
  };

  const selectPuzzle = async (id: string, pushUrl: boolean): Promise<void> => {
    clearAutoNextTimer();
    const summary = summaries.find((puzzle) => puzzle.id === id);
    if (summary && !queueSummaries().some((puzzle) => puzzle.id === id)) {
      variantFilter = summary.variant;
    }
    selectedId = id;
    renderControls();
    renderStatus(detail, 'Loading');
    const token = ++loadToken;
    const puzzle = await fetchPuzzleDetail(id);
    if (token !== loadToken) return;
    if (!puzzle) {
      session = null;
      renderStatus(detail, 'Puzzle not found');
      return;
    }
    const nextPath = `/puzzles/${encodeURIComponent(id)}`;
    if (pushUrl && window.location.pathname !== nextPath) {
      window.history.pushState(null, '', nextPath);
    }
    session = createPuzzleSession(puzzle);
    renderSession();
    renderControls();
  };

  renderStatus(controls, 'Loading');
  renderStatus(detail, 'Loading');
  summaries = await fetchPuzzleList();
  const directSummary = selectedId ? summaries.find((puzzle) => puzzle.id === selectedId) : null;
  if (directSummary) variantFilter = directSummary.variant;
  renderControls();

  const queue = queueSummaries();
  const firstId =
    selectedId && queue.some((puzzle) => puzzle.id === selectedId)
      ? selectedId
      : (queue[0]?.id ?? null);
  if (firstId) {
    await selectPuzzle(firstId, false);
  } else {
    renderStatus(detail, 'No puzzles');
  }

  window.addEventListener('popstate', () => {
    const id = puzzleIdFromPath(window.location.pathname) ?? queueSummaries()[0]?.id ?? null;
    if (id) void selectPuzzle(id, false);
  });
}

function createPuzzleSession(puzzle: PuzzleDetail): PuzzleSession {
  return {
    puzzle,
    state: clonePuzzleState(puzzle.initial),
    playedMoves: [],
    selectedSquare: null,
    selectedDrop: null,
    draggingFrom: null,
    feedback: { kind: 'neutral', text: 'Find the forcing move.' },
    submitting: false,
  };
}

function renderQueuePanel(
  host: HTMLElement,
  allPuzzles: readonly PuzzleSummary[],
  queue: readonly PuzzleSummary[],
  selectedId: string | null,
  solvedIds: ReadonlySet<string>,
  variantFilter: PuzzleVariantFilter,
  autoNext: boolean,
  onVariantChange: (variant: PuzzleVariantFilter) => Promise<void>,
  onAutoNextChange: (enabled: boolean) => void,
): void {
  host.replaceChildren();
  const title = document.createElement('h2');
  title.textContent = 'Puzzle set';

  const form = document.createElement('div');
  form.className = 'puzzle-settings';
  const field = document.createElement('label');
  field.className = 'puzzle-field';
  const fieldLabel = document.createElement('span');
  fieldLabel.textContent = 'Variant';
  const select = document.createElement('select');
  select.className = 'puzzle-select';
  select.dataset.puzzleVariant = 'true';
  for (const filter of PUZZLE_VARIANT_FILTERS) {
    const option = document.createElement('option');
    option.value = filter;
    option.textContent = variantFilterLabel(filter, allPuzzles);
    select.append(option);
  }
  select.value = variantFilter;
  select.addEventListener('change', () => {
    void onVariantChange(parseVariantFilter(select.value));
  });
  field.append(fieldLabel, select);
  form.append(field);
  const autoNextToggle = document.createElement('label');
  autoNextToggle.className = 'puzzle-toggle';
  const autoNextInput = document.createElement('input');
  autoNextInput.type = 'checkbox';
  autoNextInput.checked = autoNext;
  autoNextInput.dataset.puzzleAutoNext = 'true';
  autoNextInput.addEventListener('change', () => {
    onAutoNextChange(autoNextInput.checked);
  });
  const autoNextLabel = document.createElement('span');
  autoNextLabel.textContent = 'Jump to next puzzle immediately';
  autoNextToggle.append(autoNextInput, autoNextLabel);
  form.append(autoNextToggle);

  const currentIndex = Math.max(
    0,
    queue.findIndex((puzzle) => puzzle.id === selectedId),
  );
  const current = queue[currentIndex] ?? null;
  const solvedCount = queue.filter((puzzle) => solvedIds.has(puzzle.id)).length;

  const progress = document.createElement('div');
  progress.className = 'puzzle-progress-grid';
  progress.append(statRow('Solved', `${solvedCount}`));

  const currentCard = document.createElement('div');
  currentCard.className = 'puzzle-current-card';
  if (current) {
    const currentTitle = document.createElement('strong');
    currentTitle.className = 'puzzle-current-title';
    currentTitle.textContent = current.title;
    const meta = document.createElement('div');
    meta.className = 'puzzle-list-meta';
    meta.append(metaChip(variantLabel(current.variant)), metaChip(goalLabel(current)));
    if (solvedIds.has(current.id)) meta.append(metaChip('Solved'));
    currentCard.append(currentTitle, meta);
  } else {
    currentCard.textContent = 'No puzzles for this variant.';
  }

  host.append(title, form, progress, currentCard);
}

function renderPuzzleDetail(
  host: HTMLElement,
  session: PuzzleSession,
  renderSession: () => void,
  navigation: PuzzleNavigation,
  onSolved: (id: string) => void,
  cancelAutoNext: () => void,
): void {
  host.replaceChildren();
  const puzzle = session.puzzle;

  const boardPanel = document.createElement('div');
  boardPanel.className = 'puzzle-board-panel';
  const board = document.createElement('div');
  board.className = 'puzzle-board';
  const side = document.createElement('aside');
  side.className = 'puzzle-side-panel';

  const { boardView, dropView } = puzzleViews(session);
  const boardTarget = dropView
    ? renderPuzzleBoardShell(board, session, dropView, renderSession, onSolved)
    : board;
  const legalMoves = highlightedBoardMoves(session);
  boardTarget.innerHTML = renderMiniXiangqiBoardSvg(boardView, boardView.perspective, {
    interactive: true,
    showFog: false,
    selectedSquare: session.selectedSquare,
    legalMoves,
    draggingFrom: session.draggingFrom,
  });
  installBoardDrag({
    board: boardTarget,
    ghostSizePx: MINI_XIANGQI_PIECE_PX,
    onSquareClick: (square) => {
      void handleBoardClick(session, square as MiniXiangqiSquare, renderSession, onSolved);
    },
    canDragFrom: (square) => canDragBoardPiece(session, square as MiniXiangqiSquare),
    ghostHtml: (square) => {
      const entry = puzzleViews(session).boardView.board[square as MiniXiangqiSquare];
      if (!entry || entry.shrouded !== false) return null;
      return miniXiangqiPieceGhostSvg(entry.piece);
    },
    onDragStart: (from) => {
      session.selectedSquare = from as MiniXiangqiSquare;
      session.selectedDrop = null;
      session.draggingFrom = from as MiniXiangqiSquare;
      renderSession();
    },
    onDrop: (from, to) => {
      void handleBoardDrop(
        session,
        from as MiniXiangqiSquare,
        (to as MiniXiangqiSquare | null) ?? null,
        renderSession,
        onSolved,
      );
    },
  });

  const trainer = document.createElement('div');
  trainer.className = 'puzzle-trainer-panel';
  trainer.append(
    headingPanel(puzzle),
    moveListPanel(session),
    feedbackPanel(session),
    actionPanel(session, renderSession, navigation, cancelAutoNext),
  );
  side.append(trainer, statsPanel(session));
  side.append(tagsPanel(puzzle));
  boardPanel.append(board, side);
  host.append(boardPanel);
}

function renderPuzzleBoardShell(
  host: HTMLElement,
  session: PuzzleSession,
  view: ReturnType<typeof getDropMiniXiangqiPlayerView>,
  renderSession: () => void,
  onSolved: (id: string) => void,
): HTMLElement {
  const shell = document.createElement('div');
  shell.className = 'puzzle-board-shell board-shell drop-mini-reserve-container';
  const topReserve = document.createElement('div');
  topReserve.className = 'captures-strip captures-strip-top puzzle-board-reserve';
  topReserve.setAttribute('aria-label', 'Top reserve');
  const boardSurface = document.createElement('div');
  boardSurface.className = 'puzzle-board-surface';
  const bottomReserve = document.createElement('div');
  bottomReserve.className = 'captures-strip captures-strip-bottom puzzle-board-reserve';
  bottomReserve.setAttribute('aria-label', 'Bottom reserve');

  const bottom = view.perspective;
  const top = bottom === 'red' ? 'black' : 'red';
  fillPuzzleReserveStrip(topReserve, session, view, top, false, renderSession, onSolved);
  fillPuzzleReserveStrip(bottomReserve, session, view, bottom, true, renderSession, onSolved);

  shell.append(topReserve, boardSurface, bottomReserve);
  host.append(shell);
  return boardSurface;
}

function headingPanel(puzzle: PuzzleDetail): HTMLElement {
  const heading = document.createElement('div');
  heading.className = 'puzzle-detail-heading';
  const title = document.createElement('h2');
  title.textContent = puzzle.title;
  const meta = document.createElement('div');
  meta.className = 'puzzle-detail-meta';
  meta.append(
    metaChip(variantLabel(puzzle.variant)),
    metaChip(goalLabel(puzzle)),
    metaChip(`${colorLabel(puzzle.sideToMove)} to move`),
  );
  heading.append(title, meta);
  return heading;
}

function feedbackPanel(session: PuzzleSession): HTMLElement {
  const panel = document.createElement('div');
  panel.className = `puzzle-feedback puzzle-feedback--${session.feedback.kind}`;
  const title = document.createElement('strong');
  title.className = 'puzzle-feedback-title';
  title.textContent = feedbackTitle(session.feedback.kind);
  const body = document.createElement('span');
  body.className = 'puzzle-feedback-body';
  body.textContent = session.feedback.text;
  panel.append(title, body);
  return panel;
}

function moveListPanel(session: PuzzleSession): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'puzzle-moves';
  const title = document.createElement('h3');
  title.textContent = 'Moves';
  const list = document.createElement('ol');
  list.className = 'puzzle-move-list';
  if (session.playedMoves.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'puzzle-move-empty';
    empty.textContent = '...';
    list.append(empty);
  } else {
    session.playedMoves.forEach((move, index) => {
      const item = document.createElement('li');
      item.className = 'puzzle-move-item';
      const ply = document.createElement('span');
      ply.textContent = `${index + 1}.`;
      const label = document.createElement('strong');
      label.textContent = puzzleMoveLabel(move);
      item.append(ply, label);
      list.append(item);
    });
  }
  panel.append(title, list);
  return panel;
}

function actionPanel(
  session: PuzzleSession,
  renderSession: () => void,
  navigation: PuzzleNavigation,
  cancelAutoNext: () => void,
): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'puzzle-actions';
  const previous = document.createElement('button');
  previous.type = 'button';
  previous.className = 'puzzle-button puzzle-button--secondary';
  previous.dataset.puzzlePrevious = 'true';
  previous.textContent = 'Previous';
  previous.disabled = !navigation.hasPrevious || session.submitting;
  previous.addEventListener('click', navigation.goPrevious);
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'puzzle-button';
  reset.textContent = 'Reset';
  reset.disabled = session.submitting;
  reset.addEventListener('click', () => {
    cancelAutoNext();
    Object.assign(session, createPuzzleSession(session.puzzle));
    renderSession();
  });
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'puzzle-button puzzle-button--primary';
  next.dataset.puzzleNext = 'true';
  const solved = isSessionSolved(session);
  next.textContent = solved ? 'Next puzzle' : 'Next';
  next.disabled = !navigation.hasNext || session.submitting || !solved;
  next.addEventListener('click', navigation.goNext);
  panel.append(previous, reset, next);
  return panel;
}

function isSessionSolved(session: PuzzleSession): boolean {
  return session.state.status.type === 'finished';
}

function statsPanel(session: PuzzleSession): HTMLElement {
  const puzzle = session.puzzle;
  const stats = document.createElement('div');
  stats.className = 'puzzle-stat-grid';
  stats.append(
    statRow('Side', colorLabel(activeTurn(session))),
    statRow('Goal', goalLabel(puzzle)),
    statRow('Variant', variantLabel(puzzle.variant)),
  );
  return stats;
}

function fillPuzzleReserveStrip(
  reserve: HTMLElement,
  session: PuzzleSession,
  view: ReturnType<typeof getDropMiniXiangqiPlayerView>,
  color: MiniXiangqiColor,
  isBottom: boolean,
  renderSession: () => void,
  onSolved: (id: string) => void,
): void {
  fillDropMiniXiangqiReserve(reserve, view, color, {
    interactive:
      isBottom &&
      color === activeTurn(session) &&
      session.state.status.type === 'playing' &&
      !session.submitting,
    selectedRole:
      isBottom &&
      color === activeTurn(session) &&
      session.state.status.type === 'playing' &&
      !session.submitting
        ? session.selectedDrop
        : null,
    onSelect: (role) => {
      if (!isBottom || color !== activeTurn(session) || session.state.status.type !== 'playing') {
        return;
      }
      session.selectedDrop = session.selectedDrop === role ? null : role;
      session.selectedSquare = null;
      session.feedback = { kind: 'neutral', text: `${dropRoleLabel(role)} selected.` };
      renderSession();
    },
  });
  installHandDrag({
    hand: reserve,
    ghostSizePx: MINI_XIANGQI_PIECE_PX,
    isRole: isDropRole,
    canDragRole: (role) =>
      isBottom &&
      color === activeTurn(session) &&
      session.state.status.type === 'playing' &&
      !session.submitting &&
      (view.hands[color][role] ?? 0) > 0,
    ghostHtml: (role) => miniXiangqiPieceGhostSvg({ color, role }),
    onDragStart: (role) => {
      if (!isBottom || color !== activeTurn(session) || session.state.status.type !== 'playing') {
        return;
      }
      session.selectedDrop = role;
      session.selectedSquare = null;
      session.draggingFrom = null;
      session.feedback = { kind: 'neutral', text: `${dropRoleLabel(role)} selected.` };
      renderSession();
    },
    onDrop: (role, to) => {
      void handleReserveDrop(
        session,
        role,
        to as MiniXiangqiSquare | null,
        renderSession,
        onSolved,
      );
    },
  });
}

function tagsPanel(puzzle: PuzzleDetail): HTMLElement {
  const tags = document.createElement('div');
  tags.className = 'puzzle-tags';
  for (const theme of puzzle.themes) {
    const tag = document.createElement('span');
    tag.className = 'puzzle-tag';
    tag.textContent = themeLabel(theme);
    tags.append(tag);
  }
  return tags;
}

async function handleBoardClick(
  session: PuzzleSession,
  square: MiniXiangqiSquare,
  renderSession: () => void,
  onSolved: (id: string) => void,
): Promise<void> {
  if (session.submitting || session.state.status.type !== 'playing') return;
  if (session.selectedDrop) {
    const targets = dropTargetsFor(session, session.selectedDrop);
    if (targets.includes(square)) {
      await submitMove(
        session,
        { drop: session.selectedDrop, to: square },
        renderSession,
        onSolved,
      );
      return;
    }
    session.selectedDrop = null;
    session.feedback = { kind: 'neutral', text: 'Reserve cleared.' };
    renderSession();
    return;
  }

  if (session.selectedSquare) {
    const move = boardMovesFor(session, session.selectedSquare).find((m) => m.to === square);
    if (move) {
      await submitMove(session, move, renderSession, onSolved);
      return;
    }
  }

  if (isSelectablePiece(session, square)) {
    session.selectedSquare = square;
    session.selectedDrop = null;
    session.feedback = { kind: 'neutral', text: `${square} selected.` };
  } else {
    session.selectedSquare = null;
    session.selectedDrop = null;
    session.feedback = { kind: 'neutral', text: 'Find the forcing move.' };
  }
  renderSession();
}

async function handleBoardDrop(
  session: PuzzleSession,
  from: MiniXiangqiSquare,
  to: MiniXiangqiSquare | null,
  renderSession: () => void,
  onSolved: (id: string) => void,
): Promise<void> {
  session.draggingFrom = null;
  if (session.submitting || session.state.status.type !== 'playing' || !to) {
    session.selectedSquare = null;
    session.selectedDrop = null;
    renderSession();
    return;
  }

  const move = boardMovesFor(session, from).find((candidate) => candidate.to === to);
  if (move) {
    await submitMove(session, move, renderSession, onSolved);
    return;
  }

  session.selectedSquare = null;
  session.selectedDrop = null;
  session.feedback = { kind: 'neutral', text: 'Find the forcing move.' };
  renderSession();
}

async function handleReserveDrop(
  session: PuzzleSession,
  role: DropMiniXiangqiDropRole,
  to: MiniXiangqiSquare | null,
  renderSession: () => void,
  onSolved: (id: string) => void,
): Promise<void> {
  session.draggingFrom = null;
  session.selectedSquare = null;
  session.selectedDrop = null;
  if (session.submitting || session.state.status.type !== 'playing' || !to) {
    renderSession();
    return;
  }

  if (dropTargetsFor(session, role).includes(to)) {
    await submitMove(session, { drop: role, to }, renderSession, onSolved);
    return;
  }

  session.feedback = { kind: 'neutral', text: 'Find the forcing move.' };
  renderSession();
}

async function submitMove(
  session: PuzzleSession,
  move: PuzzleMove,
  renderSession: () => void,
  onSolved?: (id: string) => void,
): Promise<void> {
  session.submitting = true;
  session.feedback = { kind: 'pending', text: 'Checking move.' };
  renderSession();
  const attempt = await submitPuzzleAttempt(session.puzzle.id, [...session.playedMoves, move]);
  session.submitting = false;
  session.selectedSquare = null;
  session.selectedDrop = null;
  if (attempt.ok) {
    session.playedMoves = [...session.playedMoves, move];
    session.state = attempt.state;
    if (attempt.complete) onSolved?.(session.puzzle.id);
    session.feedback = attempt.complete
      ? { kind: 'good', text: 'Solved.' }
      : { kind: 'good', text: 'Correct.' };
  } else {
    session.state = attempt.state;
    session.feedback = { kind: 'bad', text: 'Try another move.' };
  }
  renderSession();
}

function puzzleViews(session: PuzzleSession): {
  boardView: ReturnType<typeof getMiniXiangqiOpenPlayerView>;
  dropView: ReturnType<typeof getDropMiniXiangqiPlayerView> | null;
} {
  const turn = activeTurn(session);
  if (session.puzzle.variant === DROP_MINI_XIANGQI_SPEC_ID) {
    const dropView = getDropMiniXiangqiPlayerView(session.state as DropMiniXiangqiGameState, turn);
    return { boardView: dropMiniXiangqiBoardView(dropView), dropView };
  }
  return {
    boardView: getMiniXiangqiOpenPlayerView(session.state as MiniXiangqiGameState, turn),
    dropView: null,
  };
}

function highlightedBoardMoves(session: PuzzleSession): MiniXiangqiMove[] {
  if (session.selectedDrop)
    return dropMiniXiangqiTargetMoves(dropTargetsFor(session, session.selectedDrop));
  if (!session.selectedSquare) return [];
  return boardMovesFor(session, session.selectedSquare);
}

function boardMovesFor(session: PuzzleSession, from: MiniXiangqiSquare): MiniXiangqiMove[] {
  const { boardView, dropView } = puzzleViews(session);
  if (dropView) return dropMiniXiangqiBoardMoves(dropView, from);
  return boardView.legalMoves.filter((move) => move.from === from);
}

function dropTargetsFor(
  session: PuzzleSession,
  role: DropMiniXiangqiDropRole,
): MiniXiangqiSquare[] {
  const { dropView } = puzzleViews(session);
  return dropView ? dropMiniXiangqiDropTargets(dropView, role) : [];
}

function isSelectablePiece(session: PuzzleSession, square: MiniXiangqiSquare): boolean {
  const { boardView } = puzzleViews(session);
  const entry = boardView.board[square];
  return entry?.shrouded === false && entry.piece.color === activeTurn(session);
}

function canDragBoardPiece(session: PuzzleSession, square: MiniXiangqiSquare): boolean {
  return (
    !session.submitting &&
    session.state.status.type === 'playing' &&
    isSelectablePiece(session, square)
  );
}

function activeTurn(session: PuzzleSession): MiniXiangqiColor {
  return session.state.status.type === 'playing'
    ? session.state.status.turn
    : (session.puzzle.sideToMove ?? 'red');
}

function statRow(label: string, value: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'puzzle-stat';
  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  const valueEl = document.createElement('strong');
  valueEl.textContent = value;
  row.append(labelEl, valueEl);
  return row;
}

function renderStatus(host: HTMLElement, message: string): void {
  const status = document.createElement('p');
  status.className = 'puzzles-status';
  status.textContent = message;
  host.replaceChildren(status);
}

function filterPuzzlesByVariant(
  puzzles: readonly PuzzleSummary[],
  variant: PuzzleVariantFilter,
): PuzzleSummary[] {
  if (variant === 'all') return [...puzzles];
  return puzzles.filter((puzzle) => puzzle.variant === variant);
}

function navigationFor(
  puzzles: readonly PuzzleSummary[],
  selectedId: string | null,
  selectPuzzle: (id: string, pushUrl: boolean) => Promise<void>,
): PuzzleNavigation {
  const index = Math.max(
    0,
    puzzles.findIndex((puzzle) => puzzle.id === selectedId),
  );
  const total = puzzles.length;
  const hasPrevious = total > 0 && index > 0;
  const hasNext = total > 0 && index < total - 1;
  return {
    index,
    total,
    hasPrevious,
    hasNext,
    goPrevious: () => {
      if (!hasPrevious) return;
      void selectPuzzle(puzzles[index - 1]!.id, true);
    },
    goNext: () => {
      if (!hasNext) return;
      void selectPuzzle(puzzles[index + 1]!.id, true);
    },
  };
}

function parseVariantFilter(value: string): PuzzleVariantFilter {
  if (value === MINI_XIANGQI_SPEC_ID || value === DROP_MINI_XIANGQI_SPEC_ID) return value;
  return 'all';
}

function variantFilterLabel(
  variant: PuzzleVariantFilter,
  puzzles: readonly PuzzleSummary[],
): string {
  const count = filterPuzzlesByVariant(puzzles, variant).length;
  const label =
    variant === 'all'
      ? 'All puzzles'
      : variant === DROP_MINI_XIANGQI_SPEC_ID
        ? 'Drop Mini Xiangqi'
        : 'Mini Xiangqi';
  return `${label} (${count})`;
}

function metaChip(text: string): HTMLSpanElement {
  const chip = document.createElement('span');
  chip.textContent = text;
  return chip;
}

async function fetchPuzzleList(): Promise<PuzzleSummary[]> {
  const response = await fetch('/api/puzzles');
  if (!response.ok) throw new Error(`Puzzle list failed: ${response.status}`);
  const body = (await response.json()) as { puzzles?: PuzzleSummary[] };
  return Array.isArray(body.puzzles) ? body.puzzles : [];
}

async function fetchPuzzleDetail(id: string): Promise<PuzzleDetail | null> {
  const response = await fetch(`/api/puzzles/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Puzzle detail failed: ${response.status}`);
  const body = (await response.json()) as { puzzle?: PuzzleDetail };
  return body.puzzle ?? null;
}

async function submitPuzzleAttempt(
  id: string,
  moves: readonly PuzzleMove[],
): Promise<PuzzleAttempt> {
  const response = await fetch(`/api/puzzles/${encodeURIComponent(id)}/attempt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ moves }),
  });
  if (!response.ok) throw new Error(`Puzzle attempt failed: ${response.status}`);
  const body = (await response.json()) as { attempt?: PuzzleAttempt };
  if (!body.attempt) throw new Error('Puzzle attempt response missing attempt.');
  return body.attempt;
}

function clonePuzzleState<State extends PuzzleState>(state: State): State {
  return structuredClone(state);
}

function puzzleIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/puzzles\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]!) : null;
}

function loadSolvedPuzzleIds(): Set<string> {
  try {
    const raw = window.localStorage?.getItem(SOLVED_PUZZLES_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

function saveSolvedPuzzleIds(ids: ReadonlySet<string>): void {
  try {
    window.localStorage?.setItem(SOLVED_PUZZLES_STORAGE_KEY, JSON.stringify([...ids].sort()));
  } catch {
    // Solved markers are a convenience only; puzzle play should work without storage.
  }
}

function loadAutoNextEnabled(): boolean {
  try {
    return window.localStorage?.getItem(AUTO_NEXT_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function saveAutoNextEnabled(enabled: boolean): void {
  try {
    window.localStorage?.setItem(AUTO_NEXT_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Puzzle preferences are best-effort convenience state.
  }
}

function variantLabel(variant: PuzzleVariant): string {
  return variant === DROP_MINI_XIANGQI_SPEC_ID ? 'Drop Mini Xiangqi' : 'Mini Xiangqi';
}

function goalLabel(puzzle: Pick<PuzzleSummary, 'goal' | 'solutionPlyCount'>): string {
  if (puzzle.goal.type === 'checkmate') {
    return `Mate in ${Math.ceil(puzzle.solutionPlyCount / 2)}`;
  }
  return puzzle.goal.type;
}

function colorLabel(color: MiniXiangqiColor | null): string {
  if (color === 'black') return 'Black';
  return 'Red';
}

function dropRoleLabel(role: DropMiniXiangqiDropRole): string {
  return `${role[0]?.toUpperCase() ?? ''}${role.slice(1)}`;
}

function puzzleMoveLabel(move: PuzzleMove): string {
  if ('drop' in move) return `${dropRoleSymbol(move.drop)}@${move.to}`;
  return `${move.from}-${move.to}`;
}

function dropRoleSymbol(role: DropMiniXiangqiDropRole): string {
  switch (role) {
    case 'chariot':
      return 'R';
    case 'horse':
      return 'H';
    case 'cannon':
      return 'C';
    case 'soldier':
      return 'S';
  }
}

function feedbackTitle(kind: FeedbackKind): string {
  switch (kind) {
    case 'good':
      return 'Solved';
    case 'bad':
      return 'Try again';
    case 'pending':
      return 'Checking';
    case 'neutral':
      return 'Your turn';
  }
}

function isDropRole(value: string): value is DropMiniXiangqiDropRole {
  return (DROP_MINI_XIANGQI_DROP_ROLES as readonly string[]).includes(value);
}

function themeLabel(theme: string): string {
  return theme
    .split('-')
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');
}
