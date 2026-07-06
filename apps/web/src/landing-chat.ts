// Homepage lobby-chat widget (gate-cleared 2026-07-02). Server-driven: the
// widget renders NOTHING until the first fetch confirms the chat flag is on,
// so a flag-off deploy never shows a dead box and the env flag doubles as a
// kill switch. Quiet-collapse: when the room has no line in the last 24h the
// box renders as a one-line invitation instead of an empty scrollback, so a
// low-traffic homepage never wears a dead chat room.

import './landing-chat.css';
import { type I18nKey, t } from './i18n/catalog.js';
import { currentLocale, type Locale } from './i18n/locale.js';
import { buildSiteBox } from './site-box.js';

type ChatLine = { id: string; handle: string | null; text: string; createdAt: string };
type ChatState = {
  lines: ChatLine[];
  canPost: boolean;
  canReport: boolean;
  timeoutUntil?: string;
  isAdmin: boolean;
};

const POLL_MS = 7000;
const QUIET_AFTER_MS = 24 * 60 * 60 * 1000;
const VISIBLE_LINES = 30;

type LandingChatMode = 'live' | 'mock';

export function buildLandingChat(
  options: { hydrate?: boolean; mode?: LandingChatMode } = {},
): HTMLElement {
  // A plain placeholder mount, not a site-box: nothing paints unless the API
  // says the room exists. The prerendered shell carries this empty div, so
  // there is no reserved footprint to jank when chat is disabled.
  const mount = document.createElement('div');
  mount.className = 'landing-chat-mount';
  if (options.hydrate !== false) void hydrateChat(mount, options.mode ?? 'live');
  return mount;
}

async function hydrateChat(mount: HTMLElement, mode: LandingChatMode): Promise<void> {
  const locale = currentLocale();
  const state = mode === 'mock' ? mockChatState() : await fetchChat();
  if (!state) return; // disabled or unreachable: render nothing

  const { box, body } = buildSiteBox({
    title: mode === 'mock' ? 'Chat room' : t('chat.title', {}, locale),
    className: 'landing-chat',
  });
  const top = box.querySelector('.site-box-top');
  top?.append(buildChatToggle(box, body, mount, mode, locale));

  const latest = state.lines[state.lines.length - 1];
  const quiet = !latest || Date.now() - new Date(latest.createdAt).getTime() > QUIET_AFTER_MS;

  if (quiet) {
    renderQuiet(body, state, locale, mount, mode);
  } else {
    renderRoom(body, state, locale, mode);
  }
  mount.replaceChildren(box);
}

function buildChatToggle(
  box: HTMLElement,
  body: HTMLElement,
  mount: HTMLElement,
  mode: LandingChatMode,
  locale: Locale,
): HTMLButtonElement {
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'landing-chat-toggle';
  toggle.title = mode === 'mock' ? 'Toggle chat preview' : t('chat.title', {}, locale);
  toggle.addEventListener('click', () => {
    if (box.classList.contains('is-chat-muted')) {
      void hydrateChat(mount, mode);
      return;
    }
    box.classList.add('is-chat-muted');
    body.replaceChildren();
  });
  return toggle;
}

// Quiet mode: one inviting line and, for signed-in users, the composer right
// there — the first message is the expansion. No empty scrollback ever shows.
function renderQuiet(
  body: HTMLElement,
  state: ChatState,
  locale: Locale,
  mount: HTMLElement,
  mode: LandingChatMode,
): void {
  body.replaceChildren();
  const row = document.createElement('p');
  row.className = 'landing-chat-quiet';
  row.textContent = t('chat.quiet', {}, locale);
  body.append(row);
  if (state.canPost) {
    body.append(
      buildComposer(locale, () => {
        // First message: swap to the live room so the sender sees it land.
        void hydrateChat(mount, mode);
      }),
    );
  } else {
    body.append(buildSignInRow(locale));
  }
}

function renderRoom(
  body: HTMLElement,
  state: ChatState,
  locale: Locale,
  mode: LandingChatMode,
): void {
  body.replaceChildren();

  const feed = document.createElement('div');
  feed.className = 'landing-chat-feed';
  const known = new Set<string>();
  appendLines(feed, state.lines.slice(-VISIBLE_LINES), known, state, locale, mode);
  body.append(feed);

  if (state.canPost) {
    body.append(
      buildComposer(
        locale,
        (line) => {
          if (line) appendLines(feed, [line], known, state, locale, mode);
        },
        mode === 'mock' ? postMockLine : undefined,
      ),
    );
  } else if (state.timeoutUntil) {
    const note = document.createElement('p');
    note.className = 'landing-chat-quiet';
    note.textContent = t('chat.timedOut', {}, locale);
    body.append(note);
  } else {
    body.append(buildSignInRow(locale));
  }

  // Poll while the tab is visible; page-scoped interval (full-page navs).
  if (mode === 'mock') return;
  window.setInterval(async () => {
    if (document.visibilityState !== 'visible') return;
    const fresh = await fetchChat();
    if (!fresh) return;
    const incoming = fresh.lines.filter((line) => !known.has(line.id));
    if (incoming.length > 0) appendLines(feed, incoming, known, fresh, locale, mode);
  }, POLL_MS);
}

function appendLines(
  feed: HTMLElement,
  lines: ChatLine[],
  known: Set<string>,
  state: Pick<ChatState, 'canReport' | 'isAdmin'>,
  locale: Locale,
  mode: LandingChatMode,
): void {
  for (const line of lines) {
    known.add(line.id);
    const row = document.createElement('div');
    row.className = 'landing-chat-line';
    const who = document.createElement('a');
    who.className = 'landing-chat-handle';
    who.href = line.handle ? `/@/${encodeURIComponent(line.handle)}` : '#';
    who.textContent = line.handle ?? t('chat.deletedAccount', {}, locale);
    const text = document.createElement('span');
    text.className = 'landing-chat-text';
    appendChatText(text, line.text);
    row.append(who, text);
    if (state.isAdmin && line.handle) {
      row.append(buildAdminControls(line, row));
    } else if (state.canReport && line.handle) {
      row.append(buildReportControl(line, mode));
    }
    feed.append(row);
  }
  feed.scrollTop = feed.scrollHeight;
}

// Admin-only inline moderation: hide the line, or 15-min timeout its author
// (which also strikes their other lines server-side). English-only, admin
// surface convention.
function buildAdminControls(line: ChatLine, row: HTMLElement): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'landing-chat-admin';

  const hide = document.createElement('button');
  hide.type = 'button';
  hide.className = 'landing-chat-admin-action';
  hide.title = 'Hide line';
  hide.textContent = '✕';
  hide.addEventListener('click', async () => {
    const resp = await fetch('/api/chat/lobby/hide', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lineId: line.id }),
    }).catch(() => null);
    if (resp?.ok) row.remove();
  });

  const timeout = document.createElement('button');
  timeout.type = 'button';
  timeout.className = 'landing-chat-admin-action';
  timeout.title = 'Timeout 15 min';
  timeout.textContent = '⏱';
  timeout.addEventListener('click', async () => {
    const resp = await fetch('/api/chat/lobby/timeout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handle: line.handle }),
    }).catch(() => null);
    if (resp?.ok) window.location.reload();
  });

  wrap.append(hide, timeout);
  return wrap;
}

function buildReportControl(line: ChatLine, mode: LandingChatMode): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'landing-chat-admin-action';
  button.title = 'Report line';
  button.textContent = '!';
  button.addEventListener('click', async () => {
    button.disabled = true;
    if (mode === 'mock') {
      button.textContent = 'reported';
      return;
    }
    const resp = await fetch('/api/chat/lobby/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lineId: line.id, reason: 'Chat message report' }),
    }).catch(() => null);
    if (resp?.ok || resp?.status === 409) {
      button.textContent = 'reported';
      return;
    }
    button.disabled = false;
  });
  return button;
}

function buildComposer(
  locale: Locale,
  onSent: (line: ChatLine | null) => void,
  postLine: (text: string) => Promise<ChatLine> = postLiveLine,
): HTMLElement {
  const form = document.createElement('form');
  form.className = 'landing-chat-composer';

  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 140;
  input.placeholder = t('chat.placeholder', {}, locale);
  input.className = 'landing-chat-input';

  const status = document.createElement('span');
  status.className = 'landing-chat-status';
  status.hidden = true;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.disabled = true;
    status.hidden = true;
    try {
      const line = await postLine(text);
      input.value = '';
      onSent(line);
    } catch (error) {
      const code = error instanceof ChatPostError ? error.code : undefined;
      status.textContent = postErrorCopy(code, locale);
      status.hidden = false;
      onSent(null);
    } finally {
      input.disabled = false;
      input.focus();
    }
  });

  form.append(input, status);
  return form;
}

function buildSignInRow(locale: Locale): HTMLElement {
  const row = document.createElement('a');
  row.className = 'landing-chat-signin';
  row.href = '/account?tab=login';
  row.textContent = t('chat.signInToChat', {}, locale);
  return row;
}

function postErrorCopy(error: string | undefined, locale: Locale): string {
  const key: I18nKey =
    error === 'rate_limited'
      ? 'chat.rateLimited'
      : error === 'links_not_allowed'
        ? 'inbox.linksNotAllowed'
        : error === 'timed_out'
          ? 'chat.timedOut'
          : 'chat.sendFailed';
  return t(key, {}, locale);
}

const TOKEN_PATTERN = /(@[a-z0-9_-]+|(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?)/gi;

function appendChatText(container: HTMLElement, text: string): void {
  let cursor = 0;
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const index = match.index ?? cursor;
    if (index > cursor) container.append(document.createTextNode(text.slice(cursor, index)));
    const token = document.createElement('span');
    token.className = 'landing-chat-token';
    token.textContent = match[0];
    container.append(token);
    cursor = index + match[0].length;
  }
  if (cursor < text.length) container.append(document.createTextNode(text.slice(cursor)));
}

async function fetchChat(): Promise<ChatState | null> {
  try {
    const resp = await fetch('/api/chat/lobby');
    if (!resp.ok) return null;
    return (await resp.json()) as ChatState;
  } catch {
    return null;
  }
}

class ChatPostError extends Error {
  constructor(readonly code: string | undefined) {
    super(code ?? 'chat_post_failed');
  }
}

async function postLiveLine(text: string): Promise<ChatLine> {
  const resp = await fetch('/api/chat/lobby', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!resp.ok) {
    const data = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new ChatPostError(data.error);
  }
  const data = (await resp.json()) as { line: ChatLine };
  return data.line;
}

async function postMockLine(text: string): Promise<ChatLine> {
  return {
    id: `mock_${Date.now().toString(36)}`,
    handle: 'you',
    text,
    createdAt: new Date().toISOString(),
  };
}

function mockChatState(): ChatState {
  const now = Date.now();
  return {
    canPost: true,
    canReport: true,
    isAdmin: false,
    lines: [
      {
        id: 'mock_chat_1',
        handle: 'mbappe29',
        text: '@vci20.playstrategy.org/challenge/IqLAiNqe',
        createdAt: new Date(now - 15 * 60 * 1000).toISOString(),
      },
      {
        id: 'mock_chat_2',
        handle: 'hoangbaophong3',
        text: 'hello',
        createdAt: new Date(now - 8 * 60 * 1000).toISOString(),
      },
      {
        id: 'mock_chat_3',
        handle: 'Top2Always',
        text: 'Good Afternoon Everyone And Good Afternoon @sdrf_tajik',
        createdAt: new Date(now - 2 * 60 * 1000).toISOString(),
      },
    ],
  };
}
