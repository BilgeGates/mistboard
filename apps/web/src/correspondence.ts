import './correspondence.css';
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
  root.replaceChildren(buildNav(), buildCorrespondenceSection(data));
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
  sub.textContent =
    data.yourMoveCount > 0
      ? `${data.yourMoveCount} ${data.yourMoveCount === 1 ? 'game needs' : 'games need'} your move`
      : 'No games waiting on you';
  header.append(title, sub);
  section.append(header);

  if (data.games.length === 0) {
    section.append(buildEmptyState());
    return section;
  }

  const yourMove = data.games.filter((game) => game.isYourMove);
  const waiting = data.games.filter((game) => !game.isYourMove);
  if (yourMove.length > 0) section.append(buildGameGroup('Your move', yourMove));
  if (waiting.length > 0) section.append(buildGameGroup('Waiting on opponent', waiting));
  return section;
}

function buildEmptyState(): HTMLElement {
  const empty = document.createElement('section');
  empty.className = 'correspondence-empty';
  const title = document.createElement('h2');
  title.textContent = 'No correspondence games yet';
  const body = document.createElement('p');
  body.textContent = 'Start one from the home page and make a move whenever it suits you.';
  const cta = document.createElement('a');
  cta.className = 'correspondence-cta';
  cta.href = '/';
  cta.textContent = 'Start a game';
  empty.append(title, body, cta);
  return empty;
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
