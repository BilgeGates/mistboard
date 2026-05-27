import type { Color, PlayerView } from '@mistboard/game';
import type { LiveRefs } from './live-state.js';
import { liveState } from './live-state.js';
import { currentView } from './live-view.js';
import { isColor, oppositeColor } from './web-utils.js';

type RoomActionRefs = Pick<LiveRefs, 'roomActions'>;
type SendSocket = (payload: unknown) => boolean;

type RoomActionDeps = {
  sendSocket: SendSocket;
  shouldRequestHiddenDraft960ForPlayAgain: () => boolean;
};

let playAgainStatus: 'idle' | 'creating' | 'failed' = 'idle';

export type PlayAgainRoomRequestBody = {
  mode: 'pvp' | 'pve';
  variant: string;
  hiddenDraft960: boolean;
  engineId?: string;
  preferredColor?: Color;
};

export function renderRoomActions(refs: RoomActionRefs, deps: RoomActionDeps): void {
  const view = currentView();
  const actions: HTMLElement[] = [roomAction('Back home', '/')];
  if (shouldShowPostGameRoomActions(view)) {
    if (liveState.roomMode === 'pvp' && isColor(liveState.seat)) {
      for (const el of rematchButtons(deps.sendSocket)) actions.unshift(el);
    } else if (liveState.roomMode === 'pve') {
      actions.unshift(playAgainButton(refs, deps));
    }
    actions.unshift(
      roomAction('Review game', `/game/${encodeURIComponent(liveState.room)}`, 'primary'),
    );
    refs.roomActions.replaceChildren(...actions);
    return;
  }
  if (liveState.roomMode === 'pvp' && view?.status.type === 'pregame' && isColor(liveState.seat)) {
    actions.unshift(copyLinkButton());
  }
  if (liveState.engineRequested) actions.push(roomAction('New Debug Room', 'dark-chess', 'engine'));
  refs.roomActions.replaceChildren(...actions);
}

export function shouldShowPostGameRoomActions(view: PlayerView | null): boolean {
  return view?.status.type === 'finished' || liveState.state?.status.type === 'finished';
}

function copyLinkButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'primary';
  btn.textContent = 'Copy invite link';
  btn.addEventListener('click', () => {
    navigator.clipboard
      .writeText(window.location.href)
      .then(() => {
        btn.textContent = 'Link copied!';
        setTimeout(() => {
          btn.textContent = 'Copy invite link';
        }, 2000);
      })
      .catch(() => {});
  });
  return btn;
}

function rematchButtons(sendSocket: SendSocket): HTMLElement[] {
  const mySeat = liveState.seat;
  if (mySeat !== 'white' && mySeat !== 'black') return [];
  const theirSeat: 'white' | 'black' = mySeat === 'white' ? 'black' : 'white';
  const offers = liveState.rematch.offers;
  const iOffered = offers[mySeat];
  const theyOffered = offers[theirSeat];

  if (iOffered && theyOffered) {
    // Both confirmed; redirect is imminent. Show a brief affordance.
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.disabled = true;
    btn.textContent = 'Starting rematch…';
    return [btn];
  }
  if (iOffered) {
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = '';
    cancel.textContent = 'Cancel rematch';
    cancel.addEventListener('click', () => {
      sendSocket({ type: 'rematch:cancel' });
    });
    const waiting = document.createElement('span');
    waiting.className = 'room-actions-note';
    waiting.textContent = 'Waiting for opponent…';
    return [waiting, cancel];
  }
  if (theyOffered) {
    const accept = document.createElement('button');
    accept.type = 'button';
    accept.className = 'primary';
    accept.textContent = 'Accept rematch';
    accept.addEventListener('click', () => {
      sendSocket({ type: 'rematch:offer' });
    });
    const decline = document.createElement('button');
    decline.type = 'button';
    decline.textContent = 'Decline';
    decline.addEventListener('click', () => {
      sendSocket({ type: 'rematch:decline' });
    });
    return [decline, accept];
  }
  const offer = document.createElement('button');
  offer.type = 'button';
  offer.textContent = 'Rematch';
  offer.addEventListener('click', () => {
    sendSocket({ type: 'rematch:offer' });
  });
  return [offer];
}

function roomAction(
  label: string,
  href: string,
  toneOrDev?: 'primary' | 'engine',
): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = toneOrDev === 'engine' ? roomUrl('dark-chess', 'engine') : href;
  if (toneOrDev === 'primary') link.className = 'primary';
  link.textContent = label;
  return link;
}

function playAgainButton(refs: RoomActionRefs, deps: RoomActionDeps): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = playAgainStatus === 'failed' ? 'danger' : '';
  button.disabled = playAgainStatus === 'creating';
  button.textContent =
    playAgainStatus === 'creating'
      ? 'Creating'
      : playAgainStatus === 'failed'
        ? 'Try play again'
        : 'Play again';
  button.addEventListener('click', () => {
    void createPlayAgainRoom(refs, deps);
  });
  return button;
}

async function createPlayAgainRoom(refs: RoomActionRefs, deps: RoomActionDeps): Promise<void> {
  const body = buildPlayAgainRoomRequestBody({
    shouldRequestHiddenDraft960: deps.shouldRequestHiddenDraft960ForPlayAgain,
  });
  if (!body) return;
  playAgainStatus = 'creating';
  renderRoomActions(refs, deps);
  try {
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`room creation failed: ${response.status}`);
    const data = (await response.json()) as { url?: string };
    if (!data.url) throw new Error('room creation response missing url');
    window.location.assign(data.url);
  } catch (err) {
    console.warn(err);
    playAgainStatus = 'failed';
    renderRoomActions(refs, deps);
  }
}

export function buildPlayAgainRoomRequestBody(opts: {
  shouldRequestHiddenDraft960: () => boolean;
}): PlayAgainRoomRequestBody | null {
  if (liveState.roomMode !== 'pvp' && liveState.roomMode !== 'pve') return null;
  const preferredColor =
    liveState.roomMode === 'pve' && isColor(liveState.seat)
      ? oppositeColor(liveState.seat)
      : undefined;
  return {
    mode: liveState.roomMode,
    variant:
      currentView()?.variant ??
      liveState.state?.variant ??
      liveState.variantRequested ??
      'dark-chess',
    hiddenDraft960: opts.shouldRequestHiddenDraft960(),
    ...(liveState.roomMode === 'pve' && liveState.pveEngineId
      ? { engineId: liveState.pveEngineId }
      : {}),
    ...(preferredColor ? { preferredColor } : {}),
  };
}

function roomUrl(variant: PlayerView['variant'], dev?: 'engine'): string {
  const params = new URLSearchParams({
    reset: '1',
    room: crypto.randomUUID(),
  });
  params.set('variant', variant);
  if (dev) params.set('dev', dev);
  return `/?${params}`;
}
