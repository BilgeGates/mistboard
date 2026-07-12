// Study browse page (/study): the signed-in user's own studies. New studies are
// created from the analysis board ("Save as study"), so this is a list + entry
// point, not a creator. S3 of the study track. A public "top studies" surface +
// homepage widget is a later follow-on (needs a public-studies query).

import './game-shell.css';
import './study.css';
import './study-index.css';
import { buildNav } from './site-shell.js';

// A fresh study starts with one blank chapter at the standard start position.
const EMPTY_TREE = { version: 1, root: { children: [] } };

type StudySummary = {
  id: string;
  name: string;
  description: string;
  visibility: 'private' | 'unlisted' | 'public';
  chapterCount: number;
  updatedAt: string;
};

export function mountStudyIndex(root: HTMLElement): void {
  root.classList.add('landing-page');
  root.replaceChildren(buildNav(), notice('Loading your studies'));
  void fetch('/api/studies/mine', { headers: { accept: 'application/json' } })
    .then(async (response) => {
      if (response.status === 401) {
        renderMessage(
          root,
          'Sign in to see your studies',
          'Your studies are private to your account.',
        );
        return;
      }
      if (!response.ok) {
        renderMessage(root, 'Studies unavailable', 'Your studies could not be loaded.');
        return;
      }
      const body = (await response.json()) as { studies: StudySummary[] };
      renderList(root, body.studies);
    })
    .catch(() => renderMessage(root, 'Studies unavailable', 'Your studies could not be loaded.'));
}

function renderList(root: HTMLElement, studies: StudySummary[]): void {
  const main = document.createElement('main');
  main.className = 'study-index';

  const header = document.createElement('header');
  header.className = 'study-index__header';
  const title = document.createElement('h1');
  title.textContent = 'My studies';
  header.append(title, newStudyForm());
  main.append(header);

  if (studies.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'study-index__empty';
    empty.textContent =
      'No studies yet. Open the analysis board, then use “Save as study” to create one.';
    main.append(empty);
  } else {
    const list = document.createElement('ul');
    list.className = 'study-index__list';
    for (const study of studies) list.append(studyCard(study));
    main.append(list);
  }

  root.replaceChildren(buildNav(), main);
}

// Name a study and create it blank, then open it. New studies are also creatable
// from the analysis board ("Save as study" on a position); this is the from-scratch
// path.
function newStudyForm(): HTMLElement {
  const form = document.createElement('form');
  form.className = 'study-index__new';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'study-index__new-name';
  input.placeholder = 'New study name';
  input.maxLength = 100;
  input.setAttribute('aria-label', 'New study name');
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'study-index__create';
  submit.textContent = 'Create';
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit.disabled = true;
    submit.textContent = 'Creating…';
    void createStudy(input.value.trim() || 'Untitled study').catch(() => {
      submit.disabled = false;
      submit.textContent = 'Sign in to create';
    });
  });
  form.append(input, submit);
  return form;
}

async function createStudy(name: string): Promise<void> {
  const response = await fetch('/api/studies', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name,
      chapter: { name: 'Chapter 1', variant: 'xiangqi', root: EMPTY_TREE },
    }),
  });
  if (!response.ok) throw new Error(`create failed: ${response.status}`);
  const body = (await response.json()) as { study: { id: string } };
  window.location.href = `/study/${body.study.id}`;
}

function studyCard(study: StudySummary): HTMLElement {
  const item = document.createElement('li');
  const link = document.createElement('a');
  link.className = 'study-index__card';
  link.href = `/study/${study.id}`;

  const name = document.createElement('span');
  name.className = 'study-index__name';
  name.textContent = study.name;

  const meta = document.createElement('span');
  meta.className = 'study-index__meta';
  const chapters = `${study.chapterCount} ${study.chapterCount === 1 ? 'chapter' : 'chapters'}`;
  meta.textContent = `${chapters} · ${study.visibility} · ${timeAgo(study.updatedAt)}`;

  link.append(name, meta);
  item.append(link);
  return item;
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function notice(text: string): HTMLElement {
  const shell = document.createElement('main');
  shell.className = 'dxq-postgame__notice';
  const heading = document.createElement('h1');
  heading.textContent = text;
  shell.append(heading);
  return shell;
}

function renderMessage(root: HTMLElement, titleText: string, bodyText: string): void {
  const shell = document.createElement('main');
  shell.className = 'dxq-postgame__error';
  const title = document.createElement('h1');
  title.textContent = titleText;
  const body = document.createElement('p');
  body.textContent = bodyText;
  shell.append(title, body);
  root.replaceChildren(buildNav(), shell);
}
