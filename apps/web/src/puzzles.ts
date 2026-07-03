import {
  applyDropMiniXiangqiMove,
  applyFortressXiangqiMove,
  applyMiniXiangqiOpenMove,
  DROP_MINI_XIANGQI_DROP_ROLES,
  DROP_MINI_XIANGQI_SPEC_ID,
  type DropMiniXiangqiDropRole,
  type DropMiniXiangqiGameState,
  type DropMiniXiangqiMove,
  FORTRESS_DROP_ROLES,
  FORTRESS_XIANGQI_SPEC_ID,
  type FortressXiangqiColor,
  type FortressXiangqiDropRole,
  type FortressXiangqiGameState,
  type FortressXiangqiMove,
  type FortressXiangqiPlayerView,
  type FortressXiangqiSquare,
  getDropMiniXiangqiPlayerView,
  getFortressXiangqiPlayerView,
  getMiniXiangqiOpenPlayerView,
  MINI_XIANGQI_SPEC_ID,
  type MiniXiangqiColor,
  type MiniXiangqiGameState,
  type MiniXiangqiMove,
  type MiniXiangqiSquare,
  oppositeMiniXiangqiColor,
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
  FORTRESS_XIANGQI_PIECE_PX,
  fortressXiangqiPieceGhostSvg,
  installFortressXiangqiBoardStyles,
  renderFortressXiangqiBoardSvg,
} from './fortress-xiangqi-render.js';
import {
  fillFortressXiangqiReserve,
  fortressXiangqiBoardMoves,
  fortressXiangqiDropTargets,
  fortressXiangqiMoveLabel,
} from './fortress-xiangqi-view.js';
import {
  installMiniXiangqiBoardStyles,
  MINI_XIANGQI_PIECE_PX,
  miniXiangqiPieceGhostSvg,
  renderMiniXiangqiBoardSvg,
} from './live-mini-xiangqi-render.js';
import { buildNav } from './site-shell.js';
import { setBoardFamily, xiangqiAppearanceChangedEvent } from './theme.js';
import { renderVariantMiniBoard, type VariantMiniId } from './variant-mini-boards.js';
import { installBoardDrag } from './variant-tenant/board-drag.js';
import { installHandDrag } from './variant-tenant/hand-drag.js';

type PuzzleVariant =
  | typeof MINI_XIANGQI_SPEC_ID
  | typeof DROP_MINI_XIANGQI_SPEC_ID
  | typeof FORTRESS_XIANGQI_SPEC_ID;
type PuzzleVariantFilter = PuzzleVariant;
type PuzzleMove = MiniXiangqiMove | DropMiniXiangqiMove | FortressXiangqiMove;
type PuzzleColor = MiniXiangqiColor | FortressXiangqiColor;

type PuzzleSummary = {
  id: string;
  variant: PuzzleVariant;
  title: string;
  sideToMove: PuzzleColor | null;
  goal: { type: 'checkmate'; winner?: PuzzleColor };
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

type FortressPuzzleDetail = PuzzleSummary & {
  variant: typeof FORTRESS_XIANGQI_SPEC_ID;
  initial: FortressXiangqiGameState;
};

type PuzzleDetail = MiniPuzzleDetail | DropPuzzleDetail | FortressPuzzleDetail;
type PuzzleState = MiniXiangqiGameState | DropMiniXiangqiGameState | FortressXiangqiGameState;

type PuzzleAttempt =
  | {
      ok: true;
      playedMoves: PuzzleMove[];
      solverMoves: PuzzleMove[];
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
  solverMoves: PuzzleMove[];
  viewPly: number;
  selectedSquare: MiniXiangqiSquare | FortressXiangqiSquare | null;
  selectedDrop: DropMiniXiangqiDropRole | FortressXiangqiDropRole | null;
  draggingFrom: MiniXiangqiSquare | FortressXiangqiSquare | null;
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
const RATED_STORAGE_KEY = 'mistboard:puzzles:rated';
const AUTO_NEXT_DELAY_MS = 150;

// The signed-in user's puzzle rating for the current variant (from
// /api/puzzles/rating), and the rating change returned by a rated attempt.
type UserPuzzleRating = {
  rating: number;
  provisional: boolean;
  solved: number;
  attempts: number;
};

type PuzzleAttemptRating = {
  userRating: number;
  delta: number;
  provisional: boolean;
  ratingChanged: boolean;
  firstAttempt: boolean;
};

// Rating UI wiring. One puzzle page is mounted at a time, so the rated
// preference and the "an attempt just changed my rating" callback live as
// module singletons the free-function attempt path can reach without threading.
let puzzleRatedPref = true;
let onAttemptRating: ((rating: PuzzleAttemptRating) => void) | null = null;
const PUZZLE_VARIANT_FILTERS: readonly PuzzleVariantFilter[] = [
  MINI_XIANGQI_SPEC_ID,
  DROP_MINI_XIANGQI_SPEC_ID,
  FORTRESS_XIANGQI_SPEC_ID,
];

export async function mountPuzzles(
  root: HTMLElement,
  initialPuzzleId: string | null = null,
): Promise<void> {
  installMiniXiangqiBoardStyles();
  installFortressXiangqiBoardStyles();
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
  let variantFilter: PuzzleVariantFilter = MINI_XIANGQI_SPEC_ID;
  let session: PuzzleSession | null = null;
  const solvedIds = loadSolvedPuzzleIds();
  let autoNext = loadAutoNextEnabled();
  let ratedEnabled = loadRatedEnabled();
  let userRating: UserPuzzleRating | null = null;
  let ratingDelta: number | null = null;
  let autoNextTimer: number | null = null;
  let loadToken = 0;
  let ratingToken = 0;
  puzzleRatedPref = ratedEnabled;

  const queueSummaries = (): PuzzleSummary[] => filterPuzzlesByVariant(summaries, variantFilter);

  // Refresh the signed-in user's rating for the current variant. Guarded by a
  // token so a slow response for an old variant can't overwrite a newer one.
  const refreshUserRating = async (): Promise<void> => {
    const token = ++ratingToken;
    const next = await fetchUserPuzzleRating(variantFilter);
    if (token !== ratingToken) return;
    userRating = next;
    renderControls();
  };

  // A rated attempt just resolved: show the delta and re-sync the authoritative
  // rating + counts from the server.
  onAttemptRating = async (rating) => {
    ratingDelta = rating.ratingChanged ? rating.delta : null;
    const token = ++ratingToken;
    const next = await fetchUserPuzzleRating(variantFilter);
    if (token !== ratingToken) return;
    userRating = next;
    renderControls();
  };

  const renderControls = (): void => {
    renderQueuePanel(controls, {
      queue: queueSummaries(),
      selectedId,
      solvedIds,
      variantFilter,
      autoNext,
      ratedEnabled,
      userRating,
      ratingDelta,
      onVariantChange: async (nextFilter) => {
        variantFilter = nextFilter;
        ratingDelta = null;
        const queue = queueSummaries();
        const nextId =
          selectedId && queue.some((puzzle) => puzzle.id === selectedId)
            ? selectedId
            : (queue[0]?.id ?? null);
        renderControls();
        void refreshUserRating();
        if (nextId) {
          await selectPuzzle(nextId, true);
        } else {
          selectedId = null;
          session = null;
          renderStatus(detail, 'No puzzles');
        }
      },
      onAutoNextChange: (enabled) => {
        autoNext = enabled;
        saveAutoNextEnabled(enabled);
        renderControls();
      },
      onRatedChange: (enabled) => {
        ratedEnabled = enabled;
        puzzleRatedPref = enabled;
        saveRatedEnabled(enabled);
        renderControls();
      },
    });
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
    ratingDelta = null;
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
  else if (!summaries.some((puzzle) => puzzle.variant === variantFilter) && summaries[0]) {
    variantFilter = summaries[0].variant;
  }
  renderControls();
  void refreshUserRating();

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

  // The mini-xiangqi board renders pieces as inline SVG, so a live piece-set or
  // board-theme change (from the appearance menu) must re-render to pick up the
  // new set — matching every other xiangqi surface (replay, postgame, live).
  window.addEventListener(xiangqiAppearanceChangedEvent, () => {
    if (session) renderSession();
    else renderControls();
  });
}

function createPuzzleSession(puzzle: PuzzleDetail): PuzzleSession {
  return {
    puzzle,
    state: clonePuzzleState(puzzle.initial),
    playedMoves: [],
    solverMoves: [],
    viewPly: 0,
    selectedSquare: null,
    selectedDrop: null,
    draggingFrom: null,
    feedback: { kind: 'neutral', text: 'Find the forcing move.' },
    submitting: false,
  };
}

type QueuePanelProps = {
  queue: readonly PuzzleSummary[];
  selectedId: string | null;
  solvedIds: ReadonlySet<string>;
  variantFilter: PuzzleVariantFilter;
  autoNext: boolean;
  ratedEnabled: boolean;
  userRating: UserPuzzleRating | null;
  ratingDelta: number | null;
  onVariantChange: (variant: PuzzleVariantFilter) => Promise<void>;
  onAutoNextChange: (enabled: boolean) => void;
  onRatedChange: (enabled: boolean) => void;
};

function renderQueuePanel(host: HTMLElement, props: QueuePanelProps): void {
  const {
    queue,
    selectedId,
    solvedIds,
    variantFilter,
    autoNext,
    ratedEnabled,
    userRating,
    ratingDelta,
    onVariantChange,
    onAutoNextChange,
    onRatedChange,
  } = props;
  host.replaceChildren();

  const currentIndex = Math.max(
    0,
    queue.findIndex((puzzle) => puzzle.id === selectedId),
  );
  const current = queue[currentIndex] ?? null;
  const solvedCount = queue.filter((puzzle) => solvedIds.has(puzzle.id)).length;

  const infoCard = document.createElement('section');
  infoCard.className = 'puzzle-left-card puzzle-current-card puzzle-info-card';
  if (current) {
    infoCard.append(
      puzzleInfoRow('target', [
        puzzleInfoLine(`Puzzle ${puzzleNumberLabel(currentIndex)}`),
        puzzleInfoLine('Rating: hidden'),
        puzzleInfoLine(solvedIds.has(current.id) ? 'Solved' : 'Played locally'),
      ]),
      puzzleInfoDivider(),
      puzzleInfoRow(
        'variant',
        [
          puzzleInfoLine(`From set ${variantLabel(current.variant)}`),
          puzzleInfoLine(`${goalLabel(current)} | ${colorLabel(current.sideToMove)} to move`),
        ],
        current.variant,
      ),
    );
  } else {
    const empty = document.createElement('p');
    empty.className = 'puzzle-card-empty';
    empty.textContent = 'No puzzles for this variant.';
    infoCard.append(empty);
  }

  const ratingCard = document.createElement('section');
  ratingCard.className = 'puzzle-left-card puzzle-rating-card';
  const ratingLabel = document.createElement('p');
  ratingLabel.textContent = 'Your puzzle rating:';
  const ratingValue = document.createElement('strong');
  if (userRating) {
    ratingValue.textContent = `${userRating.rating}${userRating.provisional ? '?' : ''}`;
    if (ratingDelta) {
      const delta = document.createElement('span');
      delta.className = `puzzle-rating-delta puzzle-rating-delta--${ratingDelta > 0 ? 'up' : 'down'}`;
      delta.textContent = ` ${ratingDelta > 0 ? '+' : ''}${ratingDelta}`;
      ratingValue.append(delta);
    }
  } else {
    ratingValue.textContent = 'Unrated';
  }
  const ratingMeta = document.createElement('span');
  ratingMeta.textContent = `${solvedCount} solved of ${queue.length}`;
  ratingCard.append(ratingLabel, ratingValue, ratingMeta);

  // Rated on/off (lichess parity). Off = practice: attempts send rated:false, so
  // neither the user's nor the puzzle's rating moves.
  const ratedCard = document.createElement('section');
  ratedCard.className = 'puzzle-left-card puzzle-rated-card';
  const ratedToggle = document.createElement('label');
  ratedToggle.className = 'puzzle-toggle puzzle-rated-toggle';
  const ratedInput = document.createElement('input');
  ratedInput.type = 'checkbox';
  ratedInput.checked = ratedEnabled;
  ratedInput.dataset.puzzleRated = 'true';
  ratedInput.addEventListener('change', () => onRatedChange(ratedInput.checked));
  const ratedSwitch = document.createElement('span');
  ratedSwitch.className = 'puzzle-toggle-switch';
  ratedSwitch.setAttribute('aria-hidden', 'true');
  const ratedName = document.createElement('span');
  ratedName.className = 'puzzle-toggle-label';
  ratedName.textContent = 'Rated';
  ratedToggle.append(ratedInput, ratedSwitch, ratedName);
  ratedCard.append(ratedToggle);
  if (!ratedEnabled) {
    const ratedNote = document.createElement('p');
    ratedNote.className = 'puzzle-rated-note';
    ratedNote.textContent =
      'Your puzzle rating will not change. Puzzles are not a competition: your rating just helps pick puzzles at your level.';
    ratedCard.append(ratedNote);
  }

  const themesCard = document.createElement('section');
  themesCard.className = 'puzzle-left-card puzzle-theme-card';
  const themesTitle = document.createElement('h2');
  themesTitle.textContent = 'Puzzle themes';
  const themesCopy = document.createElement('p');
  themesCopy.textContent = 'Forcing lines grouped by mate pattern, piece, and variant.';
  themesCard.append(themesTitle);
  if (current) {
    themesCard.append(themesCopy, tagsPanel(current));
  } else {
    const empty = document.createElement('p');
    empty.className = 'puzzle-card-empty';
    empty.textContent = 'No themes';
    themesCard.append(empty);
  }

  const settingsCard = document.createElement('section');
  settingsCard.className = 'puzzle-left-card puzzle-settings-card';
  const settingsTitle = document.createElement('h2');
  settingsTitle.textContent = 'Settings';
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
    option.textContent = variantFilterLabel(filter);
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
  const autoNextSwitch = document.createElement('span');
  autoNextSwitch.className = 'puzzle-toggle-switch';
  autoNextSwitch.setAttribute('aria-hidden', 'true');
  const autoNextLabel = document.createElement('span');
  autoNextLabel.className = 'puzzle-toggle-label';
  autoNextLabel.textContent = 'Jump to next puzzle immediately';
  autoNextToggle.append(autoNextInput, autoNextSwitch, autoNextLabel);
  form.append(autoNextToggle);
  settingsCard.append(settingsTitle, form);

  host.append(infoCard, ratingCard, ratedCard, themesCard, settingsCard);
}

function puzzleInfoRow(
  icon: 'target' | 'variant',
  lines: readonly HTMLElement[],
  variant?: PuzzleVariant,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'puzzle-info-row';
  const iconEl = document.createElement('span');
  iconEl.className = `puzzle-info-icon puzzle-info-icon--${icon}`;
  iconEl.setAttribute('aria-hidden', 'true');
  iconEl.innerHTML =
    icon === 'target'
      ? targetAvatarSvg()
      : variant
        ? renderVariantMiniBoard(variantMiniIdForPuzzle(variant), {
            size: 54,
            label: `${variantLabel(variant)} marker`,
            className: 'puzzle-variant-mini',
          })
        : '';
  const copy = document.createElement('div');
  copy.className = 'puzzle-info-copy';
  copy.append(...lines);
  row.append(iconEl, copy);
  return row;
}

function puzzleInfoLine(text: string): HTMLSpanElement {
  const line = document.createElement('span');
  line.textContent = text;
  return line;
}

function puzzleInfoDivider(): HTMLHRElement {
  const divider = document.createElement('hr');
  divider.className = 'puzzle-info-divider';
  return divider;
}

function puzzleNumberLabel(index: number): string {
  return `#${String(index + 1).padStart(3, '0')}`;
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

  const boardPanel = document.createElement('div');
  boardPanel.className = 'puzzle-board-panel';
  const board = document.createElement('div');
  board.className = 'puzzle-board';
  const side = document.createElement('aside');
  side.className = 'puzzle-side-panel';

  paintPuzzleBoard(board, session, renderSession, onSolved);

  const trainer = document.createElement('div');
  trainer.className = 'puzzle-trainer-panel';
  trainer.append(moveListPanel(session), feedbackPanel(session, navigation));
  side.append(trainer, actionPanel(session, renderSession, cancelAutoNext));
  boardPanel.append(board, side);
  host.append(boardPanel);
}

// Paint the interactive board (+ reserves for drop variants) and wire drag.
// Fortress Xiangqi renders on its own 7x8 corner-palace board; Mini/Drop Mini
// share the 7x7 mini renderer (Drop Mini via a mini-shaped board view).
function paintPuzzleBoard(
  board: HTMLElement,
  session: PuzzleSession,
  renderSession: () => void,
  onSolved: (id: string) => void,
): void {
  const displayState = puzzleReplayState(session);
  if (session.puzzle.variant === FORTRESS_XIANGQI_SPEC_ID) {
    paintFortressPuzzleBoard(
      board,
      session,
      displayState as FortressXiangqiGameState,
      renderSession,
      onSolved,
    );
    return;
  }
  const { boardView, dropView } = puzzleViews(session, displayState);
  const boardTarget = dropView
    ? renderPuzzleBoardShell(board, session, dropView, renderSession, onSolved)
    : board;
  const legalMoves = highlightedBoardMoves(session);
  boardTarget.innerHTML = renderMiniXiangqiBoardSvg(boardView, boardView.perspective, {
    interactive: true,
    showFog: false,
    selectedSquare: session.selectedSquare as MiniXiangqiSquare | null,
    legalMoves,
    draggingFrom: session.draggingFrom as MiniXiangqiSquare | null,
  });
  installBoardDrag({
    board: boardTarget,
    ghostSizePx: MINI_XIANGQI_PIECE_PX,
    onSquareClick: (square) => {
      if (!isReplayLive(session)) return;
      void handleBoardClick(session, square as MiniXiangqiSquare, renderSession, onSolved);
    },
    canDragFrom: (square) => canDragBoardPiece(session, square as MiniXiangqiSquare),
    ghostHtml: (square) => {
      const entry = boardView.board[square as MiniXiangqiSquare];
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
}

function paintFortressPuzzleBoard(
  board: HTMLElement,
  session: PuzzleSession,
  state: FortressXiangqiGameState,
  renderSession: () => void,
  onSolved: (id: string) => void,
): void {
  const perspective = fortressPerspective(session);
  const view = getFortressXiangqiPlayerView(state, perspective);
  const boardTarget = renderFortressPuzzleShell(board, session, view, renderSession, onSolved);
  boardTarget.innerHTML = renderFortressXiangqiBoardSvg(view, perspective, {
    interactive: true,
    selectedSquare: session.selectedSquare as FortressXiangqiSquare | null,
    targets: fortressHighlightTargets(session, view),
    draggingFrom: session.draggingFrom as FortressXiangqiSquare | null,
  });
  installBoardDrag({
    board: boardTarget,
    ghostSizePx: FORTRESS_XIANGQI_PIECE_PX,
    onSquareClick: (square) => {
      if (!isReplayLive(session)) return;
      void handleFortressBoardClick(
        session,
        square as FortressXiangqiSquare,
        renderSession,
        onSolved,
      );
    },
    canDragFrom: (square) => canDragFortressPiece(session, square as FortressXiangqiSquare),
    ghostHtml: (square) => {
      const piece = view.board[square as FortressXiangqiSquare];
      return piece ? fortressXiangqiPieceGhostSvg(piece) : null;
    },
    onDragStart: (from) => {
      session.selectedSquare = from as FortressXiangqiSquare;
      session.selectedDrop = null;
      session.draggingFrom = from as FortressXiangqiSquare;
      renderSession();
    },
    onDrop: (from, to) => {
      void handleFortressBoardDrop(
        session,
        from as FortressXiangqiSquare,
        (to as FortressXiangqiSquare | null) ?? null,
        renderSession,
        onSolved,
      );
    },
  });
}

function renderFortressPuzzleShell(
  host: HTMLElement,
  session: PuzzleSession,
  view: FortressXiangqiPlayerView,
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
  fillFortressPuzzleReserve(topReserve, session, view, top, false, renderSession, onSolved);
  fillFortressPuzzleReserve(bottomReserve, session, view, bottom, true, renderSession, onSolved);

  shell.append(topReserve, boardSurface, bottomReserve);
  host.append(shell);
  return boardSurface;
}

function fillFortressPuzzleReserve(
  reserve: HTMLElement,
  session: PuzzleSession,
  view: FortressXiangqiPlayerView,
  color: FortressXiangqiColor,
  isBottom: boolean,
  renderSession: () => void,
  onSolved: (id: string) => void,
): void {
  const canPlay =
    isBottom &&
    color === activeTurn(session) &&
    session.state.status.type === 'playing' &&
    isReplayLive(session) &&
    !session.submitting;
  fillFortressXiangqiReserve(reserve, view, color, {
    interactive: canPlay,
    selectedRole: canPlay ? (session.selectedDrop as FortressXiangqiDropRole | null) : null,
    onSelect: (role) => {
      if (!canPlay) return;
      session.selectedDrop = session.selectedDrop === role ? null : role;
      session.selectedSquare = null;
      session.feedback = { kind: 'neutral', text: `${dropRoleLabel(role)} selected.` };
      renderSession();
    },
  });
  installHandDrag({
    hand: reserve,
    ghostSizePx: FORTRESS_XIANGQI_PIECE_PX,
    isRole: isFortressDropRole,
    canDragRole: (role) => canPlay && (view.hands[color][role] ?? 0) > 0,
    ghostHtml: (role) => fortressXiangqiPieceGhostSvg({ color, role }),
    onDragStart: (role) => {
      if (!canPlay) return;
      session.selectedDrop = role;
      session.selectedSquare = null;
      session.draggingFrom = null;
      session.feedback = { kind: 'neutral', text: `${dropRoleLabel(role)} selected.` };
      renderSession();
    },
    onDrop: (role, to) => {
      void handleFortressReserveDrop(
        session,
        role,
        (to as FortressXiangqiSquare | null) ?? null,
        renderSession,
        onSolved,
      );
    },
  });
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

function feedbackPanel(session: PuzzleSession, navigation: PuzzleNavigation): HTMLElement {
  if (isSessionSolved(session)) return solvedPanel(navigation);

  const panel = document.createElement('div');
  panel.className = `puzzle-feedback puzzle-feedback--${session.feedback.kind}`;
  const icon = document.createElement('span');
  icon.className = 'puzzle-feedback-icon';
  icon.textContent = '♔';
  icon.setAttribute('aria-hidden', 'true');
  const copy = document.createElement('div');
  copy.className = 'puzzle-feedback-copy';
  const title = document.createElement('h2');
  title.className = 'puzzle-feedback-title';
  title.textContent = feedbackTitle(session);
  const body = document.createElement('span');
  body.className = 'puzzle-feedback-body';
  body.textContent = session.feedback.text;
  copy.append(title, body);
  panel.append(icon, copy);
  return panel;
}

function solvedPanel(navigation: PuzzleNavigation): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'puzzle-solved-panel';

  const title = document.createElement('h2');
  title.textContent = 'Success!';

  // Prominent primary CTA (lichess parity), in Mistboard's own accent.
  const cont = document.createElement('button');
  cont.type = 'button';
  cont.className = 'puzzle-continue-button';
  cont.dataset.puzzleNext = 'true';
  cont.innerHTML = `${ICON_PLAY}<span>Continue training</span>`;
  cont.setAttribute('aria-label', 'Continue training');
  cont.disabled = !navigation.hasNext;
  cont.addEventListener('click', navigation.goNext);

  const feedbackRow = document.createElement('div');
  feedbackRow.className = 'puzzle-solved-feedback';
  // The target opens the analysis board on lichess. We don't have one yet, so
  // this is a disabled stub for now.
  const analysis = document.createElement('button');
  analysis.type = 'button';
  analysis.className = 'puzzle-analysis-button';
  analysis.innerHTML = targetAvatarSvg();
  analysis.title = 'Analysis board (coming soon)';
  analysis.setAttribute('aria-label', 'Open analysis board (coming soon)');
  analysis.disabled = true;
  const prompt = document.createElement('span');
  prompt.className = 'puzzle-vote-prompt';
  prompt.textContent = 'Did you like this puzzle?';
  const votes = document.createElement('div');
  votes.className = 'puzzle-vote-actions';
  votes.append(puzzleVoteButton('up', navigation), puzzleVoteButton('down', navigation));
  feedbackRow.append(analysis, prompt, votes);

  panel.append(title, cont, feedbackRow);
  return panel;
}

function puzzleVoteButton(kind: 'up' | 'down', navigation: PuzzleNavigation): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `puzzle-vote-button puzzle-vote-button--${kind}`;
  button.setAttribute(
    'aria-label',
    kind === 'up' ? 'Puzzle was helpful' : 'Puzzle was not helpful',
  );
  button.innerHTML = kind === 'up' ? THUMB_UP_SVG : THUMB_DOWN_SVG;
  button.disabled = !navigation.hasNext;
  button.addEventListener('click', navigation.goNext);
  return button;
}

function moveListPanel(session: PuzzleSession): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'puzzle-moves';
  const list = document.createElement('ol');
  list.className = 'puzzle-move-list';
  const rows = puzzleMoveRows(session);
  for (const row of rows) {
    list.append(row);
  }
  panel.append(list);
  return panel;
}

function actionPanel(
  session: PuzzleSession,
  renderSession: () => void,
  cancelAutoNext: () => void,
): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'puzzle-actions';
  const atStart = session.viewPly <= 0 || session.submitting;
  const atEnd = session.viewPly >= session.playedMoves.length || session.submitting;
  const lastPly = session.playedMoves.length;

  const first = actionButton('puzzleReplayFirst', ICON_FIRST, 'First move', atStart, () => {
    session.viewPly = 0;
    renderSession();
  });
  const previous = actionButton('puzzleReplayPrevious', ICON_PREV, 'Previous move', atStart, () => {
    session.viewPly = Math.max(0, session.viewPly - 1);
    renderSession();
  });
  const reset = actionButton('puzzleReplayReset', '↺', 'Restart puzzle', session.submitting, () => {
    cancelAutoNext();
    Object.assign(session, createPuzzleSession(session.puzzle));
    renderSession();
  });
  const next = actionButton('puzzleReplayNext', ICON_NEXT, 'Next move', atEnd, () => {
    session.viewPly = Math.min(lastPly, session.viewPly + 1);
    renderSession();
  });
  const last = actionButton('puzzleReplayLast', ICON_LAST, 'Last move', atEnd, () => {
    session.viewPly = lastPly;
    renderSession();
  });
  panel.append(first, previous, reset, next, last);
  return panel;
}

function actionButton(
  dataKey: string,
  glyph: string,
  label: string,
  disabled: boolean,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'puzzle-button';
  button.dataset[dataKey] = 'true';
  if (glyph.startsWith('<')) button.innerHTML = glyph;
  else button.textContent = glyph;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.disabled = disabled;
  button.addEventListener('click', onClick);
  return button;
}

function isSessionSolved(session: PuzzleSession): boolean {
  return session.state.status.type === 'finished';
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
      isReplayLive(session) &&
      !session.submitting,
    selectedRole:
      isBottom &&
      color === activeTurn(session) &&
      session.state.status.type === 'playing' &&
      isReplayLive(session) &&
      !session.submitting
        ? (session.selectedDrop as DropMiniXiangqiDropRole | null)
        : null,
    onSelect: (role) => {
      if (
        !isBottom ||
        color !== activeTurn(session) ||
        session.state.status.type !== 'playing' ||
        !isReplayLive(session)
      ) {
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
      isReplayLive(session) &&
      !session.submitting &&
      (view.hands[color][role] ?? 0) > 0,
    ghostHtml: (role) => miniXiangqiPieceGhostSvg({ color, role }),
    onDragStart: (role) => {
      if (
        !isBottom ||
        color !== activeTurn(session) ||
        session.state.status.type !== 'playing' ||
        !isReplayLive(session)
      ) {
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

function tagsPanel(puzzle: Pick<PuzzleSummary, 'themes'>): HTMLElement {
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
  if (session.submitting || session.state.status.type !== 'playing' || !isReplayLive(session)) {
    return;
  }
  if (session.selectedDrop) {
    const drop = session.selectedDrop as DropMiniXiangqiDropRole;
    const targets = dropTargetsFor(session, drop);
    if (targets.includes(square)) {
      await submitMove(session, { drop, to: square }, renderSession, onSolved);
      return;
    }
    session.selectedDrop = null;
    session.feedback = { kind: 'neutral', text: 'Reserve cleared.' };
    renderSession();
    return;
  }

  if (session.selectedSquare) {
    const move = boardMovesFor(session, session.selectedSquare as MiniXiangqiSquare).find(
      (m) => m.to === square,
    );
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
  if (
    session.submitting ||
    session.state.status.type !== 'playing' ||
    !to ||
    !isReplayLive(session)
  ) {
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
  if (
    session.submitting ||
    session.state.status.type !== 'playing' ||
    !to ||
    !isReplayLive(session)
  ) {
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

// ── Fortress Xiangqi interaction ─────────────────────────────────────────────
// Parallels the Mini/Drop-Mini click/drag/drop handlers, but over the Fortress
// player view. Selection lives on the shared session; moves are submitted
// through the same variant-agnostic submitMove path.

function fortressPerspective(session: PuzzleSession): FortressXiangqiColor {
  return session.puzzle.sideToMove ?? 'red';
}

function fortressLiveView(session: PuzzleSession): FortressXiangqiPlayerView {
  return getFortressXiangqiPlayerView(
    session.state as FortressXiangqiGameState,
    fortressPerspective(session),
  );
}

function fortressHighlightTargets(
  session: PuzzleSession,
  view: FortressXiangqiPlayerView,
): FortressXiangqiSquare[] {
  if (!isReplayLive(session)) return [];
  if (session.selectedDrop) {
    return fortressXiangqiDropTargets(view, session.selectedDrop as FortressXiangqiDropRole);
  }
  if (!session.selectedSquare) return [];
  return fortressXiangqiBoardMoves(view, session.selectedSquare as FortressXiangqiSquare).map(
    (move) => move.to,
  );
}

function fortressIsSelectable(
  session: PuzzleSession,
  view: FortressXiangqiPlayerView,
  square: FortressXiangqiSquare,
): boolean {
  const piece = view.board[square];
  return (
    !!piece &&
    piece.color === activeTurn(session) &&
    fortressXiangqiBoardMoves(view, square).length > 0
  );
}

function canDragFortressPiece(session: PuzzleSession, square: FortressXiangqiSquare): boolean {
  if (session.submitting || session.state.status.type !== 'playing' || !isReplayLive(session)) {
    return false;
  }
  return fortressIsSelectable(session, fortressLiveView(session), square);
}

async function handleFortressBoardClick(
  session: PuzzleSession,
  square: FortressXiangqiSquare,
  renderSession: () => void,
  onSolved: (id: string) => void,
): Promise<void> {
  if (session.submitting || session.state.status.type !== 'playing' || !isReplayLive(session)) {
    return;
  }
  const view = fortressLiveView(session);
  if (session.selectedDrop) {
    const role = session.selectedDrop as FortressXiangqiDropRole;
    if (fortressXiangqiDropTargets(view, role).includes(square)) {
      await submitMove(session, { drop: role, to: square }, renderSession, onSolved);
      return;
    }
    session.selectedDrop = null;
    session.feedback = { kind: 'neutral', text: 'Reserve cleared.' };
    renderSession();
    return;
  }

  if (session.selectedSquare) {
    const move = fortressXiangqiBoardMoves(
      view,
      session.selectedSquare as FortressXiangqiSquare,
    ).find((candidate) => candidate.to === square);
    if (move) {
      await submitMove(session, move, renderSession, onSolved);
      return;
    }
  }

  if (fortressIsSelectable(session, view, square)) {
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

async function handleFortressBoardDrop(
  session: PuzzleSession,
  from: FortressXiangqiSquare,
  to: FortressXiangqiSquare | null,
  renderSession: () => void,
  onSolved: (id: string) => void,
): Promise<void> {
  session.draggingFrom = null;
  if (
    session.submitting ||
    session.state.status.type !== 'playing' ||
    !to ||
    !isReplayLive(session)
  ) {
    session.selectedSquare = null;
    session.selectedDrop = null;
    renderSession();
    return;
  }
  const move = fortressXiangqiBoardMoves(fortressLiveView(session), from).find(
    (candidate) => candidate.to === to,
  );
  if (move) {
    await submitMove(session, move, renderSession, onSolved);
    return;
  }
  session.selectedSquare = null;
  session.selectedDrop = null;
  session.feedback = { kind: 'neutral', text: 'Find the forcing move.' };
  renderSession();
}

async function handleFortressReserveDrop(
  session: PuzzleSession,
  role: FortressXiangqiDropRole,
  to: FortressXiangqiSquare | null,
  renderSession: () => void,
  onSolved: (id: string) => void,
): Promise<void> {
  session.draggingFrom = null;
  session.selectedSquare = null;
  session.selectedDrop = null;
  if (
    session.submitting ||
    session.state.status.type !== 'playing' ||
    !to ||
    !isReplayLive(session)
  ) {
    renderSession();
    return;
  }
  if (fortressXiangqiDropTargets(fortressLiveView(session), role).includes(to)) {
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
  const nextSolverMoves = [...session.solverMoves, move];
  const { attempt, rating } = await submitPuzzleAttempt(session.puzzle.id, nextSolverMoves);
  session.submitting = false;
  session.selectedSquare = null;
  session.selectedDrop = null;
  if (attempt.ok) {
    session.solverMoves = attempt.solverMoves;
    session.playedMoves = attempt.playedMoves;
    session.state = attempt.state;
    session.viewPly = session.playedMoves.length;
    if (attempt.complete) onSolved?.(session.puzzle.id);
    session.feedback = attempt.complete
      ? { kind: 'good', text: 'Solved.' }
      : { kind: 'good', text: 'Correct.' };
  } else {
    session.state = attempt.state;
    session.viewPly = session.playedMoves.length;
    session.feedback = { kind: 'bad', text: 'Try another move.' };
  }
  if (rating) onAttemptRating?.(rating);
  renderSession();
}

function puzzleViews(
  session: PuzzleSession,
  state: PuzzleState = session.state,
): {
  boardView: ReturnType<typeof getMiniXiangqiOpenPlayerView>;
  dropView: ReturnType<typeof getDropMiniXiangqiPlayerView> | null;
} {
  const turn = session.puzzle.sideToMove ?? activeTurn(session);
  if (session.puzzle.variant === DROP_MINI_XIANGQI_SPEC_ID) {
    const dropView = getDropMiniXiangqiPlayerView(state as DropMiniXiangqiGameState, turn);
    return { boardView: dropMiniXiangqiBoardView(dropView), dropView };
  }
  return {
    boardView: getMiniXiangqiOpenPlayerView(state as MiniXiangqiGameState, turn),
    dropView: null,
  };
}

function highlightedBoardMoves(session: PuzzleSession): MiniXiangqiMove[] {
  if (!isReplayLive(session)) return [];
  if (session.selectedDrop)
    return dropMiniXiangqiTargetMoves(
      dropTargetsFor(session, session.selectedDrop as DropMiniXiangqiDropRole),
    );
  if (!session.selectedSquare) return [];
  return boardMovesFor(session, session.selectedSquare as MiniXiangqiSquare);
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
    isReplayLive(session) &&
    isSelectablePiece(session, square)
  );
}

function activeTurn(session: PuzzleSession): MiniXiangqiColor {
  return session.state.status.type === 'playing'
    ? session.state.status.turn
    : (session.puzzle.sideToMove ?? 'red');
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
  if (
    value === MINI_XIANGQI_SPEC_ID ||
    value === DROP_MINI_XIANGQI_SPEC_ID ||
    value === FORTRESS_XIANGQI_SPEC_ID
  ) {
    return value;
  }
  return MINI_XIANGQI_SPEC_ID;
}

function variantFilterLabel(variant: PuzzleVariantFilter): string {
  return variantLabel(variant);
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
): Promise<{ attempt: PuzzleAttempt; rating: PuzzleAttemptRating | null }> {
  const response = await fetch(`/api/puzzles/${encodeURIComponent(id)}/attempt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ moves, rated: puzzleRatedPref }),
  });
  if (!response.ok) throw new Error(`Puzzle attempt failed: ${response.status}`);
  const body = (await response.json()) as {
    attempt?: PuzzleAttempt;
    rating?: PuzzleAttemptRating;
  };
  if (!body.attempt) throw new Error('Puzzle attempt response missing attempt.');
  return { attempt: body.attempt, rating: body.rating ?? null };
}

async function fetchUserPuzzleRating(variant: PuzzleVariant): Promise<UserPuzzleRating | null> {
  try {
    const response = await fetch(`/api/puzzles/rating?variant=${encodeURIComponent(variant)}`);
    if (!response.ok) return null;
    const body = (await response.json()) as { rating?: UserPuzzleRating | null };
    return body.rating ?? null;
  } catch {
    return null;
  }
}

function clonePuzzleState<State extends PuzzleState>(state: State): State {
  return structuredClone(state);
}

function puzzleReplayState(session: PuzzleSession): PuzzleState {
  if (isReplayLive(session)) return session.state;
  let state: PuzzleState = clonePuzzleState(session.puzzle.initial);
  const visibleMoves = session.playedMoves.slice(0, Math.max(0, session.viewPly));
  for (const move of visibleMoves) {
    state = applyPuzzleMove(session.puzzle.variant, state, move);
  }
  return state;
}

function applyPuzzleMove(
  variant: PuzzleVariant,
  state: PuzzleState,
  move: PuzzleMove,
): PuzzleState {
  if (variant === FORTRESS_XIANGQI_SPEC_ID) {
    return applyFortressXiangqiMove(state as FortressXiangqiGameState, move as FortressXiangqiMove);
  }
  if (variant === DROP_MINI_XIANGQI_SPEC_ID) {
    return applyDropMiniXiangqiMove(state as DropMiniXiangqiGameState, move as DropMiniXiangqiMove);
  }
  return applyMiniXiangqiOpenMove(state as MiniXiangqiGameState, move as MiniXiangqiMove);
}

function isReplayLive(session: PuzzleSession): boolean {
  return session.viewPly >= session.playedMoves.length;
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

function loadRatedEnabled(): boolean {
  try {
    // Rated is the default; only an explicit opt-out is stored.
    return window.localStorage?.getItem(RATED_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

function saveRatedEnabled(enabled: boolean): void {
  try {
    window.localStorage?.setItem(RATED_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Puzzle preferences are best-effort convenience state.
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
  if (variant === FORTRESS_XIANGQI_SPEC_ID) return 'Fortress Xiangqi';
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

function dropRoleLabel(role: string): string {
  return `${role[0]?.toUpperCase() ?? ''}${role.slice(1)}`;
}

function puzzleMoveLabel(move: PuzzleMove, variant: PuzzleVariant): string {
  if (variant === FORTRESS_XIANGQI_SPEC_ID) {
    return fortressXiangqiMoveLabel(move as FortressXiangqiMove);
  }
  if ('drop' in move) return `${dropRoleSymbol(move.drop as DropMiniXiangqiDropRole)}@${move.to}`;
  return `${move.from}-${move.to}`;
}

function puzzleMoveRows(session: PuzzleSession): HTMLElement[] {
  if (session.playedMoves.length === 0) return [puzzleMoveContextRow(session)];

  const firstColor = session.puzzle.sideToMove ?? 'red';
  const rows = new Map<
    number,
    { black?: { index: number; move: PuzzleMove }; red?: { index: number; move: PuzzleMove } }
  >();
  for (const [index, move] of session.playedMoves.entries()) {
    const color = moveColorAt(firstColor, index);
    const number = Math.floor(index / 2) + 1;
    const row = rows.get(number) ?? {};
    row[color] = { index, move };
    rows.set(number, row);
  }

  return Array.from(rows.entries()).map(([number, row]) => puzzleMoveRow(number, row, session));
}

function puzzleMoveContextRow(session: PuzzleSession): HTMLElement {
  const firstColor = session.puzzle.sideToMove ?? 'red';
  const row = document.createElement('li');
  row.className = 'puzzle-move-item puzzle-move-context';
  const number = puzzleMoveCell('puzzle-move-number', '1');
  const red = puzzleMoveCell('puzzle-move-red', firstColor === 'black' ? '...' : '');
  const black = puzzleMoveCell('puzzle-move-black', firstColor === 'red' ? '...' : '');
  row.append(number, red, black);
  return row;
}

function puzzleMoveRow(
  number: number,
  rowMoves: {
    black?: { index: number; move: PuzzleMove };
    red?: { index: number; move: PuzzleMove };
  },
  session: PuzzleSession,
): HTMLElement {
  const row = document.createElement('li');
  row.className = 'puzzle-move-item';
  if (
    rowMoves.red?.index === session.viewPly - 1 ||
    rowMoves.black?.index === session.viewPly - 1
  ) {
    row.classList.add('puzzle-move-item--active');
  }
  const numberCell = puzzleMoveCell('puzzle-move-number', String(number));
  const redCell = puzzleMoveCell(
    'puzzle-move-red',
    rowMoves.red ? puzzleMoveLabel(rowMoves.red.move, session.puzzle.variant) : '',
  );
  const blackCell = puzzleMoveCell(
    'puzzle-move-black',
    rowMoves.black ? puzzleMoveLabel(rowMoves.black.move, session.puzzle.variant) : '',
  );
  row.append(numberCell, redCell, blackCell);
  return row;
}

function puzzleMoveCell(className: string, text: string): HTMLSpanElement {
  const cell = document.createElement('span');
  cell.className = className;
  cell.textContent = text;
  return cell;
}

function moveColorAt(firstColor: MiniXiangqiColor, plyIndex: number): MiniXiangqiColor {
  return plyIndex % 2 === 0 ? firstColor : oppositeMiniXiangqiColor(firstColor);
}

function targetAvatarSvg(): string {
  // Lucide `target` (24-grid, 2px round), consistent with the app's other inlined
  // Lucide icons (see landing-play.ts). Plain concentric bullseye, no arrow.
  return [
    '<svg class="puzzle-target-avatar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">',
    '<circle cx="12" cy="12" r="10"/>',
    '<circle cx="12" cy="12" r="6"/>',
    '<circle cx="12" cy="12" r="2"/>',
    '</svg>',
  ].join('');
}

function variantMiniIdForPuzzle(variant: PuzzleVariant): VariantMiniId {
  if (variant === FORTRESS_XIANGQI_SPEC_ID) return 'fortress-xiangqi';
  return variant === DROP_MINI_XIANGQI_SPEC_ID ? 'drop-mini-xiangqi' : 'mini-xiangqi';
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

function feedbackTitle(session: PuzzleSession): string {
  switch (session.feedback.kind) {
    case 'good':
      return isSessionSolved(session) ? 'Solved' : 'Correct';
    case 'bad':
      return 'Try again';
    case 'pending':
      return 'Checking';
    case 'neutral':
      return session.puzzle.title;
  }
}

function isDropRole(value: string): value is DropMiniXiangqiDropRole {
  return (DROP_MINI_XIANGQI_DROP_ROLES as readonly string[]).includes(value);
}

function isFortressDropRole(value: string): value is FortressXiangqiDropRole {
  return (FORTRESS_DROP_ROLES as readonly string[]).includes(value);
}

function themeLabel(theme: string): string {
  return theme
    .split('-')
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');
}

const ICON_FIRST =
  '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M4 3.5h1.7v9H4zM13 3.5v9L6.5 8z" fill="currentColor"/></svg>';
const ICON_LAST =
  '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M10.3 3.5H12v9h-1.7zM3 3.5v9L9.5 8z" fill="currentColor"/></svg>';
const ICON_PLAY =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M5 3.2v9.6L12.5 8z" fill="currentColor"/></svg>';
const ICON_PREV =
  '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M11 3.5v9L5 8z" fill="currentColor"/></svg>';
const ICON_NEXT =
  '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M5 3.5v9L11 8z" fill="currentColor"/></svg>';
const THUMB_UP_SVG =
  '<svg viewBox="0 0 64 64" width="76" height="76" aria-hidden="true"><path d="M23 54h-8a4 4 0 0 1-4-4V30a4 4 0 0 1 4-4h8v28Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M23 29c7-5 9-15 12-18 2-2 6-1 7 3 1 5-3 10-3 12h10c6 0 9 5 7 10l-5 13c-1 4-5 6-9 6H23V29Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>';
const THUMB_DOWN_SVG =
  '<svg viewBox="0 0 64 64" width="76" height="76" aria-hidden="true"><path d="M41 10h8a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4h-8V10Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M41 35c-7 5-9 15-12 18-2 2-6 1-7-3-1-5 3-10 3-12H15c-6 0-9-5-7-10l5-13c1-4 5-6 9-6h19v26Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>';
