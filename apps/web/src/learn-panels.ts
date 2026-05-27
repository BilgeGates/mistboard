import type { Board, Square } from '@mistboard/game';
import type { ChapterStatus, LearnModule, TutorialChapter, TutorialStep } from './learn-content.js';
import {
  moduleChapterCount,
  moduleChapterTitles,
  moduleEyebrow,
  moduleStatusLabel,
} from './learn-home.js';

type LearnPanelState = {
  busy: boolean;
  chapterIndex: number;
  demoIndex: number;
  message: string;
  playDone: boolean;
  status: ChapterStatus;
  stepIndex: number;
  superpositionCandidates: Square[];
  superpositionFlushed: Square[];
  whiteMoves: number;
};

export type LearnPanelActions = {
  advanceDemo: () => void;
  chapterProgress: (chapterIndex: number) => string;
  goNextChapter: () => void;
  goToChapter: (chapterIndex: number) => void;
  nextChapterLabel: (chapterIndex: number) => string;
  resetChapter: () => void;
  showLearnHome: () => void;
  supportPieceLabel: (board: Board) => string;
  triggerReveal: () => void;
};

type LearnMenuChapter = {
  chapter: TutorialChapter;
  chapterIndex: number;
  localIndex: number;
};

export function buildPlannedModuleMenu(
  module: LearnModule,
  actions: LearnPanelActions,
): HTMLElement {
  const menu = document.createElement('aside');
  menu.className = 'learn-menu';
  menu.setAttribute('aria-label', 'Module outline');

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'learn-menu-back';
  back.textContent = 'All modules';
  back.addEventListener('click', actions.showLearnHome);

  const header = document.createElement('header');
  header.className = 'learn-menu-header';

  const eyebrow = document.createElement('div');
  eyebrow.className = 'learn-menu-eyebrow';
  eyebrow.textContent = moduleEyebrow(module);

  const title = document.createElement('h2');
  title.textContent = module.title;

  const meta = document.createElement('p');
  meta.textContent = `${moduleChapterCount(module)} planned chapters`;

  header.append(eyebrow, title, meta);

  const chaptersList = document.createElement('ol');
  chaptersList.className = 'learn-menu-chapters';
  const chapterTitles = moduleChapterTitles(module);
  for (let localIndex = 0; localIndex < chapterTitles.length; localIndex += 1) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `learn-menu-chapter${localIndex === 0 ? ' is-current' : ''}`;
    button.disabled = true;

    const index = document.createElement('span');
    index.className = 'learn-menu-chapter-index';
    index.textContent = String(localIndex + 1);

    const text = document.createElement('span');
    text.className = 'learn-menu-chapter-text';

    const chapterTitle = document.createElement('span');
    chapterTitle.className = 'learn-menu-chapter-title';
    chapterTitle.textContent = chapterTitles[localIndex]!;

    const subtitle = document.createElement('span');
    subtitle.className = 'learn-menu-chapter-subtitle';
    subtitle.textContent = 'Planned';

    text.append(chapterTitle, subtitle);
    button.append(index, text);
    item.append(button);
    chaptersList.append(item);
  }

  menu.append(back, header, chaptersList);
  return menu;
}

export function buildPlannedModulePanel(module: LearnModule): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'learn-panel learn-tutorial-panel';

  const eyebrow = document.createElement('div');
  eyebrow.className = 'learn-progress';
  eyebrow.textContent = `${moduleEyebrow(module)} · ${moduleStatusLabel(module)}`;

  const title = document.createElement('h1');
  title.className = 'learn-heading';
  title.textContent = module.title;

  const chapterTitle = document.createElement('h2');
  chapterTitle.className = 'learn-chapter-title';
  chapterTitle.textContent = 'Planned module';

  const copy = document.createElement('p');
  copy.className = 'learn-copy';
  copy.textContent = module.summary;

  const source = document.createElement('p');
  source.className = 'learn-module-source';
  source.textContent = module.source;

  const prompt = document.createElement('div');
  prompt.className = 'learn-tutorial-message ready';
  prompt.textContent =
    'This parked module opens in the lesson board shell now. The board is a static preview until the authored interaction lands.';

  const actionRow = document.createElement('div');
  actionRow.className = 'learn-actions';
  const hint = document.createElement('p');
  hint.className = 'learn-hint';
  hint.textContent = 'The chapter outline is in the left rail.';
  actionRow.append(hint);

  panel.append(eyebrow, title, chapterTitle, copy, source, prompt, actionRow);
  return panel;
}

export function buildLearnMenu(
  state: LearnPanelState,
  module: LearnModule,
  chapters: LearnMenuChapter[],
  actions: LearnPanelActions,
): HTMLElement {
  const menu = document.createElement('aside');
  menu.className = 'learn-menu';
  menu.setAttribute('aria-label', 'Learn menu');

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'learn-menu-back';
  back.textContent = 'All modules';
  back.addEventListener('click', actions.showLearnHome);

  const header = document.createElement('header');
  header.className = 'learn-menu-header';

  const eyebrow = document.createElement('div');
  eyebrow.className = 'learn-menu-eyebrow';
  eyebrow.textContent = moduleEyebrow(module);

  const title = document.createElement('h2');
  title.textContent = module.title;

  const meta = document.createElement('p');
  meta.textContent = `${moduleChapterCount(module)} chapters`;

  header.append(eyebrow, title, meta);

  const chaptersList = document.createElement('ol');
  chaptersList.className = 'learn-menu-chapters';
  for (const entry of chapters) {
    chaptersList.append(buildMenuChapterButton(state, module, entry, actions));
  }

  menu.append(back, header, chaptersList);
  return menu;
}

export function buildPanel(
  state: LearnPanelState,
  chapter: TutorialChapter,
  step: TutorialStep,
  actions: LearnPanelActions,
): HTMLElement {
  if (chapter.mode) return buildEndgamePanel(state, chapter, actions);
  const panel = document.createElement('section');
  panel.className = 'learn-panel learn-tutorial-panel';

  const progress = document.createElement('div');
  progress.className = 'learn-progress';
  progress.textContent = actions.chapterProgress(state.chapterIndex);

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

  const actionRow = document.createElement('div');
  actionRow.className = 'learn-actions';

  if (state.status === 'success') {
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'landing-cta-primary';
    next.textContent = actions.nextChapterLabel(state.chapterIndex);
    next.addEventListener('click', actions.goNextChapter);
    actionRow.append(next);
  } else if (chapter.interaction === 'reveal') {
    const reveal = document.createElement('button');
    reveal.type = 'button';
    reveal.className = 'landing-cta-primary';
    reveal.textContent = 'Reveal what happened';
    reveal.addEventListener('click', actions.triggerReveal);
    actionRow.append(reveal);
  } else if (state.status === 'soft-failure') {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'landing-cta-primary';
    retry.textContent = 'Try again';
    retry.addEventListener('click', actions.resetChapter);
    actionRow.append(retry);
  } else {
    const hint = document.createElement('p');
    hint.className = 'learn-hint';
    hint.textContent = step.challenge;
    actionRow.append(hint);
  }

  panel.append(progress, heading, chapterTitle, goal, prompt, targetList, actionRow);
  return panel;
}

function buildMenuChapterButton(
  state: LearnPanelState,
  module: LearnModule,
  entry: LearnMenuChapter,
  actions: LearnPanelActions,
): HTMLElement {
  const item = document.createElement('li');
  const { chapter, chapterIndex, localIndex } = entry;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = `learn-menu-chapter${chapterIndex === state.chapterIndex ? ' is-current' : ''}`;
  if (chapterIndex === state.chapterIndex) button.setAttribute('aria-current', 'step');

  const index = document.createElement('span');
  index.className = 'learn-menu-chapter-index';
  index.textContent = String(localIndex + 1);

  const text = document.createElement('span');
  text.className = 'learn-menu-chapter-text';

  const title = document.createElement('span');
  title.className = 'learn-menu-chapter-title';
  title.textContent = chapter.title;

  const subtitle = document.createElement('span');
  subtitle.className = 'learn-menu-chapter-subtitle';
  subtitle.textContent = chapter.lesson === module.title ? chapter.goal : chapter.lesson;

  text.append(title, subtitle);
  button.append(index, text);
  button.addEventListener('click', () => actions.goToChapter(chapterIndex));
  item.append(button);
  return item;
}

function buildEndgamePanel(
  state: LearnPanelState,
  chapter: TutorialChapter,
  actions: LearnPanelActions,
): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'learn-panel learn-tutorial-panel';

  const progress = document.createElement('div');
  progress.className = 'learn-progress';
  progress.textContent = actions.chapterProgress(state.chapterIndex);

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

  const actionRow = document.createElement('div');
  actionRow.className = 'learn-actions';

  const moves = chapter.demoMoves ?? [];
  if (chapter.mode === 'practice') {
    const hint = document.createElement('p');
    hint.className = 'learn-hint';
    hint.textContent = `Move the White king or ${actions.supportPieceLabel(chapter.board)}. Black has no pieces and makes no reply.`;
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'landing-cta-primary';
    next.textContent = chapter.nextLabel ?? 'Next';
    next.addEventListener('click', actions.goNextChapter);
    actionRow.append(hint, next);
  } else if (chapter.mode === 'play' && !state.playDone) {
    const hint = document.createElement('p');
    hint.className = 'learn-hint';
    const cap = chapter.playMoveCap ?? 12;
    const prefix = state.busy ? 'Black is moving.' : (chapter.playMoveHint ?? 'Move your king.');
    hint.textContent = `${prefix} ${state.whiteMoves} of ${cap} moves used.`;
    actionRow.append(hint);
  } else if (chapter.mode === 'superposition' && !state.playDone) {
    const hint = document.createElement('p');
    hint.className = 'learn-hint';
    const flushed =
      state.superpositionFlushed.length > 0
        ? ` ${state.superpositionFlushed.length} connected squares revealed last move.`
        : '';
    hint.textContent = `Move the White king or queen. ${state.superpositionCandidates.length} candidates remain.${flushed}`;

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'landing-cta-secondary';
    reset.textContent = 'Reset';
    reset.addEventListener('click', actions.resetChapter);
    actionRow.append(hint, reset);
  } else if (chapter.mode === 'demo' && state.demoIndex <= moves.length) {
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'landing-cta-primary';
    next.textContent = state.demoIndex === 0 ? 'Begin' : 'Next';
    next.addEventListener('click', actions.advanceDemo);
    actionRow.append(next);
  } else {
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'landing-cta-primary';
    next.textContent = chapter.nextLabel ?? 'Next';
    next.addEventListener('click', actions.goNextChapter);
    actionRow.append(next);
  }

  panel.append(progress, heading, chapterTitle, goal, prompt, actionRow);
  return panel;
}
