// Study viewer/editor (/study/:id). Fetches a persisted study, rebuilds its chapter
// tree from the serialized blob, and mounts the shared xiangqi review surface with
// annotation editing. For the owner, tree edits autosave (debounced) through the
// version-guarded chapter PATCH; a stale save surfaces a conflict rather than
// clobbering. Non-owners get a read/explore view (their edits stay local).
// S2 of the study track; single chapter for now (S3 adds chapter tabs).

import './game-shell.css';
import './live-xiangqi.css';
import './xiangqi-postgame.css';
import './study.css';
import type { SerializedTree } from './review/tree-serialize.js';
import { mountXiangqiReview, type XiangqiReviewHandle } from './review/xiangqi-review.js';
import { buildNav } from './site-shell.js';

type StudyVisibility = 'private' | 'unlisted' | 'public';

type StudyDto = {
  id: string;
  name: string;
  description: string;
  visibility: StudyVisibility;
  isOwner: boolean;
};

type ChapterDto = {
  id: string;
  name: string;
  variant: string;
  orientation: string;
  root: SerializedTree;
  version: number;
};

type LoadResult =
  | { ok: true; study: StudyDto; chapters: ChapterDto[] }
  | { ok: false; status: number };

export function mountStudy(root: HTMLElement, studyId: string): void {
  root.classList.add('landing-page', 'xiangqi-postgame-route');
  root.replaceChildren(buildNav(), notice('Loading study'));
  void loadStudy(studyId)
    .then((result) => {
      if (result.ok) renderStudy(root, result.study, result.chapters);
      else renderError(root, result.status);
    })
    .catch(() => renderError(root, 0));
}

async function loadStudy(studyId: string): Promise<LoadResult> {
  const response = await fetch(`/api/studies/${encodeURIComponent(studyId)}`, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) return { ok: false, status: response.status };
  const body = (await response.json()) as { study: StudyDto; chapters: ChapterDto[] };
  return { ok: true, study: body.study, chapters: body.chapters };
}

function renderStudy(root: HTMLElement, study: StudyDto, chapters: ChapterDto[]): void {
  const chapter = chapters[0];
  if (!chapter || chapter.variant !== 'xiangqi') {
    renderError(root, 415);
    return;
  }
  root.replaceChildren(buildNav());

  let version = chapter.version;
  let handle: XiangqiReviewHandle | null = null;
  const status = document.createElement('span');
  status.className = 'study-actions__status';

  const save = debounce(() => {
    if (!handle) return;
    status.textContent = 'Saving…';
    status.dataset.state = 'saving';
    const tree = handle.serialize();
    void fetch(`/api/studies/${study.id}/chapters/${chapter.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ root: tree, baseVersion: version }),
    })
      .then(async (response) => {
        if (response.ok) {
          const body = (await response.json()) as { chapter: { version: number } };
          version = body.chapter.version;
          setStatus(status, 'saved', 'Saved');
          return;
        }
        if (response.status === 409) {
          setStatus(status, 'conflict', 'Edited in another tab — reload to continue');
          return;
        }
        setStatus(status, 'error', 'Save failed');
      })
      .catch(() => setStatus(status, 'error', 'Save failed'));
  }, 700);

  handle = mountXiangqiReview(root, {
    pageClassName: 'xiangqi-review',
    ariaLabel: 'Study',
    eyebrow: study.isOwner ? 'Your study' : 'Study',
    title: study.name,
    summary:
      study.description || (study.isOwner ? 'Draw, comment, and branch — edits autosave.' : ''),
    boardAriaLabel: 'Xiangqi board',
    actions: buildActions(study, status),
    initialTree: chapter.root,
    onChange: study.isOwner
      ? () => {
          status.textContent = 'Editing…';
          status.dataset.state = 'dirty';
          save();
        }
      : undefined,
    moves: [],
    analysis: null,
  });
}

function buildActions(study: StudyDto, status: HTMLElement): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'study-actions';

  if (study.isOwner) {
    const visibility = document.createElement('div');
    visibility.className = 'study-actions__visibility';
    let current = study.visibility;
    const options: StudyVisibility[] = ['private', 'unlisted', 'public'];
    const buttons = new Map<StudyVisibility, HTMLButtonElement>();
    const paint = (): void => {
      for (const [value, button] of buttons) {
        button.classList.toggle('study-actions__vis--active', value === current);
      }
    };
    for (const value of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'study-actions__vis';
      button.textContent = value;
      button.addEventListener('click', () => {
        const previous = current;
        current = value;
        paint();
        void fetch(`/api/studies/${study.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ visibility: value }),
        }).then((response) => {
          if (!response.ok) {
            current = previous;
            paint();
          }
        });
      });
      buttons.set(value, button);
      visibility.append(button);
    }
    paint();
    wrap.append(labelled('Visibility', visibility));
    wrap.append(status);
  }

  wrap.append(copyLinkButton());
  return wrap;
}

function copyLinkButton(): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'study-actions__copy';
  button.textContent = 'Copy link';
  button.addEventListener('click', () => {
    void navigator.clipboard?.writeText(window.location.href).then(
      () => {
        button.textContent = 'Copied';
        window.setTimeout(() => {
          button.textContent = 'Copy link';
        }, 1500);
      },
      () => {},
    );
  });
  return button;
}

function labelled(label: string, control: HTMLElement): HTMLElement {
  const row = document.createElement('div');
  row.className = 'study-actions__row';
  const span = document.createElement('span');
  span.className = 'study-actions__label';
  span.textContent = label;
  row.append(span, control);
  return row;
}

function setStatus(el: HTMLElement, state: string, text: string): void {
  el.dataset.state = state;
  el.textContent = text;
}

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

function notice(text: string): HTMLElement {
  const shell = document.createElement('main');
  shell.className = 'dxq-postgame__notice';
  const heading = document.createElement('h1');
  heading.textContent = text;
  shell.append(heading);
  return shell;
}

function renderError(root: HTMLElement, status: number): void {
  const shell = document.createElement('main');
  shell.className = 'dxq-postgame__error';
  const title = document.createElement('h1');
  title.textContent = status === 404 ? 'Study not found' : 'Study unavailable';
  const body = document.createElement('p');
  body.textContent =
    status === 404
      ? 'This study is private or does not exist.'
      : status === 415
        ? 'This study uses a variant that is not supported yet.'
        : 'The study could not be loaded.';
  shell.append(title, body);
  root.replaceChildren(buildNav(), shell);
}
