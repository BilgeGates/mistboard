import {
  fogOfWarVariant,
  type Board,
  type GameState,
  type Move,
  type PlayerView,
  type Square,
} from '@bichess/game';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type * as cg from 'chessground/types';
import { boardFen, hiddenSquareClasses } from './board-ui.js';

const GITHUB_URL = 'https://github.com/brianhliou/bichess';
const SHOW_ENGINE_LAB_LINKS =
  (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_SHOW_ENGINE_LAB_NAV === 'true';

type Uci = `${Square}${Square}`;

type TutorialStep = {
  teach: string;
  challenge: string;
  targets: Square[];
  afterTargets: Square[];
  accepted: Uci[];
  softFailures: Partial<Record<Uci, string>>;
  success: string;
};

type TutorialChapter = {
  id: string;
  title: string;
  lesson: string;
  goal: string;
  board: Board;
  steps: TutorialStep[];
  reveal?: {
    scout: Square;
    revealed: Square;
    text: string;
  };
};

type ChapterStatus = 'ready' | 'success' | 'soft-failure';

const chapters: TutorialChapter[] = [
  {
    id: 'rook-up-file',
    lesson: 'The Rook',
    title: 'Up The File',
    goal: 'Move the rook straight up to the marked square.',
    board: {
      b1: { color: 'white', role: 'king' },
      e2: { color: 'white', role: 'rook' },
    },
    steps: [
      {
        teach: 'Rooks move in straight lines. In Fog, the clear squares are the places your rook can move or see.',
        challenge: 'Bring the rook to e7.',
        targets: ['e7'],
        afterTargets: ['e3', 'e4', 'e5', 'e6', 'e7', 'e8'],
        accepted: ['e2e7'],
        softFailures: {},
        success: 'The rook moved straight up the file.',
      },
    ],
  },
  {
    id: 'rook-down-file',
    lesson: 'The Rook',
    title: 'Back Down',
    goal: 'Move the rook back down the same file.',
    board: {
      b1: { color: 'white', role: 'king' },
      e7: { color: 'white', role: 'rook' },
    },
    steps: [
      {
        teach: 'A rook can also move straight back through the fog when the file is clear.',
        challenge: 'Bring the rook to e2.',
        targets: ['e2'],
        afterTargets: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8'],
        accepted: ['e7e2'],
        softFailures: {},
        success: 'The rook moved back down the file.',
      },
    ],
  },
  {
    id: 'rook-across-rank',
    lesson: 'The Rook',
    title: 'Across The Rank',
    goal: 'Move the rook sideways to the marked square.',
    board: {
      b1: { color: 'white', role: 'king' },
      b4: { color: 'white', role: 'rook' },
    },
    steps: [
      {
        teach: 'Rooks move sideways too. Files go up and down; ranks go left and right.',
        challenge: 'Slide the rook to g4.',
        targets: ['g4'],
        afterTargets: ['a4', 'b4', 'c4', 'd4', 'e4', 'f4', 'g4', 'h4'],
        accepted: ['b4g4'],
        softFailures: {},
        success: 'The rook crossed the rank in one straight move.',
      },
    ],
  },
  {
    id: 'rook-stop-before-blocker',
    lesson: 'The Rook',
    title: 'Stop Before The Blocker',
    goal: 'Move as far as the rook can go before its path is blocked.',
    board: {
      b1: { color: 'white', role: 'king' },
      e2: { color: 'white', role: 'rook' },
      e5: { color: 'white', role: 'knight' },
    },
    steps: [
      {
        teach: 'Rooks cannot jump over pieces. Your knight blocks the file.',
        challenge: 'Move the rook to the last clear square before the knight.',
        targets: ['e4'],
        afterTargets: ['e3', 'e4', 'e5'],
        accepted: ['e2e4'],
        softFailures: {
          e2e3: 'That is legal, but the rook can move one square farther before the blocker.',
        },
        success: 'The rook stopped before the blocker.',
      },
    ],
  },
  {
    id: 'rook-turn-corner',
    lesson: 'The Rook',
    title: 'Turn The Corner',
    goal: 'Use two straight rook moves to turn a corner.',
    board: {
      b1: { color: 'white', role: 'king' },
      a2: { color: 'white', role: 'rook' },
    },
    steps: [
      {
        teach: 'A rook cannot bend during one move. First, move straight up.',
        challenge: 'Move the rook to a6.',
        targets: ['a6'],
        afterTargets: ['a6'],
        accepted: ['a2a6'],
        softFailures: {
          a2f2: 'That is a straight rook move, but this path turns upward first.',
        },
        success: 'Good. Now the rook is lined up for the sideways move.',
      },
      {
        teach: 'Now turn the corner with a second straight move.',
        challenge: 'Move the rook to f6.',
        targets: ['f6'],
        afterTargets: ['a6', 'b6', 'c6', 'd6', 'e6', 'f6', 'g6', 'h6'],
        accepted: ['a6f6'],
        softFailures: {},
        success: 'The rook reached the corner target with two straight moves.',
      },
    ],
  },
  {
    id: 'rook-trail',
    lesson: 'The Rook',
    title: 'Rook Trail',
    goal: 'Follow a short trail of straight rook moves.',
    board: {
      b1: { color: 'white', role: 'king' },
      c2: { color: 'white', role: 'rook' },
    },
    steps: [
      {
        teach: 'Now collect several marked squares. Each move is still one straight line.',
        challenge: 'Move to c6.',
        targets: ['c6'],
        afterTargets: ['c6'],
        accepted: ['c2c6'],
        softFailures: {},
        success: 'First marker reached.',
      },
      {
        teach: 'Keep following the trail.',
        challenge: 'Move to h6.',
        targets: ['h6'],
        afterTargets: ['h6'],
        accepted: ['c6h6'],
        softFailures: {},
        success: 'Second marker reached.',
      },
      {
        teach: 'The rook can move down the file too.',
        challenge: 'Move to h3.',
        targets: ['h3'],
        afterTargets: ['h3'],
        accepted: ['h6h3'],
        softFailures: {},
        success: 'Third marker reached.',
      },
      {
        teach: 'Finish with one more sideways move.',
        challenge: 'Move to d3.',
        targets: ['d3'],
        afterTargets: ['c3', 'd3', 'e3', 'f3', 'g3', 'h3'],
        accepted: ['h3d3'],
        softFailures: {},
        success: 'The rook followed the whole trail through the fog.',
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
  const boardPanel = document.createElement('section');
  boardPanel.className = 'learn-board-panel';
  const boardEl = document.createElement('div');
  boardEl.className = 'board learn-board';
  boardEl.setAttribute('aria-label', 'Fog of War tutorial board');
  boardPanel.append(boardEl);

  const panel = buildPanel(state, chapter);
  shell.replaceChildren(boardPanel, panel);
  state.boardEl = boardEl;
  state.api = createTutorialBoard(boardEl, view, chapter, state);
  updateBoard(state, chapter, view);
}

function buildPanel(state: TutorialState, chapter: TutorialChapter): HTMLElement {
  const step = currentStep(state, chapter);
  const panel = document.createElement('section');
  panel.className = 'learn-panel learn-tutorial-panel';

  const progress = document.createElement('div');
  progress.className = 'learn-progress';
  progress.textContent = `${chapter.lesson} ${state.chapterIndex + 1} of ${chapters.length}`;

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
  const api = Chessground(el, {
    animation: { enabled: true, duration: 160 },
    coordinates: true,
    coordinatesOnSquares: false,
    fen: boardFen(view.board),
    orientation: 'white',
    movable: {
      free: false,
      color: 'white',
      dests: legalDests(view),
    },
    draggable: { enabled: true },
    selectable: { enabled: true },
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
  const step = currentStep(state, chapter);
  if (state.status !== 'ready') return;

  const move = moveFromUci(uci);
  const legal = fogOfWarVariant.getLegalMoves(state.activeState, 'white')
    .some((candidate) => movesMatch(candidate, move));
  if (!legal) {
    state.message = 'That move is not legal from this position.';
    render(state);
    return;
  }

  const nextState = fogOfWarVariant.applyMove(state.activeState, move);
  state.activeState = {
    ...nextState,
    status: { type: 'playing', turn: 'white' },
    lastMove: move,
  };

  if (step.accepted.includes(uci)) {
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

function resetChapter(state: TutorialState): void {
  const chapter = chapters[state.chapterIndex]!;
  state.activeState = gameStateFromBoard(chapter.id, chapter.board);
  state.stepIndex = 0;
  state.status = 'ready';
  state.message = chapter.steps[0]!.teach;
  render(state);
}

function updateBoard(state: TutorialState, chapter: TutorialChapter, view: PlayerView): void {
  state.api?.set({
    fen: boardFen(view.board),
    movable: {
      color: state.status === 'ready' ? 'white' : undefined,
      dests: state.status === 'ready' ? legalDests(view) : new Map(),
    },
    highlight: { custom: tutorialSquareClasses(view, chapter, state), lastMove: false },
  });
}

function tutorialSquareClasses(
  view: PlayerView,
  chapter: TutorialChapter,
  state: TutorialState,
): cg.SquareClasses {
  const classes = hiddenSquareClasses(view);
  const step = currentStep(state, chapter);
  const activeTargets = state.status === 'success' ? step.afterTargets : step.targets;
  for (const square of activeTargets) {
    classes.set(square as cg.Key, `${classes.get(square as cg.Key) ?? ''} learn-highlight`.trim());
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

function legalDests(view: PlayerView): cg.Dests {
  const dests: cg.Dests = new Map();
  for (const move of view.legalMoves) {
    const list = dests.get(move.from as cg.Key) ?? [];
    list.push(move.to as cg.Key);
    dests.set(move.from as cg.Key, list);
  }
  return dests;
}

function gameStateFromBoard(id: string, board: Board): GameState {
  return {
    ...fogOfWarVariant.createInitialState(`learn-${id}`),
    board,
    status: { type: 'playing', turn: 'white' },
    castlingRights: [],
    halfmoveClock: 0,
    moveNumber: 1,
  };
}

function moveFromUci(uci: Uci): Move {
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
  };
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
  brandText.textContent = 'BICHESS';
  brand.append(brandLogo, brandText);

  const links = document.createElement('div');
  links.className = 'site-nav-links';

  if (SHOW_ENGINE_LAB_LINKS) {
    links.append(navLink('Engine Lab', '/engine-lab'));
  }
  links.append(navLink('Watch', '/watch'), navLink('Learn', '/learn'), navLink('About', '/about'));

  const gh = document.createElement('a');
  gh.href = GITHUB_URL;
  gh.target = '_blank';
  gh.rel = 'noreferrer noopener';
  gh.className = 'site-nav-link';
  gh.textContent = 'GitHub';
  links.append(gh);

  nav.append(brand, links);
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
  left.textContent = '© 2026 Bichess';

  const right = document.createElement('div');
  right.className = 'site-footer-right';

  const license = document.createElement('span');
  license.textContent = 'GPL-3.0';

  const sep = document.createElement('span');
  sep.className = 'site-footer-sep';
  sep.textContent = '·';

  const gh = document.createElement('a');
  gh.href = GITHUB_URL;
  gh.target = '_blank';
  gh.rel = 'noreferrer noopener';
  gh.textContent = 'GitHub';

  right.append(license, sep, gh);
  footer.append(left, right);
  return footer;
}
