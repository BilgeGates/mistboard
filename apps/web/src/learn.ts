import {
  fogOfWarVariant,
  type Board,
  type GameState,
  type Move,
  type PlayerView,
  type Square,
} from '@mistboard/game';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type * as cg from 'chessground/types';
import { boardFen, hiddenSquareClasses } from '@mistboard/board-render/interactive';
import { primaryNavItems, utilityNavItems } from './nav-items.js';

const GITHUB_URL = 'https://github.com/brianhliou/mistboard';
const boardFiles = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

type Uci = `${Square}${Square}`;

type TutorialStep = {
  teach: string;
  challenge: string;
  targets: Square[];
  afterTargets: Square[];
  accepted: Uci[];
  softFailures: Partial<Record<Uci, string>>;
  success: string;
  opponentReply?: Uci;
};

type TutorialChapter = {
  id: string;
  title: string;
  lesson: string;
  goal: string;
  board: Board;
  castlingRights?: Square[];
  enPassantSquare?: Square;
  halfmoveClock?: number;
  moveNumber?: number;
  steps: TutorialStep[];
  reveal?: {
    scout: Square;
    revealed: Square;
    text: string;
  };
  revealTruthOnSuccess?: boolean;
  interaction?: 'reveal';
};

type ChapterStatus = 'ready' | 'success' | 'soft-failure';

type TutorialLesson = {
  title: string;
  icon: string;
};

type TutorialCategory = {
  title: string;
  lessons: TutorialLesson[];
};

const learnCategories: TutorialCategory[] = [
  {
    title: 'Tutorial',
    lessons: [
      { title: 'Vision', icon: '1' },
      { title: 'King Capture', icon: '2' },
      { title: 'Hidden Moves', icon: '3' },
      { title: 'Mini-game', icon: '4' },
      { title: 'Replay', icon: '5' },
    ],
  },
];

const chapters: TutorialChapter[] = [
  {
    id: 'tutorial-vision',
    lesson: 'Vision',
    title: 'Move and watch',
    goal: 'Move the rook anywhere. Watch how the fog changes.',
    board: {
      e1: { color: 'white', role: 'king' },
      d1: { color: 'white', role: 'rook' },
      h8: { color: 'black', role: 'king' },
    },
    steps: [
      {
        teach:
          'You see the squares your pieces can reach — plus the squares they stand on. Move the rook anywhere; the fog will update to match its new vision.',
        challenge: 'Move the rook anywhere.',
        targets: [],
        afterTargets: [],
        accepted: [
          'd1d2',
          'd1d3',
          'd1d4',
          'd1d5',
          'd1d6',
          'd1d7',
          'd1d8',
          'd1a1',
          'd1b1',
          'd1c1',
        ],
        softFailures: {},
        success:
          'Vision moves with the piece. Squares your rook can reach are now bright; squares it left behind may be dark.',
      },
    ],
  },
  {
    id: 'tutorial-king-capture',
    lesson: 'King Capture',
    title: 'Take the king',
    goal: "The black king is in your rook's sight. Capture it.",
    board: {
      e1: { color: 'white', role: 'king' },
      h1: { color: 'white', role: 'rook' },
      h8: { color: 'black', role: 'king' },
    },
    steps: [
      {
        teach:
          'In Fog of War there is no check or checkmate. When an enemy king is in your line of sight, you can take it and end the game. Capture the black king on h8.',
        challenge: 'Capture the king on h8.',
        targets: ['h8'],
        afterTargets: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8'],
        accepted: ['h1h8'],
        softFailures: {
          h1h7: 'Go all the way — capture the king on h8.',
          h1h2: 'The king is at the end of the file. Push the rook straight to h8.',
          h1h3: 'The king is at the end of the file. Push the rook all the way to h8.',
        },
        success:
          'You captured the king. In Fog of War there is no check or checkmate — when an enemy king is in your line of sight, you can take it and end the game.',
      },
    ],
  },
  {
    id: 'tutorial-hidden-move',
    lesson: 'Hidden Moves',
    title: 'What just happened?',
    goal: 'Your opponent just moved. Look at the board — anything different?',
    interaction: 'reveal',
    board: {
      a1: { color: 'white', role: 'rook' },
      b1: { color: 'white', role: 'knight' },
      c1: { color: 'white', role: 'bishop' },
      d1: { color: 'white', role: 'queen' },
      e1: { color: 'white', role: 'king' },
      f1: { color: 'white', role: 'bishop' },
      h1: { color: 'white', role: 'rook' },
      a2: { color: 'white', role: 'pawn' },
      b2: { color: 'white', role: 'pawn' },
      c2: { color: 'white', role: 'pawn' },
      d2: { color: 'white', role: 'pawn' },
      f2: { color: 'white', role: 'pawn' },
      g2: { color: 'white', role: 'pawn' },
      h2: { color: 'white', role: 'pawn' },
      f3: { color: 'white', role: 'knight' },
      e4: { color: 'white', role: 'pawn' },
      e5: { color: 'black', role: 'pawn' },
      c6: { color: 'black', role: 'knight' },
      a7: { color: 'black', role: 'pawn' },
      b7: { color: 'black', role: 'pawn' },
      c7: { color: 'black', role: 'pawn' },
      d7: { color: 'black', role: 'pawn' },
      f7: { color: 'black', role: 'pawn' },
      g7: { color: 'black', role: 'pawn' },
      h7: { color: 'black', role: 'pawn' },
      a8: { color: 'black', role: 'rook' },
      c8: { color: 'black', role: 'bishop' },
      d8: { color: 'black', role: 'queen' },
      e8: { color: 'black', role: 'king' },
      f8: { color: 'black', role: 'bishop' },
      g8: { color: 'black', role: 'knight' },
      h8: { color: 'black', role: 'rook' },
    },
    revealTruthOnSuccess: true,
    reveal: {
      scout: 'b8',
      revealed: 'c6',
      text: '',
    },
    steps: [
      {
        teach:
          "Your opponent just moved. You see your own pieces and the squares your pieces reach — but most of the board past rank 5 is in your fog. Look at the board for a moment. When you're ready, reveal what they did.",
        challenge: "Click 'Reveal what happened' when you're ready.",
        targets: [],
        afterTargets: [],
        accepted: [],
        softFailures: {},
        success:
          "Black developed a knight from b8 to c6 — entirely in your fog. No white piece reaches b8 or c6, so you saw nothing change. In Fog of War, an opponent move that happens fully in your fog is invisible to you. You only ever see the parts of their moves that touch your vision.",
      },
    ],
  },
];


export function mountLearn(root: HTMLElement): void {
  const state = createTutorialState();
  root.replaceChildren();
  root.classList.add('landing-page', 'learn-route');
  root.append(buildNav(), buildShell(state), buildFooter());
  render(state);
}

type TutorialState = {
  api: Api | null;
  boardEl: HTMLElement | null;
  chapterIndex: number;
  stepIndex: number;
  status: ChapterStatus;
  activeState: GameState;
  message: string;
  shell: HTMLElement | null;
};

function createTutorialState(): TutorialState {
  const first = chapters[0]!;
  return {
    api: null,
    boardEl: null,
    chapterIndex: 0,
    stepIndex: 0,
    status: 'ready',
    activeState: gameStateFromBoard(first.id, first.board),
    message: first.steps[0]!.teach,
    shell: null,
  };
}

function buildShell(state: TutorialState): HTMLElement {
  const shell = document.createElement('main');
  shell.className = 'learn-shell learn-tutorial-shell';
  state.shell = shell;
  return shell;
}

function render(state: TutorialState): void {
  const shell = state.shell;
  if (!shell) return;

  const chapter = chapters[state.chapterIndex]!;
  const view = fogOfWarVariant.getPlayerView(state.activeState, 'white');
  const menu = buildLearnMenu(state);
  const boardPanel = document.createElement('section');
  boardPanel.className = 'learn-board-panel';
  const boardEl = document.createElement('div');
  boardEl.className = 'board learn-board';
  boardEl.setAttribute('aria-label', 'Fog of War tutorial board');
  boardPanel.append(boardEl);

  const panel = buildPanel(state, chapter);
  shell.replaceChildren(menu, boardPanel, panel);
  state.boardEl = boardEl;
  state.api = createTutorialBoard(boardEl, view, chapter, state);
  updateBoard(state, chapter, view);
}

function buildLearnMenu(state: TutorialState): HTMLElement {
  const menu = document.createElement('aside');
  menu.className = 'learn-menu';
  menu.setAttribute('aria-label', 'Learn menu');

  const header = document.createElement('div');
  header.className = 'learn-menu-header';

  const badge = document.createElement('div');
  badge.className = 'learn-menu-badge';
  badge.textContent = '♜';

  const title = document.createElement('span');
  title.textContent = 'Menu';
  header.append(badge, title);

  menu.append(header);
  for (const category of learnCategories) {
    menu.append(buildLearnCategory(state, category));
  }
  menu.append(buildCollapsedCategory('What Next?'));
  return menu;
}

function buildLearnCategory(state: TutorialState, category: TutorialCategory): HTMLElement {
  const isCurrentCategory = category.lessons.some((lesson) => chapters[state.chapterIndex]?.lesson === lesson.title);
  const section = document.createElement('section');
  section.className = `learn-menu-category${isCurrentCategory ? ' is-open' : ' is-collapsed'}`;

  const title = document.createElement('h2');
  title.textContent = category.title;
  section.append(title);

  for (const lesson of category.lessons) {
    section.append(buildPieceLessonMenuItem(state, lesson));
  }

  return section;
}

function buildPieceLessonMenuItem(
  state: TutorialState,
  lesson: TutorialLesson,
): HTMLElement {
  const lessonChapters = chapterIndexesForLesson(lesson.title);
  const available = lessonChapters.length > 0;
  const isCurrentLesson = chapters[state.chapterIndex]?.lesson === lesson.title;

  const group = document.createElement('div');
  group.className = `learn-menu-lesson${isCurrentLesson ? ' is-current' : ''}${available ? '' : ' is-locked'}`;

  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'learn-menu-lesson-row';
  row.disabled = !available;
  row.setAttribute('aria-expanded', String(isCurrentLesson && available));
  if (isCurrentLesson) row.setAttribute('aria-current', 'true');

  const piece = document.createElement('span');
  piece.className = 'learn-menu-piece';
  piece.textContent = lesson.icon;

  const label = document.createElement('span');
  label.className = 'learn-menu-lesson-label';
  label.textContent = lesson.title;

  const meta = document.createElement('span');
  meta.className = 'learn-menu-lesson-meta';
  meta.textContent = available ? `${lessonChapters.length}` : 'soon';

  row.append(piece, label, meta);
  row.addEventListener('click', () => {
    if (!available) return;
    goToChapter(state, lessonChapters[0]!);
  });
  group.append(row);

  if (available && isCurrentLesson) {
    const chapterList = document.createElement('div');
    chapterList.className = 'learn-menu-chapters';
    for (let localIndex = 0; localIndex < lessonChapters.length; localIndex += 1) {
      const chapterIndex = lessonChapters[localIndex]!;
      const chapter = chapters[chapterIndex]!;
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `learn-menu-chapter${chapterIndex === state.chapterIndex ? ' is-current' : ''}`;
      if (chapterIndex === state.chapterIndex) item.setAttribute('aria-current', 'step');
      item.textContent = `${localIndex + 1}. ${chapter.title}`;
      item.addEventListener('click', () => goToChapter(state, chapterIndex));
      chapterList.append(item);
    }
    group.append(chapterList);
  }

  return group;
}

function buildCollapsedCategory(title: string): HTMLElement {
  const category = document.createElement('section');
  category.className = 'learn-menu-category is-collapsed';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'learn-menu-category-row';
  button.disabled = true;
  button.setAttribute('aria-expanded', 'false');
  button.textContent = title;

  category.append(button);
  return category;
}

function buildPanel(state: TutorialState, chapter: TutorialChapter): HTMLElement {
  const step = currentStep(state, chapter);
  const panel = document.createElement('section');
  panel.className = 'learn-panel learn-tutorial-panel';

  const progress = document.createElement('div');
  progress.className = 'learn-progress';
  progress.textContent = lessonProgress(chapter.lesson);

  const heading = document.createElement('h1');
  heading.className = 'learn-heading';
  heading.textContent = chapter.lesson;

  const chapterTitle = document.createElement('h2');
  chapterTitle.className = 'learn-chapter-title';
  chapterTitle.textContent = chapter.title;

  const goal = document.createElement('p');
  goal.className = 'learn-copy';
  goal.textContent = chapter.goal;

  const prompt = document.createElement('div');
  prompt.className = `learn-tutorial-message ${state.status}`;
  prompt.textContent = state.message;

  const targetList = document.createElement('div');
  targetList.className = 'learn-target-list';
  for (const target of step.targets) {
    const item = document.createElement('span');
    item.textContent = target;
    targetList.append(item);
  }

  const actions = document.createElement('div');
  actions.className = 'learn-actions';

  if (state.status === 'success') {
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'landing-cta-primary';
    next.textContent = state.chapterIndex === chapters.length - 1 ? 'Restart' : 'Next';
    next.addEventListener('click', () => {
      if (state.chapterIndex === chapters.length - 1) {
        state.chapterIndex = 0;
      } else {
        state.chapterIndex += 1;
      }
      resetChapter(state);
    });
    actions.append(next);
  } else if (chapter.interaction === 'reveal') {
    const reveal = document.createElement('button');
    reveal.type = 'button';
    reveal.className = 'landing-cta-primary';
    reveal.textContent = 'Reveal what happened';
    reveal.addEventListener('click', () => triggerReveal(state));
    actions.append(reveal);
  } else if (state.status === 'soft-failure') {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'landing-cta-primary';
    retry.textContent = 'Try again';
    retry.addEventListener('click', () => resetChapter(state));
    actions.append(retry);
  } else {
    const hint = document.createElement('p');
    hint.className = 'learn-hint';
    hint.textContent = step.challenge;
    actions.append(hint);
  }

  panel.append(progress, heading, chapterTitle, goal, prompt, targetList, actions);
  return panel;
}

function createTutorialBoard(
  el: HTMLElement,
  view: PlayerView,
  chapter: TutorialChapter,
  state: TutorialState,
): Api {
  const interactive = chapter.interaction !== 'reveal';
  const api = Chessground(el, {
    animation: { enabled: false, duration: 0 },
    coordinates: true,
    coordinatesOnSquares: false,
    fen: boardFen(renderBoardFor(chapter, state, view)),
    orientation: 'white',
    movable: {
      free: false,
      color: interactive ? 'white' : undefined,
      dests: interactive ? legalDests(view) : new Map(),
    },
    draggable: { enabled: interactive },
    selectable: { enabled: interactive },
    premovable: { enabled: false },
    highlight: { custom: tutorialSquareClasses(view, chapter, state), lastMove: false },
    events: {
      move: (from, to) => handleMove(state, `${from}${to}` as Uci),
    },
    disableContextMenu: true,
  });
  return api;
}

function handleMove(state: TutorialState, uci: Uci): void {
  const chapter = chapters[state.chapterIndex]!;
  if (chapter.interaction === 'reveal') return;
  const step = currentStep(state, chapter);
  if (state.status !== 'ready') return;

  const view = fogOfWarVariant.getPlayerView(state.activeState, 'white');
  const move = moveFromUci(uci);
  const resolvedMove = resolveUiMove(view, move);
  if (!resolvedMove) {
    state.message = 'That move is not legal from this position.';
    render(state);
    return;
  }

  const resolvedUci = moveToUci(resolvedMove);
  const isAccepted = step.accepted.includes(uci) || step.accepted.includes(resolvedUci);

  const nextState = fogOfWarVariant.applyMove(state.activeState, resolvedMove);

  if (isAccepted && step.opponentReply) {
    // Two-phase reveal: render the truth board with white's move applied and the
    // opponent's piece still sitting on its origin square (the "oh, that's where it
    // was" moment), then apply the scripted capture after a short pause so the
    // player sees the threat before it lands.
    const oppReply = step.opponentReply;
    state.activeState = { ...nextState, lastMove: resolvedMove };
    state.status = 'success';
    state.message = chapter.reveal ? `${step.success} ${chapter.reveal.text}` : step.success;
    render(state);
    setTimeout(() => {
      if (state.chapterIndex !== chapters.indexOf(chapter)) return;
      const oppMove = moveFromUci(oppReply);
      const captured = fogOfWarVariant.applyMove(state.activeState, oppMove);
      state.activeState = { ...captured, lastMove: oppMove };
      render(state);
    }, 1500);
    return;
  }

  state.activeState = {
    ...nextState,
    status: { type: 'playing', turn: 'white' },
    lastMove: resolvedMove,
  };

  if (isAccepted) {
    const isFinalStep = state.stepIndex === chapter.steps.length - 1;
    if (isFinalStep) {
      state.status = 'success';
      state.message = chapter.reveal ? `${step.success} ${chapter.reveal.text}` : step.success;
    } else {
      state.stepIndex += 1;
      state.status = 'ready';
      state.message = `${step.success} ${currentStep(state, chapter).teach}`;
    }
  } else {
    state.status = 'soft-failure';
    state.message = step.softFailures[uci] ?? 'That is legal, but it does not solve this chapter.';
  }
  render(state);
}

function showTruthBoard(chapter: TutorialChapter, state: TutorialState): boolean {
  return state.status === 'success' && (chapter.revealTruthOnSuccess ?? false);
}

function renderBoardFor(chapter: TutorialChapter, state: TutorialState, view: PlayerView): Board {
  return showTruthBoard(chapter, state) ? state.activeState.board : view.board;
}

function resetChapter(state: TutorialState): void {
  const chapter = chapters[state.chapterIndex]!;
  state.activeState = gameStateFromBoard(chapter.id, chapter.board);
  state.stepIndex = 0;
  state.status = 'ready';
  state.message = chapter.steps[0]!.teach;
  render(state);
}

function goToChapter(state: TutorialState, chapterIndex: number): void {
  if (!chapters[chapterIndex]) return;
  state.chapterIndex = chapterIndex;
  resetChapter(state);
}

function updateBoard(state: TutorialState, chapter: TutorialChapter, view: PlayerView): void {
  const interactive = chapter.interaction !== 'reveal' && state.status === 'ready';
  state.api?.set({
    fen: boardFen(renderBoardFor(chapter, state, view)),
    movable: {
      color: interactive ? 'white' : undefined,
      dests: interactive ? legalDests(view) : new Map(),
    },
    highlight: { custom: tutorialSquareClasses(view, chapter, state), lastMove: false },
  });
}

function triggerReveal(state: TutorialState): void {
  const chapter = chapters[state.chapterIndex]!;
  if (chapter.interaction !== 'reveal') return;
  if (state.status !== 'ready') return;
  const step = chapter.steps[0]!;
  state.status = 'success';
  state.message = chapter.reveal ? `${step.success} ${chapter.reveal.text}` : step.success;
  render(state);
}

function tutorialSquareClasses(
  view: PlayerView,
  chapter: TutorialChapter,
  state: TutorialState,
): cg.SquareClasses {
  const classes: cg.SquareClasses = showTruthBoard(chapter, state)
    ? new Map()
    : hiddenSquareClasses(view);
  const step = currentStep(state, chapter);
  const activeTargets = step.targets;
  for (const square of activeTargets) {
    classes.set(square as cg.Key, `${classes.get(square as cg.Key) ?? ''} learn-highlight`.trim());
  }
  if (state.status === 'success') {
    for (const square of step.afterTargets) {
      if (step.targets.includes(square)) continue;
      classes.set(square as cg.Key, `${classes.get(square as cg.Key) ?? ''} learn-explained`.trim());
    }
  }
  if (chapter.reveal && state.status === 'success') {
    for (const square of [chapter.reveal.scout, chapter.reveal.revealed]) {
      classes.set(square as cg.Key, `${classes.get(square as cg.Key) ?? ''} learn-reveal`.trim());
    }
  }
  return classes;
}

function currentStep(state: TutorialState, chapter: TutorialChapter): TutorialStep {
  return chapter.steps[state.stepIndex] ?? chapter.steps[chapter.steps.length - 1]!;
}

function lessonProgress(lesson: string): string {
  const lessons = learnCategories[0]?.lessons ?? [];
  const lessonIndex = Math.max(0, lessons.findIndex((entry) => entry.title === lesson));
  return `Step ${lessonIndex + 1} of ${lessons.length}`;
}

function chapterIndexesForLesson(lesson: string): number[] {
  const indexes: number[] = [];
  for (let i = 0; i < chapters.length; i += 1) {
    if (chapters[i]!.lesson === lesson) indexes.push(i);
  }
  return indexes;
}

function legalDests(view: PlayerView): cg.Dests {
  const dests: cg.Dests = new Map();
  for (const move of view.legalMoves) {
    const list = dests.get(move.from as cg.Key) ?? [];
    list.push(move.to as cg.Key);
    dests.set(move.from as cg.Key, list);
  }
  addCastlingDestinationAliases(view, dests);
  return dests;
}

function resolveUiMove(view: PlayerView, move: Move): Move | null {
  const castlingAlias = view.legalMoves.find((candidate) => (
    candidate.from === move.from && castlingKingDestinationFromView(view, candidate) === move.to
  ));
  if (castlingAlias) return castlingAlias;
  return view.legalMoves.find((candidate) => movesMatch(candidate, move)) ?? null;
}

function addCastlingDestinationAliases(view: PlayerView, dests: cg.Dests): void {
  for (const move of view.legalMoves) {
    const alias = castlingKingDestinationFromView(view, move);
    if (!alias) continue;
    const from = move.from as cg.Key;
    const current = dests.get(from) ?? [];
    if (!current.includes(alias as cg.Key)) dests.set(from, [...current, alias as cg.Key]);
  }
}

function castlingKingDestinationFromView(view: PlayerView, move: Move): Square | null {
  const piece = view.board[move.from];
  const rook = view.board[move.to];
  if (!piece || piece.role !== 'king' || !rook || rook.role !== 'rook' || rook.color !== piece.color) return null;
  if (rankOf(move.from) !== rankOf(move.to)) return null;
  return `${squareFileIndex(move.to) > squareFileIndex(move.from) ? 'g' : 'c'}${rankOf(move.from)}` as Square;
}

function squareFileIndex(square: Square): number {
  return boardFiles.indexOf(square[0] as typeof boardFiles[number]);
}

function rankOf(square: Square): string {
  return square[1] ?? '';
}

function gameStateFromBoard(id: string, board: Board): GameState {
  const chapter = chapters.find((candidate) => candidate.id === id);
  return {
    ...fogOfWarVariant.createInitialState(`learn-${id}`),
    board,
    status: { type: 'playing', turn: 'white' },
    castlingRights: chapter?.castlingRights ?? [],
    enPassantSquare: chapter?.enPassantSquare,
    halfmoveClock: chapter?.halfmoveClock ?? 0,
    moveNumber: chapter?.moveNumber ?? 1,
  };
}

function moveFromUci(uci: Uci): Move {
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
  };
}

function moveToUci(move: Move): Uci {
  return `${move.from}${move.to}` as Uci;
}

function movesMatch(left: Move, right: Move): boolean {
  return left.from === right.from && left.to === right.to;
}

function buildNav(): HTMLElement {
  const nav = document.createElement('nav');
  nav.className = 'site-nav';
  nav.setAttribute('aria-label', 'Primary');

  const brand = document.createElement('a');
  brand.className = 'site-nav-brand';
  brand.href = '/';

  const brandLogo = document.createElement('img');
  brandLogo.className = 'site-nav-logo';
  brandLogo.src = '/logo.svg';
  brandLogo.alt = '';
  brandLogo.width = 28;
  brandLogo.height = 28;

  const brandText = document.createElement('span');
  brandText.textContent = 'MISTBOARD';
  brand.append(brandLogo, brandText);

  const links = document.createElement('div');
  links.className = 'site-nav-links';
  for (const item of primaryNavItems()) {
    links.append(navLink(item.label, item.href));
  }

  const utilities = document.createElement('div');
  utilities.className = 'site-nav-utilities';
  for (const item of utilityNavItems()) {
    utilities.append(navLink(item.label, item.href));
  }
  utilities.append(navLink('Account', '/account'));

  nav.append(brand, links, utilities);
  return nav;
}

function navLink(label: string, href: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = href;
  link.className = 'site-nav-link';
  link.textContent = label;
  if (currentPath() === href) {
    link.classList.add('active');
    link.setAttribute('aria-current', 'page');
  }
  return link;
}

function currentPath(): string {
  return window.location.pathname.replace(/\/+$/, '') || '/';
}

function buildFooter(): HTMLElement {
  const footer = document.createElement('footer');
  footer.className = 'site-footer';

  const left = document.createElement('div');
  left.className = 'site-footer-left';
  left.textContent = '© 2026 Mistboard';

  const right = document.createElement('div');
  right.className = 'site-footer-right';

  const license = document.createElement('span');
  license.textContent = 'AGPL-3.0';

  const sep = document.createElement('span');
  sep.className = 'site-footer-sep';
  sep.textContent = '·';

  const about = document.createElement('a');
  about.href = '/about';
  about.textContent = 'About';

  const sep2 = document.createElement('span');
  sep2.className = 'site-footer-sep';
  sep2.textContent = '·';

  const gh = document.createElement('a');
  gh.href = GITHUB_URL;
  gh.target = '_blank';
  gh.rel = 'noreferrer noopener';
  gh.textContent = 'GitHub';

  const source = document.createElement('a');
  source.href = '/source';
  source.textContent = 'Source';

  const sep3 = document.createElement('span');
  sep3.className = 'site-footer-sep';
  sep3.textContent = '·';

  right.append(license, sep, about, sep2, source, sep3, gh);
  footer.append(left, right);
  return footer;
}
