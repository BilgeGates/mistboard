// /inbox and /inbox/:handle — the DM surface (#88). Two panes: a contacts rail
// (thread list, unread markers) and the open conversation (messages +
// composer). Realtime is polling: the open conversation re-fetches every few
// seconds while the tab is visible; the server marks a conversation read as a
// side effect of loading it, so the nav bell drains by itself.

import './inbox.css';
import { openConfirmDialog } from './confirm-dialog.js';
import { t } from './i18n/catalog.js';
import { currentLocale, LOCALE_META, type Locale } from './i18n/locale.js';
import { refreshNotifications } from './notification-nav.js';
import { buildLoadingState, buildNav, buildNotice, fetchCurrentUser } from './site-shell.js';

type ThreadSummary = {
  other: { handle: string; displayName: string };
  lastText: string;
  lastFromMe: boolean;
  lastAt: string;
  unread: boolean;
};

type DmMessage = { id: string; fromMe: boolean; bodyText: string; createdAt: string };

const CONVO_POLL_MS = 4000;

// Set once per mount; renderThreads rebuilds the contacts rail on every poll
// refresh, so the admin queue link has to survive re-renders via module state.
let viewerIsAdmin = false;

export async function mountInbox(root: HTMLElement, handle: string | null): Promise<void> {
  const locale = currentLocale();
  root.replaceChildren();
  root.classList.add('landing-page', 'inbox-route');
  root.append(buildNav(locale), buildLoadingState(t('inbox.loading', {}, locale)));

  const user = await fetchCurrentUser().catch(() => null);
  const shell = document.createElement('main');
  shell.className = 'inbox-shell';
  root.replaceChildren(buildNav(locale), shell);

  if (!user) {
    shell.append(
      buildNotice(t('inbox.signInTitle', {}, locale), t('inbox.signInBody', {}, locale)),
    );
    return;
  }

  viewerIsAdmin = user.accountRole === 'admin';
  if (handle) shell.classList.add('inbox-has-convo');

  const contacts = document.createElement('section');
  contacts.className = 'inbox-contacts';
  const convo = document.createElement('section');
  convo.className = 'inbox-convo';
  shell.append(contacts, convo);

  await renderThreads(contacts, handle, locale);

  if (handle) {
    await openConversation(convo, contacts, handle, locale);
  } else {
    const hint = document.createElement('p');
    hint.className = 'inbox-hint account-copy';
    hint.textContent = t('inbox.pickConversation', {}, locale);
    convo.append(hint);
  }
}

async function renderThreads(
  container: HTMLElement,
  activeHandle: string | null,
  locale: Locale,
): Promise<void> {
  const resp = await fetch('/api/inbox').catch(() => null);
  container.replaceChildren();

  const heading = document.createElement('h1');
  heading.className = 'inbox-heading';
  heading.textContent = t('inbox.title', {}, locale);
  container.append(heading);

  if (viewerIsAdmin) {
    const reports = document.createElement('a');
    reports.className = 'inbox-back-link';
    reports.href = '/inbox/reports';
    reports.textContent = 'Reports';
    container.append(reports);
  }

  if (!resp?.ok) {
    container.append(
      buildNotice(t('inbox.loadFailedTitle', {}, locale), t('inbox.loadFailedBody', {}, locale)),
    );
    return;
  }
  const data = (await resp.json()) as { threads: ThreadSummary[] };
  if (data.threads.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'account-copy inbox-empty';
    empty.textContent = t('inbox.empty', {}, locale);
    container.append(empty);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'inbox-thread-list';
  for (const thread of data.threads) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = `/inbox/${encodeURIComponent(thread.other.handle)}`;
    link.className = 'inbox-thread';
    if (thread.unread) link.classList.add('inbox-thread-unread');
    if (activeHandle && thread.other.handle.toLowerCase() === activeHandle.toLowerCase()) {
      link.classList.add('inbox-thread-active');
    }

    const top = document.createElement('span');
    top.className = 'inbox-thread-top';
    const who = document.createElement('span');
    who.className = 'inbox-thread-handle';
    who.textContent = `@${thread.other.handle}`;
    const when = document.createElement('span');
    when.className = 'inbox-thread-date';
    when.textContent = formatWhen(thread.lastAt, locale);
    top.append(who, when);

    const preview = document.createElement('span');
    preview.className = 'inbox-thread-preview';
    preview.textContent = thread.lastFromMe
      ? `${t('inbox.you', {}, locale)} ${thread.lastText}`
      : thread.lastText;

    link.append(top, preview);
    item.append(link);
    list.append(item);
  }
  container.append(list);
}

async function openConversation(
  convo: HTMLElement,
  contacts: HTMLElement,
  handle: string,
  locale: Locale,
): Promise<void> {
  convo.replaceChildren();

  const resp = await fetch(`/api/inbox/${encodeURIComponent(handle)}`).catch(() => null);
  if (resp?.status === 404) {
    convo.append(
      buildNotice(t('inbox.unknownUserTitle', {}, locale), t('inbox.unknownUserBody', {}, locale)),
    );
    return;
  }
  if (!resp?.ok) {
    convo.append(
      buildNotice(t('inbox.loadFailedTitle', {}, locale), t('inbox.loadFailedBody', {}, locale)),
    );
    return;
  }
  const data = (await resp.json()) as {
    other: { handle: string; displayName: string };
    messages: DmMessage[];
  };
  void refreshNotifications();

  // Header: back link (mobile), profile link, delete + report controls.
  const header = document.createElement('header');
  header.className = 'inbox-convo-header';

  const back = document.createElement('a');
  back.className = 'inbox-back';
  back.href = '/inbox';
  back.textContent = `← ${t('inbox.backToList', {}, locale)}`;

  const who = document.createElement('a');
  who.className = 'inbox-convo-handle';
  who.href = `/@/${encodeURIComponent(data.other.handle)}`;
  who.textContent = `@${data.other.handle}`;

  const controls = document.createElement('div');
  controls.className = 'inbox-convo-controls';
  controls.append(buildReportControl(handle, locale), buildDeleteControl(handle, locale));

  header.append(back, who, controls);

  const feed = document.createElement('div');
  feed.className = 'inbox-messages';
  renderMessages(feed, data.messages, locale);

  // Every rendered message id, shared by the composer (own sends) and the poll
  // (incoming), so neither path can append a message the other already drew.
  const knownIds = new Set(data.messages.map((message) => message.id));

  const composer = buildComposer(handle, feed, contacts, knownIds, locale);

  convo.append(header, feed, composer);
  feed.scrollTop = feed.scrollHeight;

  // Poll while visible. Page-scoped interval: navigation is a full page load
  // in this client, so there is nothing to tear down beyond tab lifetime.
  window.setInterval(async () => {
    if (document.visibilityState !== 'visible') return;
    const refresh = await fetch(`/api/inbox/${encodeURIComponent(handle)}`).catch(() => null);
    if (!refresh?.ok) return;
    const fresh = (await refresh.json()) as { messages: DmMessage[] };
    const incoming = fresh.messages.filter((message) => !knownIds.has(message.id));
    if (incoming.length === 0) return;
    for (const message of incoming) knownIds.add(message.id);
    appendMessages(feed, incoming, locale);
    void refreshNotifications();
    void renderThreads(contacts, handle, locale);
  }, CONVO_POLL_MS);
}

function renderMessages(feed: HTMLElement, messages: DmMessage[], locale: Locale): void {
  feed.replaceChildren();
  if (messages.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'account-copy inbox-empty';
    empty.textContent = t('inbox.noMessages', {}, locale);
    feed.append(empty);
    return;
  }
  appendMessages(feed, messages, locale);
}

function appendMessages(feed: HTMLElement, messages: DmMessage[], locale: Locale): void {
  feed.querySelector('.inbox-empty')?.remove();
  for (const message of messages) {
    const row = document.createElement('div');
    row.className = message.fromMe ? 'inbox-message inbox-message-mine' : 'inbox-message';
    const bubble = document.createElement('p');
    bubble.className = 'inbox-bubble';
    bubble.textContent = message.bodyText;
    const stamp = document.createElement('span');
    stamp.className = 'inbox-stamp';
    stamp.textContent = formatWhen(message.createdAt, locale);
    row.append(bubble, stamp);
    feed.append(row);
  }
  feed.scrollTop = feed.scrollHeight;
}

function buildComposer(
  handle: string,
  feed: HTMLElement,
  contacts: HTMLElement,
  knownIds: Set<string>,
  locale: Locale,
): HTMLElement {
  const form = document.createElement('form');
  form.className = 'inbox-composer';

  const input = document.createElement('textarea');
  input.className = 'inbox-input';
  input.rows = 2;
  input.maxLength = 5000;
  input.placeholder = t('inbox.composerPlaceholder', {}, locale);

  const send = document.createElement('button');
  send.type = 'submit';
  send.className = 'landing-setup-start inbox-send';
  send.textContent = t('inbox.send', {}, locale);

  const status = document.createElement('p');
  status.className = 'inbox-status';
  status.hidden = true;

  // Enter sends, Shift+Enter for a newline (the DM convention).
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    send.disabled = true;
    status.hidden = true;
    try {
      const resp = await fetch(`/api/inbox/${encodeURIComponent(handle)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!resp.ok) {
        const data = (await resp.json().catch(() => ({}))) as { error?: string };
        status.textContent = sendErrorCopy(data.error, locale);
        status.hidden = false;
        return;
      }
      const data = (await resp.json()) as { message: DmMessage };
      knownIds.add(data.message.id);
      appendMessages(feed, [data.message], locale);
      input.value = '';
      void renderThreads(contacts, handle, locale);
    } catch {
      status.textContent = t('inbox.sendFailed', {}, locale);
      status.hidden = false;
    } finally {
      send.disabled = false;
      input.focus();
    }
  });

  form.append(input, send, status);
  return form;
}

function buildDeleteControl(handle: string, locale: Locale): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'inbox-header-action';
  button.textContent = t('inbox.delete', {}, locale);
  button.addEventListener('click', () => {
    openConfirmDialog({
      title: t('inbox.deleteConfirmTitle', {}, locale),
      body: t('inbox.deleteConfirmBody', {}, locale),
      confirmLabel: t('inbox.delete', {}, locale),
      confirmTone: 'danger',
      onConfirm: () => {
        void fetch(`/api/inbox/${encodeURIComponent(handle)}`, { method: 'DELETE' }).then(() => {
          window.location.href = '/inbox';
        });
      },
    });
  });
  return button;
}

// Report is an inline reveal (no browser prompt dialogs): the button swaps to
// a reason input + submit, and collapses to a "reported" note on success.
function buildReportControl(handle: string, locale: Locale): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'inbox-report';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'inbox-header-action';
  button.textContent = t('inbox.report', {}, locale);

  const form = document.createElement('form');
  form.className = 'inbox-report-form';
  form.hidden = true;
  const reason = document.createElement('input');
  reason.type = 'text';
  reason.maxLength = 240;
  reason.placeholder = t('inbox.reportPrompt', {}, locale);
  reason.className = 'inbox-report-reason';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'inbox-header-action';
  submit.textContent = t('inbox.report', {}, locale);
  form.append(reason, submit);

  button.addEventListener('click', () => {
    form.hidden = !form.hidden;
    if (!form.hidden) reason.focus();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = reason.value.trim();
    if (!text) return;
    submit.disabled = true;
    const resp = await fetch(`/api/inbox/${encodeURIComponent(handle)}/report`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: text }),
    }).catch(() => null);
    submit.disabled = false;
    if (resp && (resp.ok || resp.status === 409)) {
      const note = document.createElement('span');
      note.className = 'inbox-reported-note';
      note.textContent = t('inbox.reported', {}, locale);
      wrap.replaceChildren(note);
    }
  });

  wrap.append(button, form);
  return wrap;
}

function sendErrorCopy(error: string | undefined, locale: Locale): string {
  if (error === 'rate_limited') return t('inbox.rateLimited', {}, locale);
  if (error === 'message_not_allowed') return t('inbox.notAllowed', {}, locale);
  if (error === 'links_not_allowed') return t('inbox.linksNotAllowed', {}, locale);
  return t('inbox.sendFailed', {}, locale);
}

function formatWhen(value: string, locale: Locale): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const sameDay = new Date().toDateString() === date.toDateString();
  return new Intl.DateTimeFormat(
    LOCALE_META[locale].dateLocale,
    sameDay ? { timeStyle: 'short' } : { dateStyle: 'medium', timeStyle: 'short' },
  ).format(date);
}

// ── /inbox/reports — admin DM report queue ──────────────────────────────────
// Admin-only surface (English-only, forum-reports precedent): the API 403s
// non-admins in production, and this page just renders that refusal. Admins
// see reported threads only; there is no browse-all-DMs surface anywhere.

type DmReport = {
  id: string;
  threadId: string;
  reporterHandle: string | null;
  reason: string;
  status: 'open' | 'resolved' | 'dismissed';
  createdAt: string;
};

type AdminThread = {
  threadId: string;
  participants: { handle: string; displayName: string }[];
  messages: { senderHandle: string | null; bodyText: string; createdAt: string }[];
};

const REPORT_STATUSES = ['open', 'resolved', 'dismissed'] as const;

export async function mountInboxReports(root: HTMLElement): Promise<void> {
  const locale = currentLocale();
  root.replaceChildren();
  root.classList.add('landing-page', 'inbox-route');

  const shell = document.createElement('main');
  shell.className = 'inbox-shell inbox-reports-shell';
  root.append(buildNav(locale), shell);

  const query = new URLSearchParams(window.location.search);
  const statusParam = query.get('status');
  const status = statusParam === 'resolved' || statusParam === 'dismissed' ? statusParam : 'open';

  const resp = await fetch(`/api/inbox/reports?status=${status}`).catch(() => null);
  if (resp?.status === 403) {
    shell.append(
      buildNotice('Admin access required', 'Message reports are available to moderators.'),
    );
    return;
  }
  if (!resp?.ok) {
    shell.append(buildNotice('Reports unavailable', 'The report queue could not load.'));
    return;
  }
  const data = (await resp.json()) as { reports: DmReport[] };

  const panel = document.createElement('section');
  panel.className = 'inbox-reports-panel';

  const header = document.createElement('header');
  header.className = 'inbox-reports-header';
  const title = document.createElement('h1');
  title.className = 'inbox-heading';
  title.textContent = 'Message reports';
  const back = document.createElement('a');
  back.className = 'inbox-back-link';
  back.href = '/inbox';
  back.textContent = '← Inbox';
  header.append(back, title);

  const filters = document.createElement('nav');
  filters.className = 'inbox-reports-filters';
  for (const option of REPORT_STATUSES) {
    const link = document.createElement('a');
    link.href = `/inbox/reports?status=${option}`;
    link.textContent = option;
    link.className =
      option === status
        ? 'inbox-reports-filter inbox-reports-filter-active'
        : 'inbox-reports-filter';
    filters.append(link);
  }

  panel.append(header, filters);

  if (data.reports.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'account-copy inbox-empty';
    empty.textContent = `No ${status} reports.`;
    panel.append(empty);
  } else {
    const list = document.createElement('ul');
    list.className = 'inbox-reports-list';
    for (const report of data.reports) {
      list.append(buildReportRow(report, locale));
    }
    panel.append(list);
  }

  shell.replaceChildren(panel);
}

function buildReportRow(report: DmReport, locale: Locale): HTMLElement {
  const item = document.createElement('li');
  item.className = 'inbox-reports-row';

  const summary = document.createElement('div');
  summary.className = 'inbox-reports-summary';
  const meta = document.createElement('span');
  meta.className = 'inbox-reports-meta';
  meta.textContent = `${report.reporterHandle ? `@${report.reporterHandle}` : 'deleted account'} · ${formatWhen(report.createdAt, locale)}`;
  const reason = document.createElement('p');
  reason.className = 'inbox-reports-reason';
  reason.textContent = report.reason;
  summary.append(meta, reason);

  const actions = document.createElement('div');
  actions.className = 'inbox-reports-actions';

  const threadSlot = document.createElement('div');
  threadSlot.className = 'inbox-reports-thread';
  threadSlot.hidden = true;

  const view = document.createElement('button');
  view.type = 'button';
  view.className = 'inbox-header-action';
  view.textContent = 'View thread';
  view.addEventListener('click', async () => {
    if (!threadSlot.hidden) {
      threadSlot.hidden = true;
      return;
    }
    if (threadSlot.childElementCount === 0) {
      view.disabled = true;
      const loaded = await fetchAdminThread(report.threadId);
      view.disabled = false;
      if (!loaded) {
        threadSlot.textContent = 'Thread could not load.';
      } else {
        renderAdminThread(threadSlot, loaded, locale);
      }
    }
    threadSlot.hidden = false;
  });
  actions.append(view);

  if (report.status === 'open') {
    const note = document.createElement('input');
    note.type = 'text';
    note.maxLength = 240;
    note.placeholder = 'Resolution note (optional)';
    note.className = 'inbox-report-reason';

    for (const [label, status] of [
      ['Resolve', 'resolved'],
      ['Dismiss', 'dismissed'],
    ] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'inbox-header-action';
      button.textContent = label;
      button.addEventListener('click', async () => {
        button.disabled = true;
        const resp = await fetch(`/api/inbox/reports/${encodeURIComponent(report.id)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status, note: note.value.trim() || undefined }),
        }).catch(() => null);
        if (resp?.ok) item.remove();
        else button.disabled = false;
      });
      actions.append(button);
    }
    actions.append(note);
  }

  item.append(summary, actions, threadSlot);
  return item;
}

async function fetchAdminThread(threadId: string): Promise<AdminThread | null> {
  const resp = await fetch(`/api/inbox/threads/${encodeURIComponent(threadId)}`).catch(() => null);
  if (!resp?.ok) return null;
  const data = (await resp.json()) as { thread: AdminThread };
  return data.thread;
}

function renderAdminThread(slot: HTMLElement, thread: AdminThread, locale: Locale): void {
  slot.replaceChildren();
  const who = document.createElement('p');
  who.className = 'inbox-reports-meta';
  who.textContent = thread.participants.map((p) => `@${p.handle}`).join(' ↔ ');
  slot.append(who);
  for (const message of thread.messages) {
    const line = document.createElement('p');
    line.className = 'inbox-reports-line';
    line.textContent = `${message.senderHandle ? `@${message.senderHandle}` : 'deleted'} · ${formatWhen(message.createdAt, locale)}: ${message.bodyText}`;
    slot.append(line);
  }
}
