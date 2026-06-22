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

type LeaderboardResult = { leaderboard: LeaderboardEntry[] } | null;

type LeaderboardListing = {
  entry: LeaderboardEntry;
  variantLabel: string;
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
  drop_mini_xiangqi: 'Drop Mini Xiangqi',
  dark_xiangqi: 'Dark Xiangqi',
  dark_crazyhouse: 'Dark Crazyhouse',
  dark_shogi: 'Dark Shogi',
  kriegspiel: 'Kriegspiel',
  crossroads_chess: 'Dark Crossroads Chess',
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

  const main = document.createElement('div');
  main.className = 'profile-main';
  main.append(buildProfileHeader(profile), buildProfileGames(profile));

  const body = document.createElement('div');
  body.className = 'profile-body';
  body.append(buildProfileRatings(profile.ratings), main);

  shell.append(body);
}

export async function mountLeaderboard(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page');

  const shell = document.createElement('main');
  shell.className = 'site-section leaderboard-shell';
  root.append(buildNav(), shell);

  const loading = document.createElement('p');
  loading.className = 'leaderboard-loading';
  loading.textContent = 'Loading ratings...';
  shell.append(loading);

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

  const grid = document.createElement('div');
  grid.className = 'leaderboard-grid';
  for (let i = 0; i < LEADERBOARD_BUCKETS.length; i++) {
    const b = LEADERBOARD_BUCKETS[i];
    grid.append(buildLeaderboardPanel(b.variantLabel, b.miniId, results[i]));
  }

  const body = document.createElement('div');
  body.className = 'leaderboard-body';
  body.append(buildLeaderboardOverview(results), grid);

  shell.replaceChildren(buildLeaderboardHeader(results), body);
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

function buildLeaderboardHeader(results: LeaderboardResult[]): HTMLElement {
  const header = document.createElement('section');
  header.className = 'leaderboard-page-header';

  const text = document.createElement('div');
  text.className = 'leaderboard-page-title';

  const eyebrow = document.createElement('span');
  eyebrow.className = 'account-eyebrow';
  eyebrow.textContent = 'Players';

  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = 'Leaderboard';

  const body = document.createElement('p');
  body.className = 'leaderboard-sub';
  body.textContent = 'Human blitz ladders across public Mistboard variants.';

  const link = document.createElement('a');
  link.className = 'leaderboard-bots-link';
  link.href = '/bots';
  link.textContent = 'Bots';

  text.append(eyebrow, heading, body);
  header.append(text, link);

  const listings = flattenedLeaderboardEntries(results);
  if (listings.length === 0) header.classList.add('leaderboard-page-header-empty');
  return header;
}

function buildLeaderboardOverview(results: LeaderboardResult[]): HTMLElement {
  const overview = document.createElement('section');
  overview.className = 'leaderboard-overview';
  overview.append(buildLeaderboardStats(results), buildLeaderboardSpotlight(results));
  return overview;
}

function buildLeaderboardStats(results: LeaderboardResult[]): HTMLElement {
  const listings = flattenedLeaderboardEntries(results);
  const uniquePlayers = new Set(listings.map((item) => item.entry.handle.toLowerCase()));
  const topRating = listings.reduce<number | null>(
    (best, item) => (best == null || item.entry.eloRating > best ? item.entry.eloRating : best),
    null,
  );
  const stats: Array<[string, string]> = [
    [String(LEADERBOARD_BUCKETS.length), 'Ladders'],
    [String(uniquePlayers.size), 'Players'],
    [String(listings.length), 'Ratings'],
    [topRating == null ? '—' : String(topRating), 'Top rating'],
  ];

  const strip = document.createElement('div');
  strip.className = 'leaderboard-stats';
  for (const [value, label] of stats) {
    const item = document.createElement('div');
    item.className = 'leaderboard-stat';

    const valueEl = document.createElement('span');
    valueEl.className = 'leaderboard-stat-value';
    valueEl.textContent = value;

    const labelEl = document.createElement('span');
    labelEl.className = 'leaderboard-stat-label';
    labelEl.textContent = label;

    item.append(valueEl, labelEl);
    strip.append(item);
  }
  return strip;
}

function buildLeaderboardSpotlight(results: LeaderboardResult[]): HTMLElement {
  const section = document.createElement('section');
  section.className = 'leaderboard-spotlight';

  const heading = document.createElement('h2');
  heading.textContent = 'Top ratings';
  section.append(heading);

  const listings = flattenedLeaderboardEntries(results)
    .sort((a, b) => b.entry.eloRating - a.entry.eloRating)
    .slice(0, 5);

  if (listings.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'leaderboard-spotlight-empty';
    empty.textContent = 'No rated games yet.';
    section.append(empty);
    return section;
  }

  const list = document.createElement('ol');
  list.className = 'leaderboard-spotlight-list';
  for (const item of listings) {
    const row = document.createElement('li');

    const link = document.createElement('a');
    link.href = `/@/${encodeURIComponent(item.entry.handle)}`;
    link.textContent = item.entry.displayName;

    const rating = document.createElement('span');
    rating.className = 'leaderboard-spotlight-rating';
    rating.textContent = `${item.entry.eloRating}${item.entry.provisional ? '?' : ''}`;

    const variant = document.createElement('span');
    variant.className = 'leaderboard-spotlight-variant';
    variant.textContent = item.variantLabel;

    row.append(link, rating, variant);
    list.append(row);
  }
  section.append(list);
  return section;
}

function buildLeaderboardPanel(
  variantLabel: string,
  miniId: VariantMiniId,
  data: LeaderboardResult,
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
    buildVariantThumb(miniId, 80, 'leaderboard-panel-thumb', `${variantLabel} board`),
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

function flattenedLeaderboardEntries(results: LeaderboardResult[]): LeaderboardListing[] {
  const listings: LeaderboardListing[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const bucket = LEADERBOARD_BUCKETS[i];
    if (!result || !bucket) continue;
    for (const entry of result.leaderboard) {
      listings.push({ entry, variantLabel: bucket.variantLabel });
    }
  }
  return listings;
}

function renderLeaderboardTable(entries: LeaderboardEntry[]): HTMLTableElement {
  // Compact, header-less list in the lichess/playstrategy idiom: rank, player,
  // rating only — no column headings, no games column. Order carries the rest.
  const table = document.createElement('table');
  table.className = 'leaderboard-table';

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

    const ratingTd = document.createElement('td');
    ratingTd.className = 'leaderboard-rating';
    ratingTd.textContent = String(entry.eloRating);
    if (entry.provisional) {
      // "?" marks a provisional rating (RD still high) — shown so the board isn't
      // empty at low liquidity, but flagged as not yet settled.
      ratingTd.classList.add('leaderboard-rating-provisional');
      const q = document.createElement('span');
      q.className = 'leaderboard-rating-q';
      q.textContent = '?';
      ratingTd.append(q);
    }

    tr.append(rankTd, nameTd, ratingTd);
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
  // Joined + game count moved into the stat strip below; only the role badge
  // (admin) remains on the inline meta line, and only when present.
  const metaParts: HTMLElement[] = [];
  const roleBadge = buildRoleBadge(profile.user.accountRole);
  if (roleBadge) metaParts.push(roleBadge);

  return buildProfileHeaderShell({
    eyebrow: profile.isViewer ? 'Your profile' : 'Player profile',
    title: `@${profile.user.handle}`,
    metaParts,
    stats: buildProfileStats(profile),
  });
}

// Header stat strip: neutral/positive figures only — no win/loss record (which
// just accumulates losses). Top variant + best rating come from the ratings we
// already load, so nothing here needs a server aggregate.
function buildProfileStats(profile: UserProfile): HTMLElement {
  const strip = document.createElement('div');
  strip.className = 'profile-stats';

  const items: Array<[string, string]> = [
    [String(profile.gamesTotal), profile.gamesTotal === 1 ? 'Game' : 'Games'],
  ];

  const top = topVariantLabel(profile.ratings);
  if (top) items.push([top, 'Top variant']);

  const best = bestRating(profile.ratings);
  if (best != null) items.push([String(best), 'Best rating']);

  const joined = formatJoinedDate(profile.user.createdAt);
  if (joined) items.push([joined, 'Member since']);

  for (const [value, label] of items) {
    const item = document.createElement('div');
    item.className = 'profile-stat';
    const valueEl = document.createElement('span');
    valueEl.className = 'profile-stat-value';
    valueEl.textContent = value;
    const labelEl = document.createElement('span');
    labelEl.className = 'profile-stat-label';
    labelEl.textContent = label;
    item.append(valueEl, labelEl);
    strip.append(item);
  }
  return strip;
}

// Most-played variant (rated or casual) by total completed games.
function topVariantLabel(ratings: ProfileBucketRating[]): string | null {
  let top: ProfileBucketRating | null = null;
  for (const r of ratings) {
    if (r.totalGamesPlayed <= 0) continue;
    if (!top || r.totalGamesPlayed > top.totalGamesPlayed) top = r;
  }
  return top ? PROFILE_VARIANT_LABEL[top.variant] : null;
}

// Highest current rating across rated variants, or null if none are rated.
function bestRating(ratings: ProfileBucketRating[]): number | null {
  let best: number | null = null;
  for (const r of ratings) {
    if (r.eloRating == null || r.ratedGamesPlayed <= 0) continue;
    if (best == null || r.eloRating > best) best = r.eloRating;
  }
  return best;
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

// Local calendar day used to group activity rows under one header.
function dayKey(value: string | undefined): string {
  if (!value) return 'unknown';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'unknown';
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(value: string | undefined): string {
  if (!value) return 'Earlier';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Earlier';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

export function buildProfileRatings(ratings: ProfileBucketRating[]): HTMLElement {
  const section = document.createElement('section');
  section.className = 'profile-ratings';

  const heading = document.createElement('h2');
  heading.textContent = 'Ratings';
  section.append(heading);

  const variantsShown = PROFILE_VARIANT_ORDER;

  if (variantsShown.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'profile-ratings-empty';
    empty.textContent = 'No rated games yet.';
    section.append(empty);
    return section;
  }

  const rail = document.createElement('div');
  rail.className = 'profile-ratings-rail';

  for (const variant of variantsShown) {
    rail.append(buildRatingRailRow(ratings, variant));
  }

  section.append(rail);
  return section;
}

// One variant row in the ratings rail: compact mini-board beside its name,
// rating, and games count.
// Never-played / unrated variants dim back so the rail reads as intentional.
function buildRatingRailRow(
  ratings: ProfileBucketRating[],
  variant: ProfileRatingVariant,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'profile-rating-row';

  const bucket = ratings.find((r) => r.variant === variant);
  // "Rated" hinges on the rating itself, not the total games count: a rated
  // player always has rated games, so this is the correct (and demo-safe) gate.
  const isRated = bucket != null && bucket.eloRating != null && bucket.ratedGamesPlayed > 0;
  if (!isRated) row.classList.add('profile-rating-row-empty');

  const miniId = variantMiniIdForRating(variant);
  if (miniId) {
    row.append(
      buildVariantThumb(
        miniId,
        80,
        'profile-rating-thumb',
        `${PROFILE_VARIANT_LABEL[variant]} board`,
      ),
    );
  }

  const meta = document.createElement('div');
  meta.className = 'profile-rating-meta';

  const name = document.createElement('span');
  name.className = 'profile-rating-name';
  name.textContent = PROFILE_VARIANT_LABEL[variant];
  meta.append(name);

  const value = document.createElement('span');
  value.className = 'profile-rating-value';

  if (bucket != null && bucket.eloRating != null && bucket.ratedGamesPlayed > 0) {
    value.textContent = String(bucket.eloRating);
    if (bucket.provisional) {
      // "?" marks a provisional rating (still settling). RD itself is not shown.
      const q = document.createElement('span');
      q.className = 'profile-rating-q';
      q.textContent = '?';
      value.append(q);
    }
    meta.append(value);

    const count = document.createElement('span');
    count.className = 'profile-rating-games';
    count.textContent = `${bucket.ratedGamesPlayed} rated ${bucket.ratedGamesPlayed === 1 ? 'game' : 'games'}`;
    meta.append(count);
  } else if (bucket != null && bucket.totalGamesPlayed > 0) {
    value.textContent = 'Unrated';
    value.classList.add('profile-rating-value-unrated');
    meta.append(value);
  } else {
    value.textContent = '—';
    value.classList.add('profile-rating-value-empty');
    meta.append(value);
  }

  row.append(meta);
  return row;
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
  list.className = 'profile-game-list profile-activity';

  // Group rows under day headers; the cursor persists across "Load more" pages
  // so an appended page that continues the same day doesn't repeat its header.
  let lastDay = '';
  const appendGames = (games: FeaturedGame[]) => {
    for (const game of games) {
      const day = dayKey(game.endedAt);
      if (day !== lastDay) {
        lastDay = day;
        const header = document.createElement('li');
        header.className = 'profile-activity-day';
        header.textContent = dayLabel(game.endedAt);
        list.append(header);
      }
      list.append(buildProfileGameRow(game, { timeOnly: true }));
    }
  };

  appendGames(profile.games);
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
    appendGames(page.games);
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
