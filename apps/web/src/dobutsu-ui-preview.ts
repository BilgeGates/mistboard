import './landing.css';
import './landing-play.css';
import './landing-announcements.css';
import './forum.css';

type IconId =
  | 'announcement-a'
  | 'announcement-b'
  | 'announcement-c'
  | 'challenge-friend-a'
  | 'challenge-friend-b'
  | 'create-topic-1a'
  | 'create-topic-2a'
  | 'create-topic-2c'
  | 'create-topic-3a'
  | 'create-topic-3c'
  | 'create-topic-3d'
  | 'find-opponent-b'
  | 'forum-topic-a'
  | 'play-engine-a'
  | 'store-a'
  | 'store-c'
  | 'support-a';

const ASSET_BASE = '/pixel-lab-assets/dobutsu-ui-tight';

type CurrentIconId =
  | 'announcement'
  | 'bell'
  | 'computer'
  | 'friend'
  | 'lobby'
  | 'pencil'
  | 'store'
  | 'support'
  | 'topic';

type CandidateStatus = 'keeper' | 'alternate' | 'maybe' | 'regen' | 'repurpose';

type CandidateSpec = {
  id: IconId;
  label: string;
  note?: string;
  status: CandidateStatus;
};

type AuditionSpec = {
  candidates: CandidateSpec[];
  current: CurrentIconId;
  note: string;
  surface: string;
  title: string;
};

const CURRENT_ICON_SVG: Record<CurrentIconId, string> = {
  announcement: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><text x="12" y="16" text-anchor="middle" font-size="16" font-weight="800" fill="currentColor">*</text></svg>`,
  bell: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 22a2.6 2.6 0 0 0 2.4-1.6H9.6A2.6 2.6 0 0 0 12 22Zm7-5-1.7-2V10a5.3 5.3 0 0 0-4.1-5.2V3a1.2 1.2 0 0 0-2.4 0v1.8A5.3 5.3 0 0 0 6.7 10v5L5 17v1.2h14V17Z"/></svg>`,
  computer: `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false"><path d="M6.5 6a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5h-3Z"/><path d="M5.5.5a.5.5 0 0 0-1 0V2A2.5 2.5 0 0 0 2 4.5H.5a.5.5 0 0 0 0 1H2v2H.5a.5.5 0 0 0 0 1H2v2H.5a.5.5 0 0 0 0 1H2A2.5 2.5 0 0 0 4.5 14v1.5a.5.5 0 0 0 1 0V14h2v1.5a.5.5 0 0 0 1 0V14h2v1.5a.5.5 0 0 0 1 0V14a2.5 2.5 0 0 0 2.5-2.5h1.5a.5.5 0 0 0 0-1H14v-2h1.5a.5.5 0 0 0 0-1H14v-2h1.5a.5.5 0 0 0 0-1H14A2.5 2.5 0 0 0 11.5 2V.5a.5.5 0 0 0-1 0V2h-2V.5a.5.5 0 0 0-1 0V2h-2V.5Zm-.5 3h6A1.5 1.5 0 0 1 12.5 5v6a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 11V5A1.5 1.5 0 0 1 5 3.5Z"/></svg>`,
  friend: `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false"><path d="M3 14s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1H3Z"/><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/></svg>`,
  lobby: `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false"><path d="M7 14s-1 0-1-1 1-4 5-4 5 3 5 4-1 1-1 1H7Z"/><path d="M11 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path fill-rule="evenodd" d="M5.22 14A2.24 2.24 0 0 1 5 13c0-1.36.68-2.75 1.94-3.72A6.33 6.33 0 0 0 5 9c-4 0-5 3-5 4s1 1 1 1h4.22Z" clip-rule="evenodd"/><path d="M4.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"/></svg>`,
  pencil: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" d="M4 16.5 L14.5 6 L18 9.5 L7.5 20 L4 20 Z M13 7.5 L16.5 11"/></svg>`,
  store: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M6 2h12l2 5H4l2-5Zm-3 6h18v2a3 3 0 0 1-3 3 3 3 0 0 1-3-1.5A3 3 0 0 1 12 13a3 3 0 0 1-3-1.5A3 3 0 0 1 6 13a3 3 0 0 1-3-3V8Zm2 6.9A5 5 0 0 0 6 15a5 5 0 0 0 2-.4V20h8v-5.4a5 5 0 0 0 2 .4 5 5 0 0 0 1-.1V21a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-6.1Z"/></svg>`,
  support: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 21s-7.4-4.6-10-9.3C.6 8.9 1.8 5.4 5 4.3c2-.7 4.1.1 5.3 1.8L12 8l1.7-1.9c1.2-1.7 3.3-2.5 5.3-1.8 3.2 1.1 4.4 4.6 3 7.4C19.4 16.4 12 21 12 21Z"/></svg>`,
  topic: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 5.5A3.5 3.5 0 0 1 7.5 2h9A3.5 3.5 0 0 1 20 5.5v6A3.5 3.5 0 0 1 16.5 15H11l-5.2 4.4A1.1 1.1 0 0 1 4 18.6V5.5Zm4 1.2a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2H8Zm0 4a1 1 0 1 0 0 2h5.5a1 1 0 1 0 0-2H8Z"/></svg>`,
};

const AUDITION_SPECS: AuditionSpec[] = [
  {
    title: 'Support',
    surface: 'Home card',
    current: 'support',
    note: 'Strong keeper. The heart animal reads immediately and carries the new tone.',
    candidates: [{ id: 'support-a', label: 'A', status: 'keeper' }],
  },
  {
    title: 'Store',
    surface: 'Home card',
    current: 'store',
    note: 'Store A is clearest for a shop. Store C is a useful bag-only alternate.',
    candidates: [
      { id: 'store-a', label: 'A', status: 'keeper' },
      { id: 'store-c', label: 'C', status: 'alternate', note: 'Bag direction' },
    ],
  },
  {
    title: 'Play the engine',
    surface: 'Game start',
    current: 'computer',
    note: 'Keeper. This is a direct upgrade over the chip glyph without losing meaning.',
    candidates: [{ id: 'play-engine-a', label: 'A', status: 'keeper' }],
  },
  {
    title: 'Challenge a friend',
    surface: 'Game start',
    current: 'friend',
    note: 'Both work. Keep both in the board until we choose one for production.',
    candidates: [
      { id: 'challenge-friend-a', label: 'A', status: 'keeper' },
      { id: 'challenge-friend-b', label: 'B', status: 'alternate' },
    ],
  },
  {
    title: 'Find opponent',
    surface: 'Game start',
    current: 'lobby',
    note: 'Keeper after scale adjustment. Group animal icons need larger rendering.',
    candidates: [{ id: 'find-opponent-b', label: 'B', status: 'keeper' }],
  },
  {
    title: 'Notification',
    surface: 'Nav bar',
    current: 'bell',
    note: 'Announcement C reads better as notification than timeline news.',
    candidates: [{ id: 'announcement-c', label: 'C', status: 'repurpose', note: 'Nav bell' }],
  },
  {
    title: 'Announcement',
    surface: 'Timeline marker',
    current: 'announcement',
    note: 'A and B still read as news/update marks. C is moved to notifications.',
    candidates: [
      { id: 'announcement-a', label: 'A', status: 'keeper' },
      { id: 'announcement-b', label: 'B', status: 'keeper' },
      { id: 'announcement-c', label: 'C', status: 'repurpose', note: 'Use in nav' },
    ],
  },
  {
    title: 'Forum topic',
    surface: 'Forum',
    current: 'topic',
    note: 'Likely keeper. Needs one pass inside a denser topic list before production.',
    candidates: [{ id: 'forum-topic-a', label: 'A', status: 'keeper' }],
  },
  {
    title: 'Create topic',
    surface: 'Forum',
    current: 'pencil',
    note: 'Use 1A for Create a new topic. Keep the others around as alternates for compose, reply, or post surfaces.',
    candidates: [
      { id: 'create-topic-1a', label: '1A', status: 'keeper' },
      { id: 'create-topic-2a', label: '2A', status: 'alternate' },
      { id: 'create-topic-2c', label: '2C', status: 'alternate' },
      { id: 'create-topic-3a', label: '3A', status: 'alternate' },
      { id: 'create-topic-3c', label: '3C', status: 'alternate' },
      { id: 'create-topic-3d', label: '3D', status: 'alternate' },
    ],
  },
];

function icon(id: IconId, className = 'dobutsu-preview-icon'): HTMLImageElement {
  const img = document.createElement('img');
  img.className = `${className} dobutsu-icon-${id}`;
  img.src = `${ASSET_BASE}/${id}.png`;
  img.alt = '';
  img.width = 96;
  img.height = 96;
  img.decoding = 'async';
  return img;
}

function currentIcon(id: CurrentIconId, className = 'dobutsu-current-icon'): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = `${className} dobutsu-current-icon-${id}`;
  span.innerHTML = CURRENT_ICON_SVG[id];
  return span;
}

function section(title: string, children: HTMLElement[]): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'dobutsu-preview-section';
  const heading = document.createElement('h2');
  heading.textContent = title;
  const body = document.createElement('div');
  body.className = 'dobutsu-preview-section-body';
  body.append(...children);
  wrap.append(heading, body);
  return wrap;
}

function supportCard(
  kind: 'support' | 'store',
  id: IconId,
  title: string,
  subtitle: string,
): HTMLElement {
  const el = document.createElement(kind === 'support' ? 'a' : 'span');
  el.className = `landing-support-card landing-support-card-${kind}`;
  if (kind === 'support') (el as HTMLAnchorElement).href = '#';
  else {
    el.classList.add('is-disabled');
    el.setAttribute('aria-disabled', 'true');
  }
  const iconWrap = document.createElement('span');
  iconWrap.className = 'landing-support-icon dobutsu-landing-support-icon';
  iconWrap.append(icon(id));
  const text = document.createElement('span');
  text.className = 'landing-support-text';
  const titleEl = document.createElement('span');
  titleEl.className = 'landing-support-title';
  titleEl.textContent = title;
  const sub = document.createElement('span');
  sub.className = 'landing-support-subtitle';
  sub.textContent = subtitle;
  text.append(titleEl, sub);
  el.append(iconWrap, text);
  return el;
}

function playAction(id: IconId, label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'landing-play-action';
  const iconWrap = document.createElement('span');
  iconWrap.className = 'landing-play-icon dobutsu-play-icon';
  iconWrap.setAttribute('aria-hidden', 'true');
  iconWrap.append(icon(id));
  const labelEl = document.createElement('span');
  labelEl.className = 'landing-play-action-label';
  labelEl.textContent = label;
  button.append(iconWrap, labelEl);
  return button;
}

function newsRow(id: IconId, date: string, body: string): HTMLElement {
  const row = document.createElement('article');
  row.className = 'landing-news-update dobutsu-news-update';
  const marker = document.createElement('span');
  marker.className = 'landing-news-marker dobutsu-news-marker';
  marker.setAttribute('aria-hidden', 'true');
  marker.append(icon(id));
  const content = document.createElement('div');
  content.className = 'landing-news-content';
  const time = document.createElement('time');
  time.className = 'landing-news-date';
  time.textContent = date;
  const copy = document.createElement('p');
  copy.className = 'landing-news-body';
  copy.textContent = body;
  content.append(time, copy);
  row.append(marker, content);
  return row;
}

function notificationNav(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'dobutsu-preview-nav';
  const brand = document.createElement('span');
  brand.className = 'site-nav-brand-name';
  brand.textContent = 'mistboard';
  const spacer = document.createElement('span');
  spacer.className = 'dobutsu-preview-nav-spacer';
  const bell = document.createElement('button');
  bell.className = 'notif-nav-trigger dobutsu-notif-trigger';
  bell.type = 'button';
  bell.setAttribute('aria-label', 'Notifications');
  bell.append(icon('announcement-c'));
  const badge = document.createElement('span');
  badge.className = 'notif-nav-badge';
  badge.textContent = '3';
  bell.append(badge);
  wrap.append(brand, spacer, bell);
  return wrap;
}

function forumAction(id: IconId, label: string): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'forum-panel-action forum-panel-action-create dobutsu-forum-action';
  button.append(icon(id), document.createTextNode(label));
  return button;
}

function iconGrid(ids: IconId[]): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'dobutsu-icon-grid';
  for (const id of ids) {
    const cell = document.createElement('figure');
    cell.append(icon(id));
    const cap = document.createElement('figcaption');
    cap.textContent = id;
    cell.append(cap);
    grid.append(cell);
  }
  return grid;
}

function statusLabel(status: CandidateStatus): string {
  switch (status) {
    case 'alternate':
      return 'Alternate';
    case 'keeper':
      return 'Keeper';
    case 'maybe':
      return 'Maybe';
    case 'regen':
      return 'Regen';
    case 'repurpose':
      return 'Repurpose';
  }
}

function visualSample(
  title: string,
  body: () => HTMLElement,
  opts: { note?: string; status?: CandidateStatus } = {},
): HTMLElement {
  const sample = document.createElement('article');
  sample.className = 'dobutsu-decision-sample';
  if (opts.status) sample.dataset.status = opts.status;

  const top = document.createElement('div');
  top.className = 'dobutsu-decision-sample-top';

  const real = document.createElement('span');
  real.className = 'dobutsu-decision-real';
  real.append(body());

  const inspect = document.createElement('span');
  inspect.className = 'dobutsu-decision-inspect';
  inspect.append(body());

  top.append(real, inspect);

  const meta = document.createElement('div');
  meta.className = 'dobutsu-decision-sample-meta';
  const label = document.createElement('span');
  label.className = 'dobutsu-decision-sample-title';
  label.textContent = title;
  meta.append(label);
  if (opts.status) {
    const chip = document.createElement('span');
    chip.className = 'dobutsu-decision-status';
    chip.dataset.status = opts.status;
    chip.textContent = statusLabel(opts.status);
    meta.append(chip);
  }
  if (opts.note) {
    const note = document.createElement('p');
    note.className = 'dobutsu-decision-sample-note';
    note.textContent = opts.note;
    sample.append(top, meta, note);
  } else {
    sample.append(top, meta);
  }
  return sample;
}

function decisionThemeStage(theme: 'light' | 'dark', spec: AuditionSpec): HTMLElement {
  const stage = document.createElement('div');
  stage.className = `dobutsu-decision-theme dobutsu-decision-theme-${theme}`;
  stage.dataset.previewTheme = theme;

  const heading = document.createElement('h4');
  heading.textContent = theme === 'light' ? 'Light' : 'Dark';

  const samples = document.createElement('div');
  samples.className = 'dobutsu-decision-samples';
  samples.append(visualSample('Current', () => currentIcon(spec.current)));
  for (const candidate of spec.candidates) {
    samples.append(
      visualSample(candidate.label, () => icon(candidate.id, 'dobutsu-decision-art'), {
        note: candidate.note,
        status: candidate.status,
      }),
    );
  }

  stage.append(heading, samples);
  return stage;
}

function decisionCard(spec: AuditionSpec): HTMLElement {
  const card = document.createElement('article');
  card.className = 'dobutsu-decision-card';

  const header = document.createElement('header');
  const titleWrap = document.createElement('div');
  const title = document.createElement('h3');
  title.textContent = spec.title;
  const surface = document.createElement('span');
  surface.className = 'dobutsu-decision-surface';
  surface.textContent = spec.surface;
  titleWrap.append(title, surface);

  const note = document.createElement('p');
  note.textContent = spec.note;
  header.append(titleWrap, note);

  const themes = document.createElement('div');
  themes.className = 'dobutsu-decision-themes';
  themes.append(decisionThemeStage('light', spec), decisionThemeStage('dark', spec));

  card.append(header, themes);
  return card;
}

function decisionBoard(): HTMLElement {
  const board = document.createElement('div');
  board.className = 'dobutsu-decision-board';
  for (const spec of AUDITION_SPECS) board.append(decisionCard(spec));
  return board;
}

function installStyles(): void {
  if (document.querySelector('#dobutsu-ui-preview-styles')) return;
  const style = document.createElement('style');
  style.id = 'dobutsu-ui-preview-styles';
  style.textContent = `
    .dobutsu-ui-preview {
      max-width: 1380px;
      margin: 0 auto;
      padding: 24px clamp(14px, 3vw, 36px) 56px;
      color: var(--site-text);
    }
    .dobutsu-ui-preview > header {
      display: grid;
      gap: 4px;
      margin-bottom: 22px;
    }
    .dobutsu-ui-preview h1 {
      margin: 0;
      color: var(--site-heading);
      font-size: 24px;
      line-height: 1.2;
    }
    .dobutsu-ui-preview p {
      margin: 0;
      color: var(--site-muted);
      line-height: 1.45;
    }
    .dobutsu-preview-section {
      display: grid;
      gap: 10px;
      margin-top: 24px;
    }
    .dobutsu-preview-section h2 {
      margin: 0;
      color: var(--site-heading);
      font-size: 15px;
      line-height: 1.2;
    }
    .dobutsu-preview-section-body {
      display: grid;
      gap: 12px;
    }
    .dobutsu-decision-board {
      display: grid;
      gap: 16px;
    }
    .dobutsu-decision-card {
      display: grid;
      gap: 14px;
      padding: 16px;
      border: 1px solid var(--site-border-soft);
      border-radius: var(--site-radius);
      background: var(--site-panel);
    }
    .dobutsu-decision-card > header {
      display: grid;
      grid-template-columns: minmax(0, auto) minmax(240px, 1fr);
      align-items: start;
      gap: 18px;
    }
    .dobutsu-decision-card h3,
    .dobutsu-decision-theme h4 {
      margin: 0;
      color: var(--site-heading);
      line-height: 1.2;
    }
    .dobutsu-decision-card h3 {
      font-size: 18px;
    }
    .dobutsu-decision-surface {
      display: block;
      margin-top: 4px;
      color: var(--site-muted);
      font-size: 12px;
      font-weight: 700;
      line-height: 1.2;
      text-transform: uppercase;
    }
    .dobutsu-decision-card > header p {
      max-width: 68ch;
      font-size: 14px;
    }
    .dobutsu-decision-themes {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .dobutsu-decision-theme {
      display: grid;
      gap: 10px;
      padding: 12px;
      border: 1px solid var(--dobutsu-theme-border);
      border-radius: var(--site-radius);
      background: var(--dobutsu-theme-bg);
      color: var(--dobutsu-theme-text);
    }
    .dobutsu-decision-theme-light {
      --dobutsu-theme-bg: hsl(40, 24%, 91%);
      --dobutsu-theme-card: #ffffff;
      --dobutsu-theme-border: rgba(29, 37, 34, 0.12);
      --dobutsu-theme-heading: hsl(35, 9%, 24%);
      --dobutsu-theme-muted: hsl(35, 5%, 45%);
      --dobutsu-theme-text: hsl(35, 7%, 30%);
      --dobutsu-theme-shadow: rgba(27, 31, 27, 0.12);
    }
    .dobutsu-decision-theme-dark {
      --dobutsu-theme-bg: hsl(40, 10%, 8%);
      --dobutsu-theme-card: hsl(40, 7%, 14%);
      --dobutsu-theme-border: rgba(255, 255, 255, 0.11);
      --dobutsu-theme-heading: hsl(40, 12%, 88%);
      --dobutsu-theme-muted: hsl(40, 6%, 62%);
      --dobutsu-theme-text: hsl(40, 10%, 78%);
      --dobutsu-theme-shadow: rgba(0, 0, 0, 0.38);
    }
    .dobutsu-decision-theme h4 {
      color: var(--dobutsu-theme-heading);
      font-size: 13px;
      text-transform: uppercase;
    }
    .dobutsu-decision-samples {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
      gap: 10px;
    }
    .dobutsu-decision-sample {
      display: grid;
      gap: 8px;
      min-width: 0;
      padding: 10px;
      border: 1px solid var(--dobutsu-theme-border);
      border-radius: 8px;
      background: var(--dobutsu-theme-card);
      color: var(--dobutsu-theme-text);
      box-shadow: 0 2px 8px var(--dobutsu-theme-shadow);
    }
    .dobutsu-decision-sample-top {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr);
      align-items: center;
      gap: 10px;
      min-height: 92px;
    }
    .dobutsu-decision-real,
    .dobutsu-decision-inspect {
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 0;
      overflow: visible;
    }
    .dobutsu-decision-real {
      width: 44px;
      height: 44px;
    }
    .dobutsu-decision-inspect {
      width: 92px;
      height: 92px;
      justify-self: center;
    }
    .dobutsu-current-icon,
    .dobutsu-decision-art {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .dobutsu-current-icon {
      color: var(--dobutsu-theme-muted);
    }
    .dobutsu-decision-art {
      transform: scale(1.12);
      transform-origin: center;
      filter: drop-shadow(0 3px 5px rgba(31, 24, 15, 0.16));
    }
    .dobutsu-decision-theme-dark .dobutsu-decision-art {
      filter:
        drop-shadow(0 1px 0 rgba(255, 255, 255, 0.18))
        drop-shadow(0 5px 12px rgba(0, 0, 0, 0.5));
    }
    .dobutsu-decision-sample-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    .dobutsu-decision-sample-title {
      min-width: 0;
      color: var(--dobutsu-theme-heading);
      font-size: 13px;
      font-weight: 800;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }
    .dobutsu-decision-status {
      flex: 0 0 auto;
      padding: 2px 6px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--site-muted) 15%, transparent);
      color: var(--dobutsu-theme-muted);
      font-size: 10px;
      font-weight: 800;
      line-height: 1.2;
      text-transform: uppercase;
    }
    .dobutsu-decision-status[data-status="keeper"] {
      background: color-mix(in srgb, #1f7a5d 22%, transparent);
      color: #38a77f;
    }
    .dobutsu-decision-status[data-status="alternate"],
    .dobutsu-decision-status[data-status="maybe"] {
      background: color-mix(in srgb, #d69b3a 24%, transparent);
      color: #d69b3a;
    }
    .dobutsu-decision-status[data-status="repurpose"] {
      background: color-mix(in srgb, #4f8edb 22%, transparent);
      color: #65a7f1;
    }
    .dobutsu-decision-status[data-status="regen"] {
      background: color-mix(in srgb, #c45b52 22%, transparent);
      color: #d97870;
    }
    .dobutsu-decision-sample-note {
      color: var(--dobutsu-theme-muted);
      font-size: 12px;
      line-height: 1.3;
    }
    .dobutsu-two-up {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
    }
    .dobutsu-play-stack {
      display: grid;
      max-width: 680px;
      gap: 14px;
    }
    .dobutsu-news-box {
      display: grid;
      max-width: 980px;
      gap: 0;
      padding: 20px 22px 20px 0;
      border: 1px solid var(--site-border-soft);
      border-radius: var(--site-radius);
      background: var(--site-panel);
    }
    .dobutsu-preview-icon {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
      transform: scale(1.08);
      transform-origin: center;
      filter: drop-shadow(0 3px 5px rgba(31, 24, 15, 0.18));
    }
    .dobutsu-ui-preview-route .landing-support-card {
      min-height: 154px;
      gap: 24px;
      padding: 28px 30px;
    }
    .dobutsu-ui-preview-route .landing-support-title {
      font-size: 24px;
      line-height: 1.15;
    }
    .dobutsu-ui-preview-route .landing-support-subtitle {
      font-size: 17px;
    }
    .dobutsu-landing-support-icon {
      box-sizing: border-box;
      width: 112px;
      height: 112px;
      color: inherit;
    }
    .dobutsu-ui-preview-route .landing-play-action {
      grid-template-columns: 112px minmax(0, 1fr);
      min-height: 118px;
      gap: 24px;
      padding: 18px 24px;
      font-size: 24px;
    }
    .dobutsu-play-icon {
      box-sizing: border-box;
      width: 104px;
      height: 104px;
      color: inherit;
      overflow: visible;
    }
    .dobutsu-play-icon .dobutsu-icon-challenge-friend-a,
    .dobutsu-play-icon .dobutsu-icon-challenge-friend-b,
    .dobutsu-play-icon .dobutsu-icon-find-opponent-b {
      transform: scale(1.36);
    }
    .dobutsu-news-marker {
      width: 78px;
      height: 78px;
      margin-top: -10px;
      margin-inline-start: calc(var(--landing-feed-rail-x) - 39px);
      border-width: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: color-mix(in srgb, var(--landing-feed-accent) 16%, var(--site-panel));
      color: inherit;
      box-shadow: 0 6px 14px rgba(33, 26, 17, 0.14);
    }
    .dobutsu-news-marker img {
      width: 66px;
      height: 66px;
    }
    .dobutsu-ui-preview-route .landing-news-feed {
      --landing-feed-content-x: 116px;
      --landing-feed-marker-half: 39px;
      --landing-feed-marker-size: 78px;
      --landing-feed-rail-x: 54px;
    }
    .dobutsu-ui-preview-route .landing-news-update {
      margin-top: 34px;
    }
    .dobutsu-ui-preview-route .landing-news-date {
      font-size: 20px;
    }
    .dobutsu-ui-preview-route .landing-news-body {
      font-size: 20px;
      line-height: 1.42;
    }
    .dobutsu-preview-nav {
      display: flex;
      align-items: center;
      gap: 18px;
      max-width: 980px;
      min-height: 86px;
      padding: 0 26px;
      border: 1px solid var(--site-nav-border);
      border-radius: var(--site-radius);
      background: var(--site-nav-bg);
    }
    .dobutsu-preview-nav-spacer {
      flex: 1;
    }
    .dobutsu-notif-trigger {
      position: relative;
      box-sizing: border-box;
      width: 66px;
      height: 66px;
      padding: 5px;
      border-radius: 18px;
      background: color-mix(in srgb, var(--site-panel-soft) 78%, transparent);
      box-shadow: 0 6px 14px rgba(33, 26, 17, 0.14);
    }
    .dobutsu-forum-row {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      align-items: center;
    }
    .dobutsu-forum-action {
      min-height: 58px;
      padding-block: 10px;
      font-size: 16px;
    }
    .dobutsu-forum-action img {
      box-sizing: border-box;
      width: 52px;
      height: 52px;
      margin-inline-end: 8px;
      filter: drop-shadow(0 3px 5px rgba(31, 24, 15, 0.18));
    }
    .dobutsu-icon-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(178px, 1fr));
      gap: 16px;
    }
    .dobutsu-icon-grid figure {
      display: grid;
      justify-items: center;
      gap: 10px;
      margin: 0;
      padding: 18px;
      border: 1px solid var(--site-border-soft);
      border-radius: var(--site-radius);
      background: var(--site-panel);
    }
    .dobutsu-icon-grid img {
      box-sizing: border-box;
      width: 154px;
      height: 154px;
      filter: drop-shadow(0 3px 5px rgba(31, 24, 15, 0.18));
    }
    .dobutsu-icon-grid figcaption {
      color: var(--site-muted);
      font-size: 11px;
      line-height: 1.2;
      text-align: center;
      overflow-wrap: anywhere;
    }
    :root[data-effective-theme="dark"] .dobutsu-preview-icon {
      filter:
        drop-shadow(0 1px 0 rgba(255, 255, 255, 0.22))
        drop-shadow(0 5px 12px rgba(0, 0, 0, 0.5));
    }
    :root[data-effective-theme="dark"] .dobutsu-news-marker,
    :root[data-effective-theme="dark"] .dobutsu-notif-trigger {
      background: color-mix(in srgb, var(--site-panel-soft) 82%, transparent);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.38);
    }
    @media (max-width: 720px) {
      .dobutsu-decision-card > header,
      .dobutsu-decision-themes {
        grid-template-columns: 1fr;
      }
      .dobutsu-two-up {
        grid-template-columns: 1fr;
      }
      .dobutsu-ui-preview-route .landing-support-card {
        min-height: 132px;
      }
      .dobutsu-ui-preview-route .landing-play-action {
        grid-template-columns: 86px minmax(0, 1fr);
        min-height: 98px;
        font-size: 20px;
      }
      .dobutsu-landing-support-icon,
      .dobutsu-play-icon {
        width: 86px;
        height: 86px;
      }
    }
  `;
  document.head.append(style);
}

export function mountDobutsuUiPreview(root: HTMLElement): void {
  installStyles();
  root.classList.add('landing-page', 'dobutsu-ui-preview-route');
  root.replaceChildren();

  const page = document.createElement('main');
  page.className = 'dobutsu-ui-preview';

  const header = document.createElement('header');
  const title = document.createElement('h1');
  title.textContent = 'Dobutsu UI icon preview';
  const intro = document.createElement('p');
  intro.textContent =
    'Generated PNG candidates rendered inside existing Mistboard UI shapes. Dev-only route.';
  header.append(title, intro);

  const supportRow = document.createElement('div');
  supportRow.className = 'dobutsu-two-up';
  supportRow.append(
    supportCard('support', 'support-a', 'Support', 'Keep Mistboard free'),
    supportCard('store', 'store-a', 'Store', 'Coming soon'),
    supportCard('store', 'store-c', 'Store', 'Bag direction'),
  );

  const playStack = document.createElement('div');
  playStack.className = 'dobutsu-play-stack';
  playStack.append(
    playAction('play-engine-a', 'Play the engine'),
    playAction('challenge-friend-a', 'Challenge a friend'),
    playAction('challenge-friend-b', 'Challenge a friend'),
    playAction('find-opponent-b', 'Find opponent'),
  );

  const news = document.createElement('div');
  news.className = 'dobutsu-news-box landing-news-feed';
  news.append(
    newsRow('announcement-a', '2 days ago', 'Xiangqi has launched. Study the rules.'),
    newsRow('announcement-b', '5 days ago', 'Fortress Animals has launched.'),
    newsRow('announcement-c', 'Notification', 'Bell direction for nav notifications.'),
  );

  const forum = document.createElement('div');
  forum.className = 'dobutsu-forum-row';
  forum.append(
    forumAction('forum-topic-a', 'Forum topic'),
    forumAction('create-topic-1a', 'Create a new topic'),
    forumAction('create-topic-2a', 'Create a new topic'),
    forumAction('create-topic-2c', 'Create a new topic'),
    forumAction('create-topic-3a', 'Create a new topic'),
    forumAction('create-topic-3c', 'Create a new topic'),
    forumAction('create-topic-3d', 'Create a new topic'),
  );

  page.append(
    header,
    section('Decision board', [decisionBoard()]),
    section('Home cards', [supportRow]),
    section('Play actions', [playStack]),
    section('News and notification', [news, notificationNav()]),
    section('Forum actions', [forum]),
    section('Raw icon scale', [
      iconGrid([
        'support-a',
        'store-a',
        'store-c',
        'play-engine-a',
        'challenge-friend-a',
        'challenge-friend-b',
        'find-opponent-b',
        'announcement-a',
        'announcement-b',
        'announcement-c',
        'forum-topic-a',
        'create-topic-1a',
        'create-topic-2a',
        'create-topic-2c',
        'create-topic-3a',
        'create-topic-3c',
        'create-topic-3d',
      ]),
    ]),
  );
  root.append(page);
}
