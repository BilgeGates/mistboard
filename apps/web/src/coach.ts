// /coach: the public coach directory (lichess.org/coach equivalent), plus the
// /coach/:handle detail view rendered by the same module. Every listed coach
// is a verified titled player: the server only returns published rows whose
// user currently holds a title, so this page never re-checks eligibility.
// The editor lives at /coach/edit (coach-edit.ts).

import './coach.css';
import { t } from './i18n/catalog.js';
import { currentLocale, type Locale } from './i18n/locale.js';
import { buildTitleBadge } from './player-titles.js';
import { buildNav, buildNotice } from './site-shell.js';

export type CoachListing = {
  handle: string;
  displayName: string;
  title: string;
  headline: string;
  languages: string;
  rate: string;
  acceptingStudents: boolean;
};

export type CoachDetail = CoachListing & {
  about: string;
  contact: string;
};

export async function mountCoach(root: HTMLElement, handle: string | null): Promise<void> {
  const locale = currentLocale();
  root.replaceChildren();
  root.classList.add('landing-page', 'coach-route');

  const shell = document.createElement('main');
  shell.className = 'site-section coach-shell';
  root.append(buildNav(locale), shell);

  if (handle) {
    await renderDetail(shell, handle, locale);
    return;
  }
  await renderDirectory(shell, locale);
}

// ── directory ────────────────────────────────────────────────────────────────
async function renderDirectory(shell: HTMLElement, locale: Locale): Promise<void> {
  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = t('coach.heading', {}, locale);

  const intro = document.createElement('p');
  intro.className = 'coach-intro';
  intro.textContent = t('coach.intro', {}, locale);

  shell.append(heading, intro);

  let coaches: CoachListing[];
  try {
    const resp = await fetch('/api/coaches');
    if (!resp.ok) throw new Error(`coaches failed: ${resp.status}`);
    const data = (await resp.json()) as { coaches?: CoachListing[] };
    coaches = Array.isArray(data.coaches) ? data.coaches : [];
  } catch {
    const failed = document.createElement('p');
    failed.className = 'coach-status';
    failed.textContent = t('coach.loadFailed', {}, locale);
    shell.append(failed);
    return;
  }

  if (coaches.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'coach-empty';
    empty.textContent = t('coach.empty', {}, locale);
    shell.append(empty);
  } else {
    const grid = document.createElement('ul');
    grid.className = 'coach-grid';
    for (const coach of coaches) {
      const item = document.createElement('li');
      item.append(buildCoachCard(coach, locale));
      grid.append(item);
    }
    shell.append(grid);
  }

  // "Become a coach" affordance for signed-in titled users. Fail-soft: any
  // fetch problem (including 401 for anonymous visitors) just hides it.
  void hydrateBecomeCoach(intro, locale);
}

function buildCoachCard(coach: CoachListing, locale: Locale): HTMLElement {
  const card = document.createElement('a');
  card.className = 'coach-card';
  card.href = `/coach/${encodeURIComponent(coach.handle)}`;

  const name = document.createElement('p');
  name.className = 'coach-card-name';
  const badge = buildTitleBadge(coach.title, locale);
  if (badge) name.append(badge);
  const displayName = document.createElement('span');
  displayName.textContent = coach.displayName;
  name.append(displayName);

  const headline = document.createElement('p');
  headline.className = 'coach-card-headline';
  headline.textContent = coach.headline;

  const meta = document.createElement('p');
  meta.className = 'coach-card-meta';
  if (coach.languages) {
    const languages = document.createElement('span');
    languages.textContent = `${t('coach.languagesLabel', {}, locale)}: ${coach.languages}`;
    meta.append(languages);
  }
  if (coach.rate) {
    const rate = document.createElement('span');
    rate.textContent = `${t('coach.rateLabel', {}, locale)}: ${coach.rate}`;
    meta.append(rate);
  }

  card.append(name, headline, meta, buildAcceptingPill(coach.acceptingStudents, locale));
  return card;
}

function buildAcceptingPill(accepting: boolean, locale: Locale): HTMLElement {
  const pill = document.createElement('span');
  pill.className = accepting ? 'coach-accepting' : 'coach-accepting coach-accepting-closed';
  pill.textContent = t(accepting ? 'coach.accepting' : 'coach.notAccepting', {}, locale);
  return pill;
}

async function hydrateBecomeCoach(intro: HTMLElement, locale: Locale): Promise<void> {
  try {
    const resp = await fetch('/api/coaches/me');
    if (!resp.ok) return;
    const me = (await resp.json()) as {
      titled?: boolean;
      profile?: { published?: boolean } | null;
    };
    if (me.titled !== true) return;
    const become = document.createElement('p');
    become.className = 'coach-become';
    const link = document.createElement('a');
    link.className = 'landing-setup-back';
    link.href = '/coach/edit';
    link.textContent = t(me.profile ? 'coach.editYourProfile' : 'coach.becomeCoach', {}, locale);
    become.append(link);
    intro.after(become);
  } catch {
    // Anonymous or offline: no affordance.
  }
}

// ── detail ───────────────────────────────────────────────────────────────────
async function renderDetail(shell: HTMLElement, handle: string, locale: Locale): Promise<void> {
  let coach: CoachDetail;
  try {
    const resp = await fetch(`/api/coaches/${encodeURIComponent(handle)}`);
    if (resp.status === 404) {
      shell.append(
        buildNotice(t('coach.notFoundTitle', {}, locale), t('coach.notFound', {}, locale)),
      );
      shell.append(buildBackLink(locale));
      return;
    }
    if (!resp.ok) throw new Error(`coach failed: ${resp.status}`);
    const data = (await resp.json()) as { coach?: CoachDetail };
    if (!data.coach) throw new Error('missing coach payload');
    coach = data.coach;
  } catch {
    shell.append(buildNotice(t('coach.heading', {}, locale), t('coach.loadFailed', {}, locale)));
    return;
  }

  const heading = document.createElement('h1');
  heading.className = 'site-section-heading coach-detail-header';
  const badge = buildTitleBadge(coach.title, locale);
  if (badge) heading.append(badge);
  const name = document.createElement('span');
  name.textContent = coach.displayName;
  heading.append(name);

  const headline = document.createElement('p');
  headline.className = 'coach-detail-headline';
  headline.textContent = coach.headline;

  shell.append(heading, headline, buildAcceptingPill(coach.acceptingStudents, locale));

  if (coach.about.trim().length > 0) {
    const about = document.createElement('section');
    about.className = 'coach-detail-about';
    const aboutHeading = document.createElement('h2');
    aboutHeading.textContent = t('coach.aboutLabel', {}, locale);
    about.append(aboutHeading);
    // Free text: render each non-empty line block as its own paragraph.
    for (const block of coach.about.split(/\n{2,}/)) {
      if (block.trim().length === 0) continue;
      const paragraph = document.createElement('p');
      paragraph.textContent = block.trim();
      about.append(paragraph);
    }
    shell.append(about);
  }

  const facts = document.createElement('dl');
  facts.className = 'coach-detail-facts';
  appendFact(facts, t('coach.languagesLabel', {}, locale), coach.languages);
  appendFact(facts, t('coach.rateLabel', {}, locale), coach.rate);
  appendFact(facts, t('coach.contactLabel', {}, locale), coach.contact);
  if (facts.childElementCount > 0) shell.append(facts);

  const links = document.createElement('p');
  links.className = 'coach-detail-links';
  const profileLink = document.createElement('a');
  profileLink.className = 'landing-setup-back';
  profileLink.href = `/@/${encodeURIComponent(coach.handle)}`;
  profileLink.textContent = t('coach.viewProfile', {}, locale);
  links.append(profileLink, buildBackLink(locale));
  shell.append(links);
}

function appendFact(facts: HTMLElement, label: string, value: string): void {
  if (value.trim().length === 0) return;
  const term = document.createElement('dt');
  term.textContent = label;
  const definition = document.createElement('dd');
  definition.textContent = value;
  facts.append(term, definition);
}

function buildBackLink(locale: Locale): HTMLElement {
  const back = document.createElement('a');
  back.className = 'landing-setup-back';
  back.href = '/coach';
  back.textContent = t('coach.backToDirectory', {}, locale);
  return back;
}
