// Profile + leaderboard pages — extracted from landing.ts.

import type { RatingVariant } from '@mistboard/game';
import './account-profile.css';
import type { FeaturedGame } from './game-display.js';
import { buildProfileGameRow, buildProfileHeaderShell } from './profile-ui.js';
import { buildLoadingState, buildNav, buildNotice } from './site-shell.js';
import { renderVariantMiniBoard, type VariantMiniId } from './variant-mini-boards.js';
import { leaderboardVariants, profileRatingVariants, variantMiniIdForRating } from './variants.js';

type ProfileRatingVariant = RatingVariant;
type ProfileRatingTimeClass = 'bullet' | 'blitz' | 'rapid';
type ProfileBucketRating = {
  variant: ProfileRatingVariant;
  timeClass: ProfileRatingTimeClass;
  eloRating: number | null;
  ratedGamesPlayed: number;
  totalGamesPlayed: number;
  provisional: boolean;
};

type UserProfile = {
  isViewer?: boolean;
  user: {
    handle: string;
    displayName: string;
    profileVisibility: 'private' | 'unlisted' | 'public';
    accountRole: 'player' | 'admin';
    createdAt: string;
  };
  ratings: ProfileBucketRating[];
  games: FeaturedGame[];
  gamesTotal: number;
};

// First page is delivered with the profile; "Load more" pulls subsequent pages.
const PROFILE_GAMES_PAGE = 15;

type LeaderboardEntry = {
  rank: number;
  handle: string;
  displayName: string;
  eloRating: number;
  gamesPlayed: number;
  provisional: boolean;
};

const LEADERBOARD_BUCKETS: {
  variantParam: string;
  variantLabel: string;
  miniId: VariantMiniId;
}[] = leaderboardVariants.map((v) => ({
  variantParam: v.apiParam,
  variantLabel: v.label,
  miniId: v.miniId,
}));

const PROFILE_VARIANT_LABEL: Record<ProfileRatingVariant, string> = {
  fog: 'Dark Chess',
  fog_draft960: 'Dark Draft960',
  dark_mini_xiangqi: 'Dark Mini Xiangqi',
  crossroads_chess_open: 'Crossroads Chess',
  jieqi: 'Jieqi',
  banqi: 'Banqi',
  reveal_chess: 'Reveal Chess',
};

// Profile rating grid is subject-scoped: render-capable soft-launch variants can
// show here before they are advertised on the public leaderboard.
const PROFILE_VARIANT_ORDER: ProfileRatingVariant[] = profileRatingVariants.map((v) => v.id);

export async function mountProfile(root: HTMLElement, handle: string): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page', 'profile-route');
  root.append(buildNav(), buildLoadingState('Loading profile'));

  const shell = document.createElement('main');
  shell.className = 'profile-shell';
  root.replaceChildren(buildNav(), shell);

  const profile = await fetchUserProfile(handle).catch((err) => {
    console.warn(err);
    return null;
  });
  if (!profile) {
    document.title = 'Profile not found · Mistboard';
    shell.append(buildNotice('Profile not found', 'This profile is private or does not exist.'));
    return;
  }

  shell.append(
    buildProfileHeader(profile),
    buildProfileRatings(profile.ratings),
    buildProfileGames(profile),
  );
}

export async function mountLeaderboard(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page');

  const shell = document.createElement('main');
  shell.className = 'site-section leaderboard-shell';
  root.append(buildNav(), shell);

  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = 'Leaderboard';

  const banner = buildLeaderboardBanner();

  const grid = document.createElement('div');
  grid.className = 'leaderboard-grid';

  shell.append(heading, banner, grid);

  const results = await Promise.all(
    LEADERBOARD_BUCKETS.map((b) =>
      fetch(`/api/leaderboard?variant=${b.variantParam}&limit=10`)
        .then((r) =>
          r.ok
            ? (r.json() as Promise<{ leaderboard: LeaderboardEntry[] }>)
            : Promise.reject(r.status),
        )
        .catch((err) => {
          console.warn(err);
          return null;
        }),
    ),
  );

  for (let i = 0; i < LEADERBOARD_BUCKETS.length; i++) {
    const b = LEADERBOARD_BUCKETS[i];
    grid.append(buildLeaderboardPanel(b.variantLabel, b.miniId, results[i]));
  }
}

// Decorative variant mini-board (the same board-crop art as the picker/articles).
// aria-hidden because every call site already renders the variant name in text.
function buildVariantThumb(
  miniId: VariantMiniId,
  px: number,
  className: string,
  label: string,
): HTMLElement {
  const thumb = document.createElement('span');
  thumb.className = className;
  thumb.setAttribute('aria-hidden', 'true');
  thumb.innerHTML = renderVariantMiniBoard(miniId, { size: px, label });
  return thumb;
}

function buildLeaderboardBanner(): HTMLElement {
  const banner = document.createElement('section');
  banner.className = 'leaderboard-beta-banner';
  banner.setAttribute('aria-label', 'Rated beta status');

  const title = document.createElement('strong');
  title.textContent = 'Rated beta is coming.';

  const body = document.createElement('p');
  body.textContent =
    'The first ladder will be account-backed and may be provisional while ratings calibrate on real games.';

  const link = document.createElement('a');
  link.href = '/faq';
  link.textContent = 'How rated works';

  banner.append(title, body, link);
  return banner;
}

function buildLeaderboardPanel(
  variantLabel: string,
  miniId: VariantMiniId,
  data: { leaderboard: LeaderboardEntry[] } | null,
): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'leaderboard-panel';

  const header = document.createElement('div');
  header.className = 'leaderboard-panel-header';

  const heading = document.createElement('div');
  heading.className = 'leaderboard-panel-heading';

  const title = document.createElement('h2');
  title.className = 'leaderboard-panel-title';
  title.textContent = variantLabel;

  const subtitle = document.createElement('span');
  subtitle.className = 'leaderboard-panel-subtitle';
  subtitle.textContent = 'Blitz rating';

  heading.append(title, subtitle);
  header.append(
    buildVariantThumb(miniId, 44, 'leaderboard-panel-thumb', `${variantLabel} board`),
    heading,
  );
  panel.append(header);

  if (!data) {
    const msg = document.createElement('p');
    msg.className = 'leaderboard-panel-empty';
    msg.textContent = 'Could not load ratings.';
    panel.append(msg);
    return panel;
  }

  if (data.leaderboard.length === 0) {
    const msg = document.createElement('p');
    msg.className = 'leaderboard-panel-empty';
    msg.textContent = 'No rated games yet.';
    panel.append(msg);
    return panel;
  }

  panel.append(renderLeaderboardTable(data.leaderboard));
  return panel;
}

function renderLeaderboardTable(entries: LeaderboardEntry[]): HTMLTableElement {
  const table = document.createElement('table');
  table.className = 'leaderboard-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const label of ['#', 'Player', 'Games', 'Rating']) {
    const th = document.createElement('th');
    th.textContent = label;
    headerRow.append(th);
  }
  thead.append(headerRow);
  table.append(thead);

  const tbody = document.createElement('tbody');
  for (const entry of entries) {
    const tr = document.createElement('tr');

    const rankTd = document.createElement('td');
    rankTd.className = 'leaderboard-rank';
    rankTd.textContent = String(entry.rank);

    const nameTd = document.createElement('td');
    nameTd.className = 'leaderboard-player';
    const link = document.createElement('a');
    link.href = `/@/${encodeURIComponent(entry.handle)}`;
    link.textContent = entry.displayName;
    nameTd.append(link);

    const gamesTd = document.createElement('td');
    gamesTd.className = 'leaderboard-games';
    gamesTd.textContent = String(entry.gamesPlayed);

    const ratingTd = document.createElement('td');
    ratingTd.className = 'leaderboard-rating';
    // "?" marks a provisional rating (RD still high) — shown so the board isn't
    // empty at low liquidity, but flagged as not yet settled.
    ratingTd.textContent = entry.provisional ? `${entry.eloRating}?` : String(entry.eloRating);
    if (entry.provisional) ratingTd.classList.add('leaderboard-rating-provisional');

    tr.append(rankTd, nameTd, gamesTd, ratingTd);
    tbody.append(tr);
  }
  table.append(tbody);
  return table;
}

async function fetchUserProfile(handle: string): Promise<UserProfile | null> {
  const resp = await fetch(`/api/users/${encodeURIComponent(handle)}/profile`);
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`failed to load profile: ${resp.status}`);
  const data = (await resp.json()) as { profile: UserProfile };
  return data.profile;
}

function buildProfileHeader(profile: UserProfile): HTMLElement {
  const metaParts: HTMLElement[] = [];

  const joinedLabel = formatJoinedDate(profile.user.createdAt);
  if (joinedLabel) {
    const joined = document.createElement('span');
    joined.className = 'profile-joined';
    joined.textContent = `Joined ${joinedLabel}`;
    metaParts.push(joined);
  }

  const gameCount = document.createElement('span');
  gameCount.className = 'profile-game-count';
  gameCount.textContent = `${profile.gamesTotal} ${profile.gamesTotal === 1 ? 'game' : 'games'}`;
  metaParts.push(gameCount);

  const roleBadge = buildRoleBadge(profile.user.accountRole);
  if (roleBadge) metaParts.push(roleBadge);

  return buildProfileHeaderShell({
    eyebrow: profile.isViewer ? 'Your profile' : 'Player profile',
    title: `@${profile.user.handle}`,
    metaParts,
  });
}

function buildRoleBadge(role: UserProfile['user']['accountRole']): HTMLElement | null {
  if (role === 'admin') {
    const badge = document.createElement('span');
    badge.className = 'profile-role-badge profile-role-admin';
    badge.textContent = 'Admin';
    return badge;
  }
  return null;
}

function formatJoinedDate(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(date);
}

export function buildProfileRatings(ratings: ProfileBucketRating[]): HTMLElement {
  const section = document.createElement('section');
  section.className = 'profile-ratings';

  const heading = document.createElement('h2');
  heading.textContent = 'Rated';
  section.append(heading);

  const variantsShown = PROFILE_VARIANT_ORDER;

  if (variantsShown.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'profile-ratings-empty';
    empty.textContent = 'No rated games yet.';
    section.append(empty);
    return section;
  }

  const grid = document.createElement('div');
  grid.className = 'profile-ratings-grid';

  for (const variant of variantsShown) {
    const label = document.createElement('span');
    label.className = 'profile-ratings-variant';

    const miniId = variantMiniIdForRating(variant);
    if (miniId) {
      label.append(
        buildVariantThumb(
          miniId,
          36,
          'profile-ratings-variant-thumb',
          `${PROFILE_VARIANT_LABEL[variant]} board`,
        ),
      );
    }

    const name = document.createElement('span');
    name.className = 'profile-ratings-variant-name';
    name.textContent = PROFILE_VARIANT_LABEL[variant];
    label.append(name);

    grid.append(label);
    grid.append(buildRatingCell(ratings, variant));
  }

  section.append(grid);
  return section;
}

function buildRatingCell(
  ratings: ProfileBucketRating[],
  variant: ProfileRatingVariant,
): HTMLElement {
  const cell = document.createElement('div');
  cell.className = 'profile-rating-cell';

  const bucket = ratings.find((r) => r.variant === variant);

  const value = document.createElement('span');
  value.className = 'profile-rating-value';

  if (!bucket || bucket.totalGamesPlayed === 0) {
    cell.classList.add('profile-rating-cell-empty');
    value.textContent = '—';
    value.classList.add('profile-rating-value-empty');
    cell.append(value);
    return cell;
  }

  if (bucket.eloRating == null) {
    cell.classList.add('profile-rating-cell-unrated');
    value.textContent = 'Unrated';
    value.classList.add('profile-rating-value-unrated');
    cell.append(value);
    return cell;
  }

  cell.classList.add('profile-rating-cell-rated');
  // "?" marks a provisional rating (still settling). RD itself is not shown.
  value.textContent = bucket.provisional ? `${bucket.eloRating}?` : String(bucket.eloRating);
  if (bucket.provisional) value.classList.add('profile-rating-value-provisional');
  cell.append(value);

  if (bucket.ratedGamesPlayed > 0) {
    const count = document.createElement('span');
    count.className = 'profile-rating-games';
    count.textContent = `${bucket.ratedGamesPlayed} rated ${bucket.ratedGamesPlayed === 1 ? 'game' : 'games'}`;
    cell.append(count);
  }

  return cell;
}

function buildProfileGames(profile: UserProfile): HTMLElement {
  const section = document.createElement('section');
  section.className = 'profile-games';

  const heading = document.createElement('h2');
  heading.textContent = 'Games';
  section.append(heading);

  if (profile.gamesTotal === 0) {
    const empty = document.createElement('p');
    empty.className = 'landing-games-empty';
    empty.textContent = 'No account games yet.';
    section.append(empty);
    return section;
  }

  const list = document.createElement('ol');
  list.className = 'profile-game-list';
  for (const game of profile.games) list.append(buildProfileGameRow(game));
  section.append(list);

  // Track how many rows are rendered so "Load more" knows the next offset and
  // when the list is exhausted.
  let rendered = profile.games.length;
  if (rendered >= profile.gamesTotal) return section;

  const moreWrap = document.createElement('div');
  moreWrap.className = 'profile-games-more';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'profile-games-more-btn';
  button.textContent = 'Load more';
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Loading…';
    const page = await fetchUserGamesPage(profile.user.handle, rendered, PROFILE_GAMES_PAGE).catch(
      (err) => {
        console.warn(err);
        return null;
      },
    );
    if (!page) {
      button.disabled = false;
      button.textContent = 'Load more';
      return;
    }
    for (const game of page.games) list.append(buildProfileGameRow(game));
    rendered += page.games.length;
    if (rendered >= page.total || page.games.length === 0) {
      moreWrap.remove();
    } else {
      button.disabled = false;
      button.textContent = 'Load more';
    }
  });
  moreWrap.append(button);
  section.append(moreWrap);
  return section;
}

async function fetchUserGamesPage(
  handle: string,
  offset: number,
  limit: number,
): Promise<{ games: FeaturedGame[]; total: number } | null> {
  const resp = await fetch(
    `/api/users/${encodeURIComponent(handle)}/games?offset=${offset}&limit=${limit}`,
  );
  if (!resp.ok) throw new Error(`failed to load games: ${resp.status}`);
  return (await resp.json()) as { games: FeaturedGame[]; total: number };
}
