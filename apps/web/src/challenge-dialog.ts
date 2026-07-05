import { DAYS_PER_MOVE_OPTIONS } from '@mistboard/game';
import './challenge-dialog.css';
import { t } from './i18n/catalog.js';
import { currentLocale, type Locale } from './i18n/locale.js';

// A small modal to send a directed correspondence challenge to a specific player
// (from their profile or the hover user-card). It posts to /api/correspondence/seeks
// with the target's handle; the server resolves it to a private, directed seek and
// returns a /challenge/:id url the challenger lands on. The target sees it in their
// incoming challenges. Modeled on confirm-dialog.ts (native <dialog>, shared chrome).
export function openChallengeDialog(opts: {
  handle: string;
  displayName?: string;
  locale?: Locale;
}): void {
  const locale = opts.locale ?? currentLocale();
  const name = opts.displayName?.trim() || opts.handle;

  document.querySelector<HTMLDialogElement>('dialog[data-challenge-dialog]')?.remove();
  const dialog = document.createElement('dialog');
  dialog.dataset.challengeDialog = '';
  dialog.className = 'confirm-dialog challenge-dialog';

  const title = document.createElement('h2');
  title.className = 'confirm-dialog-title';
  title.textContent = t('challenge.title', { name }, locale);

  const fields = document.createElement('div');
  fields.className = 'challenge-dialog-fields';

  const days = document.createElement('select');
  days.className = 'challenge-dialog-field';
  days.setAttribute('aria-label', t('challenge.daysPerMove', {}, locale));
  for (const option of DAYS_PER_MOVE_OPTIONS) {
    const opt = document.createElement('option');
    opt.value = String(option);
    opt.textContent = t(
      option === 1 ? 'challenge.dayOption' : 'challenge.daysOption',
      {
        days: option,
      },
      locale,
    );
    days.append(opt);
  }
  days.value = String(DAYS_PER_MOVE_OPTIONS[1] ?? DAYS_PER_MOVE_OPTIONS[0]);

  const color = document.createElement('select');
  color.className = 'challenge-dialog-field';
  color.setAttribute('aria-label', t('challenge.color', {}, locale));
  for (const [value, key] of [
    ['random', 'challenge.colorRandom'],
    ['white', 'challenge.colorWhite'],
    ['black', 'challenge.colorBlack'],
  ] as const) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = t(key, {}, locale);
    color.append(opt);
  }
  fields.append(days, color);

  const error = document.createElement('p');
  error.className = 'challenge-dialog-error';
  error.hidden = true;

  const actions = document.createElement('div');
  actions.className = 'confirm-dialog-actions';

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'confirm-dialog-cancel';
  cancel.textContent = t('challenge.cancel', {}, locale);
  cancel.addEventListener('click', () => dialog.close('cancel'));

  const send = document.createElement('button');
  send.type = 'button';
  send.className = 'confirm-dialog-confirm';
  send.textContent = t('challenge.send', {}, locale);
  send.addEventListener('click', () => {
    send.disabled = true;
    error.hidden = true;
    void fetch('/api/correspondence/seeks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        targetHandle: opts.handle,
        daysPerMove: Number(days.value),
        preferredColor: color.value,
      }),
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as {
          challengeUrl?: string;
          error?: string;
        } | null;
        if (res.ok && body?.challengeUrl) {
          location.href = body.challengeUrl;
          return;
        }
        error.textContent = challengeErrorText(res.status, body?.error, name, locale);
        error.hidden = false;
        send.disabled = false;
      })
      .catch(() => {
        error.textContent = t('challenge.errorGeneric', {}, locale);
        error.hidden = false;
        send.disabled = false;
      });
  });

  actions.append(cancel, send);
  dialog.append(title, fields, error, actions);

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close('cancel');
  });
  dialog.addEventListener('close', () => dialog.remove());

  document.body.append(dialog);
  try {
    dialog.showModal();
  } catch {
    // showModal is unimplemented in some headless/test environments; the dialog is
    // already appended and fully functional without the modal backdrop there.
  }
  send.focus();
}

function challengeErrorText(
  status: number,
  code: string | undefined,
  name: string,
  locale: Locale,
): string {
  if (status === 401) return t('challenge.errorSignIn', {}, locale);
  if (code === 'seek_limit_reached') return t('challenge.errorLimit', {}, locale);
  if (code === 'challenge_blocked') return t('challenge.errorBlocked', { name }, locale);
  return t('challenge.errorGeneric', {}, locale);
}
