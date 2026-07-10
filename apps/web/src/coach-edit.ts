// /coach/edit: create or update your own coach profile. Signed-in titled
// users get the form; untitled signed-in users get guidance pointing at
// /verify-title; signed-out visitors get a sign-in prompt. Publishing is
// re-checked server-side (routes/coaches.ts requires a held title), so this
// page is a convenience gate, not the enforcement point.

import './coach.css';
import { t } from './i18n/catalog.js';
import { currentLocale, type Locale } from './i18n/locale.js';
import { buildNav, buildNotice } from './site-shell.js';

// Mirror the caps in apps/server/src/routes/coaches.ts.
export const HEADLINE_MAX = 120;
export const ABOUT_MAX = 4000;
export const LANGUAGES_MAX = 200;
export const RATE_MAX = 120;
export const CONTACT_MAX = 400;

type CoachProfilePayload = {
  headline: string;
  about: string;
  languages: string;
  rate: string;
  contact: string;
  acceptingStudents: boolean;
  published: boolean;
};

type MyCoachPayload = {
  titled: boolean;
  handle: string;
  profile: CoachProfilePayload | null;
};

export async function mountCoachEdit(root: HTMLElement): Promise<void> {
  const locale = currentLocale();
  root.replaceChildren();
  root.classList.add('landing-page', 'coach-edit-route');

  const shell = document.createElement('main');
  shell.className = 'site-section coach-shell';
  root.append(buildNav(locale), shell);

  let payload: MyCoachPayload;
  try {
    const resp = await fetch('/api/coaches/me');
    if (resp.status === 401) {
      shell.append(
        buildNotice(t('coach.signInTitle', {}, locale), t('coach.signInBody', {}, locale)),
      );
      return;
    }
    if (!resp.ok) throw new Error(`coaches/me failed: ${resp.status}`);
    payload = (await resp.json()) as MyCoachPayload;
  } catch {
    shell.append(
      buildNotice(t('coach.editHeading', {}, locale), t('coach.loadFailed', {}, locale)),
    );
    return;
  }

  if (!payload.titled) {
    shell.append(
      buildNotice(t('coach.untitledTitle', {}, locale), t('coach.untitledBody', {}, locale)),
    );
    const cta = document.createElement('p');
    cta.className = 'coach-untitled-cta';
    const link = document.createElement('a');
    link.className = 'landing-setup-start';
    link.href = '/verify-title';
    link.textContent = t('coach.untitledCta', {}, locale);
    cta.append(link);
    shell.append(cta);
    return;
  }

  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = t('coach.editHeading', {}, locale);
  shell.append(heading, buildForm(payload.profile, payload.handle, locale));
}

function buildForm(
  profile: CoachProfilePayload | null,
  handle: string,
  locale: Locale,
): HTMLElement {
  const form = document.createElement('form');
  form.className = 'coach-form';
  form.noValidate = true;

  const headline = textField('headline', 'coach.headlineLabel', locale, {
    maxLength: HEADLINE_MAX,
    placeholderKey: 'coach.headlinePlaceholder',
    value: profile?.headline ?? '',
    required: true,
  });

  const aboutField = document.createElement('label');
  aboutField.className = 'coach-field';
  const aboutLabel = document.createElement('span');
  aboutLabel.textContent = t('coach.aboutLabelEdit', {}, locale);
  const about = document.createElement('textarea');
  about.name = 'about';
  about.rows = 8;
  about.maxLength = ABOUT_MAX;
  about.placeholder = t('coach.aboutPlaceholder', {}, locale);
  about.value = profile?.about ?? '';
  aboutField.append(aboutLabel, about);

  const languages = textField('languages', 'coach.languagesLabel', locale, {
    maxLength: LANGUAGES_MAX,
    placeholderKey: 'coach.languagesPlaceholder',
    value: profile?.languages ?? '',
  });
  const rate = textField('rate', 'coach.rateLabel', locale, {
    maxLength: RATE_MAX,
    placeholderKey: 'coach.ratePlaceholder',
    value: profile?.rate ?? '',
  });
  const contact = textField('contact', 'coach.contactLabel', locale, {
    maxLength: CONTACT_MAX,
    placeholderKey: 'coach.contactPlaceholder',
    value: profile?.contact ?? '',
    helpKey: 'coach.contactHelp',
  });

  const accepting = checkboxField(
    'acceptingStudents',
    'coach.acceptingEditLabel',
    locale,
    profile ? profile.acceptingStudents : true,
  );
  const publish = checkboxField(
    'published',
    'coach.publishLabel',
    locale,
    profile ? profile.published : false,
  );

  const status = document.createElement('p');
  status.className = 'coach-form-status';
  status.setAttribute('aria-live', 'polite');

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'landing-setup-start';
  submit.textContent = t('coach.save', {}, locale);

  form.append(headline.field, aboutField, languages.field, rate.field, contact.field);
  form.append(accepting.field, publish.field, submit, status);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (headline.input.value.trim().length === 0) {
      status.textContent = t('coach.errHeadlineRequired', {}, locale);
      return;
    }
    submit.disabled = true;
    status.textContent = t('coach.saving', {}, locale);
    try {
      const resp = await fetch('/api/coaches/me', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          headline: headline.input.value.trim(),
          about: about.value.trim(),
          languages: languages.input.value.trim(),
          rate: rate.input.value.trim(),
          contact: contact.input.value.trim(),
          acceptingStudents: accepting.input.checked,
          published: publish.input.checked,
        }),
      });
      const data = (await resp.json()) as { profile?: CoachProfilePayload; error?: string };
      if (!resp.ok || !data.profile) {
        status.textContent = saveErrorMessage(data.error, locale);
        submit.disabled = false;
        return;
      }
      status.replaceChildren();
      status.append(
        document.createTextNode(
          t(data.profile.published ? 'coach.savedPublished' : 'coach.savedDraft', {}, locale),
        ),
      );
      if (data.profile.published) {
        status.append(document.createTextNode(' '));
        const view = document.createElement('a');
        view.href = `/coach/${encodeURIComponent(handle)}`;
        view.textContent = t('coach.viewPublicPage', {}, locale);
        status.append(view);
      }
      submit.disabled = false;
    } catch {
      status.textContent = t('coach.saveFailed', {}, locale);
      submit.disabled = false;
    }
  });

  return form;
}

function textField(
  name: string,
  labelKey: Parameters<typeof t>[0],
  locale: Locale,
  options: {
    maxLength: number;
    placeholderKey: Parameters<typeof t>[0];
    value: string;
    required?: boolean;
    helpKey?: Parameters<typeof t>[0];
  },
): { field: HTMLElement; input: HTMLInputElement } {
  const field = document.createElement('label');
  field.className = 'coach-field';
  const label = document.createElement('span');
  label.textContent = t(labelKey, {}, locale);
  const input = document.createElement('input');
  input.type = 'text';
  input.name = name;
  input.maxLength = options.maxLength;
  input.placeholder = t(options.placeholderKey, {}, locale);
  input.value = options.value;
  if (options.required) input.required = true;
  field.append(label, input);
  if (options.helpKey) {
    const help = document.createElement('p');
    help.className = 'coach-help';
    help.textContent = t(options.helpKey, {}, locale);
    field.append(help);
  }
  return { field, input };
}

function checkboxField(
  name: string,
  labelKey: Parameters<typeof t>[0],
  locale: Locale,
  checked: boolean,
): { field: HTMLElement; input: HTMLInputElement } {
  const field = document.createElement('label');
  field.className = 'coach-check';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.name = name;
  input.checked = checked;
  const label = document.createElement('span');
  label.textContent = t(labelKey, {}, locale);
  field.append(input, label);
  return { field, input };
}

function saveErrorMessage(error: string | undefined, locale: Locale): string {
  switch (error) {
    case 'headline_required':
      return t('coach.errHeadlineRequired', {}, locale);
    case 'headline_too_long':
      return t('coach.errHeadlineTooLong', { max: HEADLINE_MAX }, locale);
    case 'about_too_long':
      return t('coach.errAboutTooLong', { max: ABOUT_MAX }, locale);
    case 'languages_too_long':
      return t('coach.errLanguagesTooLong', { max: LANGUAGES_MAX }, locale);
    case 'rate_too_long':
      return t('coach.errRateTooLong', { max: RATE_MAX }, locale);
    case 'contact_too_long':
      return t('coach.errContactTooLong', { max: CONTACT_MAX }, locale);
    case 'title_required':
      return t('coach.errTitleRequired', {}, locale);
    case 'not_signed_in':
      return t('coach.signInBody', {}, locale);
    default:
      return t('coach.saveFailed', {}, locale);
  }
}
