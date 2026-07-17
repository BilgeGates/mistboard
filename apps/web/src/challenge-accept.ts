import './challenge.css';
import { firstMoverColorName, secondMoverColorName, variantDisplayLabel } from './game-display.js';
import { buildLoadingState, buildNav, buildNotice } from './site-shell.js';

// The challenge landing page (/challenge/:id): where a shared "play me" link or
// a direct challenge is opened. Reads GET /api/correspondence/seeks/:id and
// renders the right action — accept, decline, or (for the creator) the share
// link — from the server's canAccept / canDecline / isMine flags.

type ChallengeView = {
  id: string;
  gameSpecId: string;
  daysPerMove: number;
  // Move order, not color (server migration 106).
  preferredColor: 'first' | 'second' | 'random';
  visibility: 'public' | 'private';
  challengerName: string | null;
  isMine: boolean;
  canAccept: boolean;
  canDecline: boolean;
  expired: boolean;
};

function specLabel(gameSpecId: string): string {
  return variantDisplayLabel(gameSpecId);
}

function colorLabel(gameSpecId: string, color: ChallengeView['preferredColor']): string {
  if (color === 'random') return 'random colors';
  // The challenger picked their side; the accepter takes the OTHER, so the label names the
  // opposite of what the challenger chose.
  return color === 'first'
    ? `you play ${secondMoverColorName(gameSpecId)}`
    : `you play ${firstMoverColorName(gameSpecId)}`;
}

export async function mountChallengeAccept(root: HTMLElement, challengeId: string): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page');
  root.append(buildNav(), buildLoadingState('Loading challenge'));

  const res = await fetch(`/api/correspondence/seeks/${encodeURIComponent(challengeId)}`).catch(
    () => null,
  );

  const shell = (node: HTMLElement) => {
    root.replaceChildren(buildNav(), node);
  };

  if (!res) {
    shell(
      buildNotice('Challenge unavailable', 'Could not load this challenge. Check your connection.'),
    );
    return;
  }
  if (res.status === 401) {
    const notice = buildNotice('Sign in to play', 'Sign in to see and accept this challenge.');
    const signIn = document.createElement('a');
    signIn.className = 'challenge-btn';
    // Return here after signing in so the link converts a click into a game.
    signIn.href = `/account?return=${encodeURIComponent(`/challenge/${challengeId}`)}`;
    signIn.textContent = 'Sign in';
    notice.append(signIn);
    shell(notice);
    return;
  }
  if (res.status === 404) {
    shell(
      buildNotice('Challenge not found', 'This challenge does not exist or has been withdrawn.'),
    );
    return;
  }
  const view = (await res.json().catch(() => null)) as ChallengeView | null;
  if (!view) {
    shell(buildNotice('Challenge unavailable', 'Could not load this challenge.'));
    return;
  }

  shell(buildChallengeCard(view));
}

function buildChallengeCard(view: ChallengeView): HTMLElement {
  const card = document.createElement('section');
  card.className = 'challenge-card';

  const heading = document.createElement('h1');
  heading.className = 'challenge-heading';
  if (view.isMine) heading.textContent = 'Your challenge';
  else if (view.challengerName) heading.textContent = `${view.challengerName} challenged you`;
  else heading.textContent = 'You have been challenged';
  card.append(heading);

  const detail = document.createElement('p');
  detail.className = 'challenge-subhead';
  detail.textContent = `${specLabel(view.gameSpecId)} · ${view.daysPerMove} day${
    view.daysPerMove === 1 ? '' : 's'
  }/move · ${colorLabel(view.gameSpecId, view.preferredColor)}`;
  card.append(detail);

  if (view.expired) {
    const note = document.createElement('p');
    note.className = 'challenge-status';
    note.textContent = 'This challenge has expired.';
    card.append(note);
    return card;
  }

  const actions = document.createElement('div');
  actions.className = 'challenge-actions';

  const status = document.createElement('p');
  status.className = 'challenge-status';
  status.hidden = true;

  if (view.isMine) {
    // The creator sees the shareable link and can copy it.
    const share = document.createElement('input');
    share.className = 'challenge-share-link';
    share.readOnly = true;
    share.value = `${location.origin}/challenge/${view.id}`;
    share.addEventListener('focus', () => share.select());
    card.append(share);

    const copy = document.createElement('button');
    copy.className = 'challenge-btn';
    copy.textContent = 'Copy link';
    copy.addEventListener('click', () => {
      void navigator.clipboard?.writeText(share.value);
      copy.textContent = 'Copied';
    });
    actions.append(copy);
  }

  if (view.canAccept) {
    const accept = document.createElement('button');
    accept.className = 'challenge-btn';
    accept.textContent = 'Accept';
    accept.addEventListener('click', () => {
      accept.disabled = true;
      status.hidden = true;
      void fetch(`/api/correspondence/seeks/${encodeURIComponent(view.id)}/accept`, {
        method: 'POST',
      })
        .then(async (res) => {
          const body = (await res.json().catch(() => null)) as {
            url?: string;
            error?: string;
          } | null;
          if (res.ok && body?.url) {
            location.href = body.url;
            return;
          }
          status.textContent =
            body?.error === 'challenge_expired'
              ? 'This challenge has expired.'
              : body?.error === 'seek_taken'
                ? 'This challenge was already accepted.'
                : 'Could not accept. Try again.';
          status.hidden = false;
          accept.disabled = false;
        })
        .catch(() => {
          status.textContent = 'Could not accept. Try again.';
          status.hidden = false;
          accept.disabled = false;
        });
    });
    actions.append(accept);
  }

  if (view.canDecline) {
    const decline = document.createElement('button');
    decline.className = 'challenge-btn-secondary';
    decline.textContent = 'Decline';
    decline.addEventListener('click', () => {
      decline.disabled = true;
      void fetch(`/api/correspondence/seeks/${encodeURIComponent(view.id)}/decline`, {
        method: 'POST',
      })
        .then(() => {
          card.replaceChildren(buildNotice('Declined', 'You declined this challenge.'));
        })
        .catch(() => {
          decline.disabled = false;
        });
    });
    actions.append(decline);
  }

  card.append(actions, status);
  return card;
}
