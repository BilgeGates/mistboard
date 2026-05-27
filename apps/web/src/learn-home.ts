import {
  chapters,
  type LearnModule,
  type LearnModuleGroup,
  learnModules,
  type TutorialChapter,
} from './learn-content.js';

type LearnHomeOptions = {
  onOpenModule: (moduleId: string) => void;
};

export function buildLearnHome(options: LearnHomeOptions): HTMLElement {
  const page = document.createElement('section');
  page.className = 'learn-home';
  page.setAttribute('aria-labelledby', 'learn-home-title');

  const intro = document.createElement('div');
  intro.className = 'learn-home-intro';

  const eyebrow = document.createElement('div');
  eyebrow.className = 'learn-progress';
  eyebrow.textContent = 'Learning modules';

  const title = document.createElement('h1');
  title.id = 'learn-home-title';
  title.className = 'learn-heading';
  title.textContent = 'Learn dark chess';

  const copy = document.createElement('p');
  copy.className = 'learn-copy';
  copy.textContent =
    'Short interactive modules for the parts of dark chess that normal chess does not teach: vision, hidden moves, king capture, and information mistakes.';

  intro.append(eyebrow, title, copy);

  const grid = document.createElement('div');
  grid.className = 'learn-module-grid';
  for (const group of moduleGroups()) {
    grid.append(buildLearnModuleSection(group, options));
  }

  page.append(intro, grid);
  return page;
}

function buildLearnModuleSection(group: LearnModuleGroup, options: LearnHomeOptions): HTMLElement {
  const section = document.createElement('section');
  section.className = 'learn-module-section';

  const header = document.createElement('div');
  header.className = 'learn-module-section-header';

  const title = document.createElement('h2');
  title.textContent = group;

  const count = document.createElement('span');
  const modules = modulesForGroup(group);
  count.textContent = `${modules.length} ${modules.length === 1 ? 'module' : 'modules'}`;

  header.append(title, count);

  const list = document.createElement('div');
  list.className = 'learn-module-section-list';
  for (const module of modules) {
    list.append(buildLearnModuleCard(module, options));
  }

  section.append(header, list);
  return section;
}

function buildLearnModuleCard(module: LearnModule, options: LearnHomeOptions): HTMLElement {
  const card = document.createElement('article');
  card.className = `learn-module-card is-${module.status}`;

  const number = document.createElement('div');
  number.className = 'learn-module-number';
  number.textContent = moduleNumberLabel(module);

  const body = document.createElement('div');
  body.className = 'learn-module-body';

  const top = document.createElement('div');
  top.className = 'learn-module-top';

  const eyebrow = document.createElement('span');
  eyebrow.className = 'learn-module-eyebrow';
  eyebrow.textContent = moduleEyebrow(module);

  const meta = document.createElement('span');
  meta.className = 'learn-module-meta';
  meta.textContent = `${moduleChapterCount(module)} chapters · ${moduleStatusLabel(module)}`;

  top.append(eyebrow, meta);

  const title = document.createElement('h2');
  title.textContent = module.title;

  const copy = document.createElement('p');
  copy.textContent = module.summary;

  const action = document.createElement('button');
  action.type = 'button';
  action.className =
    module.status === 'available' ? 'landing-cta-primary' : 'landing-cta-secondary';
  action.textContent = module.status === 'planned' ? 'Open preview' : module.cta;
  action.addEventListener('click', () => options.onOpenModule(module.id));

  body.append(top, title, copy, action);
  card.append(number, body);
  return card;
}

function modulesForGroup(group: LearnModuleGroup): LearnModule[] {
  return learnModules.filter((module) => module.group === group);
}

function moduleGroups(): LearnModuleGroup[] {
  const groups: LearnModuleGroup[] = [];
  for (const module of learnModules) {
    if (!groups.includes(module.group)) groups.push(module.group);
  }
  return groups;
}

function moduleNumberLabel(module: LearnModule): string {
  return String(learnModules.indexOf(module) + 1).padStart(2, '0');
}

export function moduleEyebrow(module: LearnModule): string {
  return `Module ${learnModules.indexOf(module) + 1}`;
}

export function moduleStatusLabel(module: LearnModule): string {
  if (module.status === 'available') return 'Playable';
  if (module.status === 'wip') return 'WIP';
  return 'Planned';
}

export function moduleChapterTitles(module: LearnModule): string[] {
  if (module.chapterIds) {
    return module.chapterIds
      .map((chapterId) => chapterById(chapterId)?.title)
      .filter((title): title is string => Boolean(title));
  }
  return module.outlineChapters ?? [];
}

export function moduleChapterCount(module: LearnModule): number {
  return moduleChapterTitles(module).length;
}

function chapterById(id: string): TutorialChapter | null {
  return chapters.find((chapter) => chapter.id === id) ?? null;
}
