// Shared profile-surface primitives, used by the player profile (/@handle) and
// the engine profile (/engine/:id) so the two render as siblings. The header
// shell and the game-row are identical across both subjects; only the middle
// block (rating buckets vs engine records) differs and stays per-page.
import { displayParticipantName, type FeaturedGame, sourceLabel } from './game-display.js';
import { timeControlLabelForGame } from './game-meta.js';

// Header shell: eyebrow + heading + a dot-separated meta line. Callers build the
// subject-specific meta spans (handle/joined/role for a user, id/games for an
// engine); the shell joins them with ' · ' so the markup matches across pages.
export function buildProfileHeaderShell(opts: {
  eyebrow: string;
  title: string;
  metaParts: HTMLElement[];
}): HTMLElement {
  const header = document.createElement('section');
  header.className = 'profile-header';

  const eyebrow = document.createElement('span');
  eyebrow.className = 'account-eyebrow';
  eyebrow.textContent = opts.eyebrow;

  const title = document.createElement('h1');
  title.className = 'site-section-heading';
  title.textContent = opts.title;

  const meta = document.createElement('p');
  meta.className = 'account-copy profile-header-meta';
  opts.metaParts.forEach((part, index) => {
    if (index > 0) meta.append(document.createTextNode(' · '));
    meta.append(part);
  });

  header.append(eyebrow, title, meta);
  return header;
}

// One finished-game row from the subject's perspective (game.playerColor is the
// subject's seat). Works for a human or an engine seat alike.
export function buildProfileGameRow(game: FeaturedGame): HTMLElement {
  const item = document.createElement('li');
  const link = document.createElement('a');
  link.href = profileGameHref(game);
  link.className = 'profile-game-row';
  const tone = profileResultTone(game);
  link.classList.add(`profile-game-row-${tone}`);

  const outcome = document.createElement('span');
  outcome.className = `profile-game-outcome profile-game-outcome-${tone}`;
  outcome.textContent = profileResultLabel(game);

  const body = document.createElement('span');
  body.className = 'profile-game-body';

  const topLine = document.createElement('span');
  topLine.className = 'profile-game-topline';

  const opponent = document.createElement('span');
  opponent.className = 'profile-game-opponent';
  opponent.textContent = `vs ${profileOpponentName(game)}`;

  const date = document.createElement('span');
  date.className = 'profile-game-date';
  date.textContent = formatGameDate(game.endedAt);

  topLine.append(opponent, date);

  // Only a head-to-head human (pvp) game can ever be rated; anything vs an
  // engine, EvE, or imported is casual by definition. Gate on mode first so a
  // stray rated=true on a non-pvp row (e.g. legacy games backfilled by the
  // rated migration's DEFAULT true) never mislabels it. For pvp, trust the flag.
  const isCasual = game.mode !== 'pvp' || game.rated === false;
  const details = document.createElement('span');
  details.className = 'profile-game-details';
  details.append(
    buildGameDetail(profileGameSpecLabel(game), 'profile-game-variant'),
    buildGameDetail(profileSideLabel(game), 'profile-game-side'),
    buildGameDetail(
      isCasual ? 'Casual' : 'Rated',
      isCasual ? 'profile-game-casual' : 'profile-game-rated',
    ),
  );
  // Time control sits with the leading fixed-width pills (see CSS) when present;
  // clockless games (engine self-play) simply omit it.
  const timeControl = timeControlLabelForGame(game);
  if (timeControl) details.append(buildGameDetail(timeControl, 'profile-game-tc'));
  details.append(
    buildGameDetail(sourceLabel(game.mode)),
    buildGameDetail(`${game.plyCount} plies`),
  );

  body.append(topLine, details);
  link.append(outcome, body);
  item.append(link);
  return item;
}

function buildGameDetail(label: string, extraClass?: string): HTMLElement {
  const pill = document.createElement('span');
  pill.className = extraClass ? `profile-game-detail ${extraClass}` : 'profile-game-detail';
  pill.textContent = label;
  return pill;
}

function profileOpponentName(game: FeaturedGame): string {
  const color = game.playerColor ?? 'white';
  return displayParticipantName(game, opponentColor(game, color));
}

function profileSideLabel(game: FeaturedGame): string {
  if (game.playerColor === 'red') return 'Red';
  if (game.playerColor === 'black') return 'Black';
  return 'White';
}

function profileGameSpecLabel(game: FeaturedGame): string {
  if (isCrossroadsChessVariant(game)) return 'Crossroads Chess';
  if (game.variant === 'dark-mini-xiangqi') return 'Dark Mini Xiangqi';
  if (game.variant === 'dark-xiangqi') return 'Dark Xiangqi';
  if (
    game.variant === 'dark-draft960' ||
    game.variant === 'fog-draft960' ||
    game.variant === 'draft960'
  )
    return 'Dark Draft960';
  return 'Dark Chess';
}

function profileResultLabel(game: FeaturedGame): string {
  if (game.result === 'draw') return 'Draw';
  if (game.playerColor === 'red') return game.result === 'red-wins' ? 'Win' : 'Loss';
  if (game.playerColor === 'black') return game.result === 'black-wins' ? 'Win' : 'Loss';
  return game.result === 'white-wins' ? 'Win' : 'Loss';
}

function profileResultTone(game: FeaturedGame): 'win' | 'loss' | 'draw' {
  const result = profileResultLabel(game);
  if (result === 'Win') return 'win';
  if (result === 'Loss') return 'loss';
  return 'draw';
}

function formatGameDate(value: string | undefined): string {
  if (!value) return 'Finished game';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Finished game';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    date,
  );
}

function opponentColor(
  game: FeaturedGame,
  color: FeaturedGame['playerColor'],
): 'white' | 'black' | 'red' {
  if (color === 'red') return isCrossroadsChessVariant(game) ? 'white' : 'black';
  if (color === 'white' && isCrossroadsChessVariant(game)) return 'red';
  if (color === 'black' && isXiangqiVariant(game)) return 'red';
  if (color === 'black') return 'white';
  return 'black';
}

function profileGameHref(game: FeaturedGame): string {
  if (isCrossroadsChessVariant(game)) {
    return `/crossroads-chess/game/${encodeURIComponent(game.roomId)}`;
  }
  if (game.variant === 'dark-mini-xiangqi') {
    return `/dark-mini-xiangqi/game/${encodeURIComponent(game.roomId)}`;
  }
  if (game.variant === 'dark-xiangqi') {
    return `/dark-xiangqi/game/${encodeURIComponent(game.roomId)}`;
  }
  return `/game/${encodeURIComponent(game.roomId)}`;
}

function isXiangqiVariant(game: FeaturedGame): boolean {
  return game.variant === 'dark-mini-xiangqi' || game.variant === 'dark-xiangqi';
}

function isCrossroadsChessVariant(game: FeaturedGame): boolean {
  return game.variant === 'crossroads-chess' || game.variant === 'dual-chess';
}
