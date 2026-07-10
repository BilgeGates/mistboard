import './spectator-chat.css';

type ChatLine = { id: string; handle: string | null; text: string; createdAt: string };
type ChatState = {
  lines: ChatLine[];
  canPost: boolean;
  canReport: boolean;
  viewerHandle: string | null;
  timeoutUntil?: string;
};

const POLL_MS = 7000;
const VISIBLE_LINES = 80;
const TOKEN_PATTERN = /(@[a-z0-9_-]+|(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?)/gi;

export function buildSpectatorChat(roomId: string): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'review-spectator-chat';
  panel.setAttribute('aria-label', 'Spectator chat');

  const header = document.createElement('div');
  header.className = 'review-spectator-chat__tabs';
  const tab = document.createElement('div');
  tab.className = 'review-spectator-chat__tab review-spectator-chat__tab--active';
  tab.textContent = 'Spectator room';
  header.append(tab);

  const feed = document.createElement('div');
  feed.className = 'review-spectator-chat__feed';

  const footer = document.createElement('div');
  footer.className = 'review-spectator-chat__footer';
  renderStatus(footer, 'Loading chat...');

  panel.append(header, feed, footer);

  const known = new Set<string>();
  void hydrateSpectatorChat(roomId, feed, footer, known);
  if (import.meta.env.MODE !== 'test') startPolling(roomId, panel, feed, known);

  return panel;
}

export function gameChatApiUrl(roomId: string): string {
  return `/api/chat/game/${encodeURIComponent(roomId)}`;
}

async function hydrateSpectatorChat(
  roomId: string,
  feed: HTMLElement,
  footer: HTMLElement,
  known: Set<string>,
): Promise<void> {
  const state = await fetchGameChat(roomId);
  if (!state) {
    renderStatus(footer, 'Spectator chat is unavailable.');
    return;
  }
  feed.replaceChildren();
  known.clear();
  appendLines(feed, state.lines.slice(-VISIBLE_LINES), known, state, roomId);
  renderFooter(footer, state, roomId, feed, known);
}

function startPolling(
  roomId: string,
  panel: HTMLElement,
  feed: HTMLElement,
  known: Set<string>,
): void {
  const timer = window.setInterval(async () => {
    if (!panel.isConnected) {
      window.clearInterval(timer);
      return;
    }
    if (document.visibilityState !== 'visible') return;
    const state = await fetchGameChat(roomId);
    if (!state) return;
    const incoming = state.lines.filter((line) => !known.has(line.id)).slice(-VISIBLE_LINES);
    appendLines(feed, incoming, known, state, roomId);
  }, POLL_MS);
}

function renderFooter(
  footer: HTMLElement,
  state: ChatState,
  roomId: string,
  feed: HTMLElement,
  known: Set<string>,
): void {
  footer.replaceChildren();
  if (state.canPost) {
    footer.append(buildComposer(roomId, feed, known, state));
    return;
  }
  if (state.timeoutUntil) {
    renderStatus(footer, 'You are temporarily timed out from chat.');
    return;
  }
  const signIn = document.createElement('a');
  signIn.className = 'review-spectator-chat__signin';
  signIn.href = '/account?tab=login';
  signIn.textContent = 'Sign in to chat';
  footer.append(signIn);
}

function buildComposer(
  roomId: string,
  feed: HTMLElement,
  known: Set<string>,
  state: ChatState,
): HTMLElement {
  const form = document.createElement('form');
  form.className = 'review-spectator-chat__composer';

  const input = document.createElement('input');
  input.className = 'review-spectator-chat__input';
  input.type = 'text';
  input.maxLength = 140;
  input.placeholder = 'Please be nice in the chat!';

  const status = document.createElement('span');
  status.className = 'review-spectator-chat__status';
  status.hidden = true;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.disabled = true;
    status.hidden = true;
    try {
      const line = await postGameChatLine(roomId, text);
      input.value = '';
      appendLines(feed, [line], known, state, roomId);
    } catch (error) {
      status.textContent = postErrorCopy(error instanceof ChatPostError ? error.code : undefined);
      status.hidden = false;
    } finally {
      input.disabled = false;
      input.focus();
    }
  });

  form.append(input, status);
  return form;
}

function appendLines(
  feed: HTMLElement,
  lines: ChatLine[],
  known: Set<string>,
  state: Pick<ChatState, 'canReport' | 'viewerHandle'>,
  roomId: string,
): void {
  if (lines.length === 0) return;
  const wasAtBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 24;
  for (const line of lines) {
    if (known.has(line.id)) continue;
    known.add(line.id);
    const row = document.createElement('div');
    row.className = 'review-spectator-chat__line';
    const who = document.createElement('a');
    who.className = 'review-spectator-chat__handle';
    who.href = line.handle ? `/@/${encodeURIComponent(line.handle)}` : '#';
    who.textContent = line.handle ?? 'deleted';
    const text = document.createElement('span');
    text.className = 'review-spectator-chat__text';
    appendChatText(text, line.text);
    row.append(who, text);
    if (canReportLine(state, line)) row.append(buildReportControl(roomId, line));
    feed.append(row);
  }
  if (wasAtBottom) feed.scrollTop = feed.scrollHeight;
}

function canReportLine(
  state: Pick<ChatState, 'canReport' | 'viewerHandle'>,
  line: ChatLine,
): boolean {
  return !!state.canReport && !!line.handle && line.handle !== state.viewerHandle;
}

function buildReportControl(roomId: string, line: ChatLine): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'review-spectator-chat__report';
  button.title = 'Report message';
  button.textContent = '!';
  button.addEventListener('click', async () => {
    button.disabled = true;
    const resp = await fetch(`${gameChatApiUrl(roomId)}/report`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lineId: line.id, reason: 'Chat message report' }),
    }).catch(() => null);
    if (resp?.ok || resp?.status === 409) {
      button.textContent = 'reported';
      button.title = 'Reported';
      button.classList.add('is-reported');
      return;
    }
    button.disabled = false;
    button.title = 'Report failed';
  });
  return button;
}

function renderStatus(container: HTMLElement, text: string): void {
  container.replaceChildren();
  const status = document.createElement('p');
  status.className = 'review-spectator-chat__empty';
  status.textContent = text;
  container.append(status);
}

function appendChatText(container: HTMLElement, text: string): void {
  let cursor = 0;
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const index = match.index ?? cursor;
    if (index > cursor) container.append(document.createTextNode(text.slice(cursor, index)));
    const token = document.createElement('span');
    token.className = 'review-spectator-chat__token';
    token.textContent = match[0];
    container.append(token);
    cursor = index + match[0].length;
  }
  if (cursor < text.length) container.append(document.createTextNode(text.slice(cursor)));
}

async function fetchGameChat(roomId: string): Promise<ChatState | null> {
  try {
    const response = await fetch(gameChatApiUrl(roomId));
    if (!response.ok) return null;
    return (await response.json()) as ChatState;
  } catch {
    return null;
  }
}

class ChatPostError extends Error {
  constructor(readonly code: string | undefined) {
    super(code ?? 'chat_post_failed');
  }
}

async function postGameChatLine(roomId: string, text: string): Promise<ChatLine> {
  const response = await fetch(gameChatApiUrl(roomId), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ChatPostError(data.error);
  }
  const data = (await response.json()) as { line: ChatLine };
  return data.line;
}

function postErrorCopy(error: string | undefined): string {
  if (error === 'rate_limited' || error === 'repeated_message') return 'Please slow down.';
  if (error === 'links_not_allowed') return 'Links are not available for this account yet.';
  if (error === 'timed_out') return 'You are temporarily timed out from chat.';
  return 'Could not send that message.';
}
