import './correspondence.css';
import { DAYS_PER_MOVE_OPTIONS } from '@mistboard/game';
import { buildLoadingState, buildNav, buildNotice } from './site-shell.js';
import { formatDayClock } from './web-utils.js';

// One in-flight correspondence game, as served by GET /api/correspondence/games
// (your-move-first). Mirrors the route's response shape.
type CorrespondenceGame = {
  roomId: string;
  url: string;
  gameSpecId: string;
  mySeat: string;
  isYourMove: boolean;
  opponentName: string | null;
  dueAt: string;
};

type CorrespondenceGamesResponse = {
  games: CorrespondenceGame[];
  yourMoveCount: number;
};

// One open seek, as served by GET /api/correspondence/seeks. A standing
// invitation anyone (but its creator) can accept to start a game.
type CorrespondenceSeek = {
  id: string;
  gameSpecId: string;
  daysPerMove: number;
  preferredColor: 'white' | 'black' | 'random';
  creatorName: string | null;
  createdAt: string;
  isMine: boolean;
};

type CorrespondenceSeeksResponse = { seeks: CorrespondenceSeek[] };

export async function mountCorrespondence(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page', 'correspondence-page');
  root.append(buildNav(), buildLoadingState('Loading your games'));

  const resp = await fetch('/api/correspondence/games').catch(() => null);
  if (resp?.status === 401) {
    root.replaceChildren(buildNav(), buildSignInPrompt());
    return;
  }
  if (!resp?.ok) {
    root.replaceChildren(
      buildNav(),
      buildNotice('Games unavailable', 'Your correspondence games could not be loaded right now.'),
    );
    return;
  }
  const data = (await resp.json()) as CorrespondenceGamesResponse;
  const section = buildCorrespondenceSection(data);
  // The open-seek board is always shown to a signed-in player — with no games of
  // your own it's the focus (no redirect-to-home card), so the page is
  // self-sufficient for starting an async game against a stranger.
  const seekBoard = document.createElement('section');
  seekBoard.className = 'correspondence-group correspondence-seekboard';
  section.append(seekBoard);
  // The other way to start one — a specific opponent — lives on the home page.
  section.append(buildFriendLink());
  root.replaceChildren(buildNav(), section);
  void renderSeekBoard(seekBoard);
}

function buildSignInPrompt(): HTMLElement {
  const notice = buildNotice(
    'Sign in to see your games',
    'Correspondence games are tied to your account so you can pick them up from any device.',
  );
  const link = document.createElement('a');
  link.className = 'correspondence-cta';
  link.href = '/account?tab=login';
  link.textContent = 'Sign in';
  notice.append(link);
  return notice;
}

function buildCorrespondenceSection(data: CorrespondenceGamesResponse): HTMLElement {
  const section = document.createElement('main');
  section.className = 'correspondence-shell';

  const header = document.createElement('header');
  header.className = 'correspondence-header';
  const title = document.createElement('h1');
  title.textContent = 'Correspondence';
  const sub = document.createElement('p');
  sub.className = 'correspondence-subtitle';
  sub.textContent = correspondenceStatus(data);
  header.append(title, sub);
  section.append(header);

  // Your games — rendered only when there are any. With none, the open-seek
  // board below carries the page.
  const yourMove = data.games.filter((game) => game.isYourMove);
  const waiting = data.games.filter((game) => !game.isYourMove);
  if (yourMove.length > 0) section.append(buildGameGroup('Your move', yourMove));
  if (waiting.length > 0) section.append(buildGameGroup('Waiting on opponent', waiting));
  return section;
}

function correspondenceStatus(data: CorrespondenceGamesResponse): string {
  if (data.games.length === 0) return 'No games in progress';
  if (data.yourMoveCount > 0) {
    return `${data.yourMoveCount} ${data.yourMoveCount === 1 ? 'game needs' : 'games need'} your move`;
  }
  return 'No games waiting on you';
}

function buildFriendLink(): HTMLElement {
  const note = document.createElement('p');
  note.className = 'correspondence-friend-link';
  note.append(document.createTextNode('Want a specific opponent? '));
  const link = document.createElement('a');
  link.href = '/';
  link.textContent = 'Challenge a friend →';
  note.append(link);
  return note;
}

function buildGameGroup(label: string, games: CorrespondenceGame[]): HTMLElement {
  const group = document.createElement('section');
  group.className = 'correspondence-group';
  const heading = document.createElement('h2');
  heading.className = 'correspondence-group-heading';
  heading.textContent = `${label} (${games.length})`;
  const list = document.createElement('ol');
  list.className = 'correspondence-list';
  for (const game of games) list.append(buildGameRow(game));
  group.append(heading, list);
  return group;
}

function buildGameRow(game: CorrespondenceGame): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'correspondence-item';

  const row = document.createElement('a');
  row.className = 'correspondence-row';
  row.href = game.url;
  if (game.isYourMove) row.classList.add('is-your-move');

  const opponent = document.createElement('span');
  opponent.className = 'correspondence-opponent';
  opponent.textContent = `vs ${game.opponentName ?? 'Opponent'}`;

  const turn = document.createElement('span');
  turn.className = 'correspondence-turn';
  turn.textContent = game.isYourMove ? 'Your move' : 'Their move';

  const deadline = document.createElement('span');
  deadline.className = 'correspondence-deadline';
  deadline.textContent = deadlineLabel(game.dueAt);

  row.append(opponent, turn, deadline);
  item.append(row);
  return item;
}

// Time left until the per-move deadline, reusing the day-scale clock formatter
// (the same "3d 4h" / "5h 12m" the room clock shows). Past-due rooms are a
// transient state — the sweeper flags them within its interval — so clamp to 0.
function deadlineLabel(dueAt: string): string {
  const remainingMs = Date.parse(dueAt) - Date.now();
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return 'due now';
  return `${formatDayClock(remainingMs)} left`;
}

// The open-seek board: fetch + render in place. Re-invoked (not a full reload)
// after a post / join / cancel so the list stays current.
async function renderSeekBoard(container: HTMLElement): Promise<void> {
  const headerRow = document.createElement('div');
  headerRow.className = 'correspondence-seek-header';
  const heading = document.createElement('h2');
  heading.className = 'correspondence-group-heading';
  heading.textContent = 'Open games · anyone can join';
  headerRow.append(heading);

  const resp = await fetch('/api/correspondence/seeks').catch(() => null);
  if (!resp?.ok) {
    container.replaceChildren(
      headerRow,
      buildNotice('Open games unavailable', 'The seek board could not be loaded right now.'),
    );
    return;
  }
  const { seeks } = (await resp.json()) as CorrespondenceSeeksResponse;
  const refresh = (): void => {
    void renderSeekBoard(container);
  };

  // "Post a game" is a secondary trigger that reveals the form, so the only
  // green primary in this section is the form's Create button.
  const form = buildPostSeekForm(refresh);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'correspondence-seek-toggle';
  toggle.textContent = 'Post a game';
  toggle.addEventListener('click', () => {
    form.hidden = !form.hidden;
    toggle.classList.toggle('is-open', !form.hidden);
    if (!form.hidden) form.querySelector('select')?.focus();
  });
  headerRow.append(toggle);

  const children: Node[] = [headerRow, form];
  if (seeks.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'correspondence-seek-empty';
    empty.textContent = 'No open games yet. Post one and someone can join whenever they like.';
    children.push(empty);
  } else {
    const list = document.createElement('ol');
    list.className = 'correspondence-list correspondence-seek-list';
    for (const seek of seeks) list.append(buildSeekRow(seek, refresh));
    children.push(list);
  }
  container.replaceChildren(...children);
}

// The post form, hidden until "Post a game" reveals it. On success the whole
// board re-renders so the new seek shows up immediately.
function buildPostSeekForm(onPosted: () => void): HTMLFormElement {
  const form = document.createElement('form');
  form.className = 'correspondence-post-form';
  form.hidden = true;

  const days = document.createElement('select');
  days.className = 'correspondence-post-field';
  days.setAttribute('aria-label', 'Days per move');
  for (const option of DAYS_PER_MOVE_OPTIONS) {
    const opt = document.createElement('option');
    opt.value = String(option);
    opt.textContent = `${option} day${option === 1 ? '' : 's'}/move`;
    days.append(opt);
  }
  days.value = String(DAYS_PER_MOVE_OPTIONS[1] ?? DAYS_PER_MOVE_OPTIONS[0]);

  const color = document.createElement('select');
  color.className = 'correspondence-post-field';
  color.setAttribute('aria-label', 'Your color');
  for (const [value, label] of [
    ['random', 'Random color'],
    ['white', 'Play White'],
    ['black', 'Play Black'],
  ] as const) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    color.append(opt);
  }

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'correspondence-cta';
  submit.textContent = 'Create';

  const error = document.createElement('p');
  error.className = 'correspondence-post-error';
  error.hidden = true;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit.disabled = true;
    error.hidden = true;
    void fetch('/api/correspondence/seeks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ daysPerMove: Number(days.value), preferredColor: color.value }),
    })
      .then(async (res) => {
        if (res.ok) {
          onPosted();
          return;
        }
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          limit?: number;
        } | null;
        error.textContent =
          body?.error === 'seek_limit_reached'
            ? `You can have up to ${body.limit ?? 6} open games at once.`
            : 'Could not post that game. Try again.';
        error.hidden = false;
        submit.disabled = false;
      })
      .catch(() => {
        error.textContent = 'Could not post that game. Try again.';
        error.hidden = false;
        submit.disabled = false;
      });
  });

  form.append(days, color, submit, error);
  return form;
}

function buildSeekRow(seek: CorrespondenceSeek, onChange: () => void): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'correspondence-item correspondence-seek-item';

  const row = document.createElement('div');
  row.className = 'correspondence-row';

  const who = document.createElement('span');
  who.className = 'correspondence-opponent';
  who.textContent = seek.isMine ? 'You' : (seek.creatorName ?? 'Player');

  const detail = document.createElement('span');
  detail.className = 'correspondence-turn';
  detail.textContent = `${seekColorLabel(seek.preferredColor)} · ${seek.daysPerMove} day${
    seek.daysPerMove === 1 ? '' : 's'
  }/move`;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'correspondence-cta correspondence-seek-action';
  if (seek.isMine) {
    button.textContent = 'Cancel';
    button.classList.add('is-cancel');
    button.addEventListener('click', () => {
      button.disabled = true;
      void fetch(`/api/correspondence/seeks/${encodeURIComponent(seek.id)}`, { method: 'DELETE' })
        .then(() => onChange())
        .catch(() => {
          button.disabled = false;
        });
    });
  } else {
    button.textContent = 'Join';
    button.addEventListener('click', () => {
      button.disabled = true;
      void fetch(`/api/correspondence/seeks/${encodeURIComponent(seek.id)}/accept`, {
        method: 'POST',
      })
        .then(async (res) => {
          if (res.ok) {
            const body = (await res.json().catch(() => null)) as { url?: string } | null;
            if (body?.url) {
              window.location.href = body.url;
              return;
            }
          }
          // 409 seek_taken (someone beat us) or an error: refresh the board so
          // the now-gone seek drops off.
          onChange();
        })
        .catch(() => {
          button.disabled = false;
        });
    });
  }

  row.append(who, detail, button);
  item.append(row);
  return item;
}

function seekColorLabel(color: CorrespondenceSeek['preferredColor']): string {
  if (color === 'white') return 'Plays White';
  if (color === 'black') return 'Plays Black';
  return 'Either color';
}
