// Profile + leaderboard pages — extracted from landing.ts.

import type { RatingVariant } from '@mistboard/game';
import './account-profile.css';
import { openChallengeDialog } from './challenge-dialog.js';
import { buildCommunityLayout } from './community-rail.js';
import { correspondenceEnabled } from './feature-flags.js';
import type { FeaturedGame } from './game-display.js';
import { type I18nKey, t } from './i18n/catalog.js';
import { currentLocale, LOCALE_META, type Locale } from './i18n/locale.js';
import {
  buildProfileGameRow,
  buildProfileHeaderShell,
  profileGameSpecLabel,
  profileResultTone,
} from './profile-ui.js';
import { buildLoadingState, buildNav, buildNotice } from './site-shell.js';
import { attachUserCard } from './user-card.js';
import { renderVariantMiniBoard, type VariantMiniId } from './variant-mini-boards.js';
import {
  leaderboardVariants,
  profileRatingVariants,
  type RatingVariantId,
  variantMiniIdForRating,
} from './variants.js';

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

type ProfileRatingHistoryPoint = {
  roomId: string;
  endedAt: string;
  ratingBefore: number;
  ratingAfter: number;
};

type ProfileRatingHistory = {
  variant: ProfileRatingVariant;
  timeClass: ProfileRatingTimeClass;
  points: ProfileRatingHistoryPoint[];
};

type ProfileRelation = { following: boolean; blocked: boolean };

type UserProfile = {
  isViewer?: boolean;
  // The signed-in viewer's edge toward this profile; null/absent for anonymous
  // viewers and on your own profile (no buttons in either case).
  relation?: ProfileRelation | null;
  user: {
    handle: string;
    displayName: string;
    profileVisibility: 'private' | 'unlisted' | 'public';
    accountRole: 'player' | 'admin';
    // Set while a donation is active; drives the cosmetic Patron badge. Absent
    // /null = not a patron. Server-derived (see routes/patron.ts).
    patronSince?: string | null;
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

type LeaderboardSummaryLadder = { variant: string; leaderboard: LeaderboardEntry[] };

type ActivePlayerEntry = {
  rank: number;
  handle: string;
  displayName: string;
  gamesPlayed: number;
};

type LeaderboardSummary = {
  ladders: LeaderboardSummaryLadder[];
  activePlayers?: ActivePlayerEntry[];
} | null;

type OnlinePlayerEntry = {
  handle: string;
  displayName: string;
  rating: { variant: string; eloRating: number; provisional: boolean } | null;
  playing?: boolean;
};

type OnlinePlayersResult = {
  players: OnlinePlayerEntry[];
  count: number;
  anonymousOnline?: number;
} | null;

// One row of a compact ladder table: the value column is a rating for variant
// ladders and a games count for the active-players ladder.
type LeaderboardTableRow = {
  rank: number;
  handle: string;
  displayName: string;
  value: number;
  provisional: boolean;
};

const LEADERBOARD_BUCKETS: {
  variant: ProfileRatingVariant;
  miniId: VariantMiniId;
}[] = leaderboardVariants.map((v) => ({
  variant: v.id,
  miniId: v.miniId,
}));

const PROFILE_VARIANT_LABEL_KEY: Record<ProfileRatingVariant, I18nKey> = {
  fog: 'variant.darkChess.name',
  fog_draft960: 'variant.darkDraft960.name',
  dark_mini_xiangqi: 'variant.darkMiniXiangqi.name',
  drop_mini_xiangqi: 'variant.dropMiniXiangqi.name',
  dark_xiangqi: 'variant.darkXiangqi.name',
  dark_crazyhouse: 'variant.darkCrazyhouse.name',
  dark_shogi: 'variant.darkShogi.name',
  kriegspiel: 'variant.kriegspiel.name',
  crossroads_chess: 'variant.darkCrossroadsChess.name',
  crossroads_chess_open: 'variant.crossroadsChess.name',
  jieqi: 'variant.jieqi.name',
  banqi: 'variant.banqi.name',
  reveal_chess: 'variant.revealChess.name',
  jungle: 'variant.jungle.name',
  jungle_flip: 'variant.jungleFlip.name',
  fortress_xiangqi: 'variant.fortressXiangqi.name',
  xiangqi: 'variant.xiangqi.name',
};

// Profile rating grid is subject-scoped and follows the baseline rating variant
// registry.
const PROFILE_VARIANT_ORDER: ProfileRatingVariant[] = profileRatingVariants.map((v) => v.id);

class ProfileNotFound extends Error {}

export async function mountProfile(root: HTMLElement, handle: string): Promise<void> {
  const locale = currentLocale();
  root.replaceChildren();
  root.classList.add('landing-page', 'profile-route');
  root.append(buildNav(locale), buildLoadingState(t('profile.loading', {}, locale)));

  const shell = document.createElement('main');
  shell.className = 'profile-shell';
  root.replaceChildren(buildNav(locale), shell);

  let profile: UserProfile;
  try {
    profile = await fetchUserProfile(handle);
  } catch (err) {
    console.warn(err);
    if (!(err instanceof ProfileNotFound)) {
      document.title = `${t('profile.loadFailedTitle', {}, locale)} · Mistboard`;
      shell.append(
        buildNotice(
          t('profile.loadFailedTitle', {}, locale),
          t('profile.loadFailedBody', {}, locale),
        ),
      );
      return;
    }
    document.title = `${t('profile.notFoundTitle', {}, locale)} · Mistboard`;
    shell.append(
      buildNotice(t('profile.notFoundTitle', {}, locale), t('profile.notFoundBody', {}, locale)),
    );
    return;
  }

  const selectedVariant = defaultSelectedProfileVariant(profile.ratings);
  let spotlight = buildProfileRatingSpotlight(profile.ratings, selectedVariant, locale);
  void hydrateProfileRatingSpotlight(spotlight, profile.user.handle, selectedVariant, locale);

  const center = document.createElement('div');
  center.className = 'profile-center';
  center.append(buildProfileHeader(profile, locale), spotlight, buildProfileTabs(profile, locale));

  const ratings = buildProfileRatings(profile.ratings, locale, {
    selectedVariant,
    onSelect: (variant) => {
      const next = buildProfileRatingSpotlight(profile.ratings, variant, locale);
      spotlight.replaceWith(next);
      spotlight = next;
      void hydrateProfileRatingSpotlight(spotlight, profile.user.handle, variant, locale);
      syncSelectedRating(ratings, variant);
    },
  });

  const body = document.createElement('div');
  body.className = 'profile-body';
  body.append(ratings, center);

  shell.append(body);
}

// Static frame of the players page: community rail, twin headings (Online
// players | Leaderboard), online column, and one loading panel per ladder.
// Everything derives from the build-time variant registry, so both the client
// mount and the build-time prerender can render it without data.
function buildLeaderboardFrame(locale: Locale): {
  shell: HTMLElement;
  onlineBody: HTMLElement;
  grid: HTMLElement;
  activePanel: { panel: HTMLElement; body: HTMLElement };
  ladderPanels: {
    bucket: (typeof LEADERBOARD_BUCKETS)[number];
    shell: { panel: HTMLElement; body: HTMLElement };
  }[];
} {
  const onlineHeading = document.createElement('h2');
  onlineHeading.className = 'site-section-heading leaderboard-online-heading';
  onlineHeading.textContent = t('profile.onlinePlayers', {}, locale);

  const heading = document.createElement('h1');
  heading.className = 'site-section-heading leaderboard-heading';
  heading.textContent = t('profile.leaderboard', {}, locale);

  const sub = document.createElement('p');
  sub.className = 'leaderboard-sub';
  sub.textContent = t('profile.leaderboardIntro', {}, locale);

  const onlineBody = document.createElement('div');
  onlineBody.className = 'leaderboard-online-body';

  const grid = document.createElement('div');
  grid.className = 'leaderboard-grid';
  const activePanel = buildLeaderboardPanelShell(
    t('profile.activePlayers', {}, locale),
    null,
    locale,
  );
  const ladderPanels = LEADERBOARD_BUCKETS.map((bucket) => ({
    bucket,
    shell: buildLeaderboardPanelShell(
      profileVariantLabel(bucket.variant, locale),
      bucket.miniId,
      locale,
    ),
  }));
  grid.append(activePanel.panel, ...ladderPanels.map((p) => p.shell.panel));

  const body = document.createElement('div');
  body.className = 'leaderboard-body';
  body.append(onlineHeading, heading, sub, onlineBody, grid);

  const shell = document.createElement('main');
  shell.className = 'site-section community-shell leaderboard-shell';
  shell.append(buildCommunityLayout('/leaderboard', body, locale));
  return { shell, onlineBody, grid, activePanel, ladderPanels };
}

// Build-time static render of the players page frame (nav + rail + headings +
// loading panels), baked by the prerender so first paint gets the full layout
// instead of the empty SPA shell. Live data (ladder rows, online list) stays a
// client fetch. Returns the inner HTML for `#app`.
export function renderLeaderboardShellForPrerender(): string {
  const nav = buildNav();
  const frame = buildLeaderboardFrame(currentLocale());
  return `${nav.outerHTML}${frame.shell.outerHTML}`;
}

export async function mountLeaderboard(root: HTMLElement): Promise<void> {
  const locale = currentLocale();
  root.replaceChildren();
  root.classList.add('landing-page');

  // Playstrategy-style players page: the frame renders immediately from the
  // build-time variant registry; the two fetches below only fill in rows, so
  // no layout waits on the network.
  const { shell, onlineBody, grid, activePanel, ladderPanels } = buildLeaderboardFrame(locale);
  root.append(buildNav(locale), shell);

  const [summary, onlinePlayers] = await Promise.all([
    fetchLeaderboardSummary(),
    fetchOnlinePlayers(),
  ]);

  // Presence circles on every ladder row cross-reference the online set.
  const onlineHandles = new Set(
    (onlinePlayers?.players ?? []).map((player) => player.handle.toLowerCase()),
  );

  const activeRows: LeaderboardTableRow[] | null = summary
    ? (summary.activePlayers ?? []).map((entry) => ({
        rank: entry.rank,
        handle: entry.handle,
        displayName: entry.displayName,
        value: entry.gamesPlayed,
        provisional: false,
      }))
    : null;
  renderLeaderboardPanelBody(
    activePanel.body,
    activeRows,
    onlineHandles,
    'profile.noGamesYet',
    locale,
  );

  const ladders = new Map(
    (summary?.ladders ?? []).map((ladder) => [ladder.variant, ladder.leaderboard]),
  );
  const panels: { panel: HTMLElement; populated: boolean }[] = [
    { panel: activePanel.panel, populated: (activeRows?.length ?? 0) > 0 },
  ];
  for (const { bucket, shell: panelShell } of ladderPanels) {
    // A ladder missing from the summary just has no rated games yet; a null
    // summary means the fetch itself failed.
    const entries = summary ? (ladders.get(bucket.variant) ?? []) : null;
    const rows: LeaderboardTableRow[] | null = entries
      ? entries.map((entry) => ({
          rank: entry.rank,
          handle: entry.handle,
          displayName: entry.displayName,
          value: entry.eloRating,
          provisional: entry.provisional,
        }))
      : null;
    renderLeaderboardPanelBody(
      panelShell.body,
      rows,
      onlineHandles,
      'profile.noRatedGames',
      locale,
    );
    panels.push({ panel: panelShell.panel, populated: (rows?.length ?? 0) > 0 });
  }

  // Populated-first so empty ladders sink to the last rows instead of punching
  // holes in the wall. Stable sort preserves registry order within each group.
  grid.append(
    ...panels.sort((a, b) => Number(!a.populated) - Number(!b.populated)).map((p) => p.panel),
  );

  renderOnlinePlayers(onlineBody, onlinePlayers, locale);
}

async function fetchLeaderboardSummary(): Promise<LeaderboardSummary> {
  try {
    const resp = await fetch('/api/leaderboard/summary?limit=10');
    if (!resp.ok) throw new Error(`leaderboard summary failed: ${resp.status}`);
    return (await resp.json()) as NonNullable<LeaderboardSummary>;
  } catch (err) {
    console.warn(err);
    return null;
  }
}

async function fetchOnlinePlayers(): Promise<OnlinePlayersResult> {
  try {
    const resp = await fetch('/api/players/online');
    if (!resp.ok) throw new Error(`online players failed: ${resp.status}`);
    return (await resp.json()) as NonNullable<OnlinePlayersResult>;
  } catch (err) {
    console.warn(err);
    return null;
  }
}

function renderOnlinePlayers(body: HTMLElement, result: OnlinePlayersResult, locale: Locale): void {
  const parts: HTMLElement[] = [];
  // A failed fetch degrades to the empty state: the list is a soft signal,
  // not worth an error banner.
  if (!result || result.players.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'leaderboard-online-empty';
    empty.textContent = t('profile.noPlayersOnline', {}, locale);
    parts.push(empty);
  } else {
    const list = document.createElement('ul');
    list.className = 'leaderboard-online-list';
    for (const player of result.players) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = `/@/${encodeURIComponent(player.handle)}`;
      const dot = document.createElement('span');
      dot.className = 'leaderboard-presence leaderboard-presence-online';
      dot.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span');
      name.className = 'leaderboard-online-name';
      name.textContent = player.displayName;
      link.append(dot, name);
      if (player.playing) {
        const playingMark = document.createElement('span');
        playingMark.className = 'leaderboard-online-playing';
        // Text-presentation crossed swords, so platforms don't swap in emoji.
        playingMark.textContent = '⚔︎';
        playingMark.title = t('profile.playingNow', {}, locale);
        playingMark.setAttribute('aria-label', t('profile.playingNow', {}, locale));
        link.append(playingMark);
      }
      if (player.rating) {
        // One representative figure: the player's best blitz pool. A small board
        // marker leads it (the variant name still rides on the title attribute).
        const rating = document.createElement('span');
        rating.className = 'leaderboard-online-rating';
        const variantLabel = maybeVariantLabel(player.rating.variant, locale);
        const miniId = variantMiniIdForRating(player.rating.variant as RatingVariantId);
        if (miniId) {
          rating.append(
            buildVariantThumb(miniId, 16, 'leaderboard-online-rating-thumb', variantLabel ?? ''),
          );
        }
        const value = document.createElement('span');
        value.className = 'leaderboard-online-rating-value';
        value.textContent = `${player.rating.eloRating}${player.rating.provisional ? '?' : ''}`;
        rating.append(value);
        if (variantLabel) rating.title = variantLabel;
        link.append(rating);
      }
      // Same reusable hover card the friends-online widget uses — the online
      // list is the second surface it serves.
      attachUserCard(link, player.handle, { online: true, playing: player.playing });
      item.append(link);
      list.append(item);
    }
    parts.push(list);
  }
  if (result && (result.anonymousOnline ?? 0) > 0) {
    const anon = document.createElement('p');
    anon.className = 'leaderboard-online-anon';
    anon.textContent = t(
      'profile.anonymousOnline',
      { count: String(result.anonymousOnline) },
      locale,
    );
    parts.push(anon);
  }
  body.replaceChildren(...parts);
}

// Label for a rating-pool name coming off the wire, or null if the client
// does not know the pool (fail soft: an unknown pool just loses its tooltip).
function maybeVariantLabel(variant: string, locale: Locale): string | null {
  if (!(variant in PROFILE_VARIANT_LABEL_KEY)) return null;
  return profileVariantLabel(variant as ProfileRatingVariant, locale);
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

// Panel shell shared by the active-players ladder (no board thumb) and the
// per-variant ladders. The body starts in a loading state and is filled by
// renderLeaderboardPanelBody once the summary lands.
function buildLeaderboardPanelShell(
  title: string,
  miniId: VariantMiniId | null,
  locale: Locale = currentLocale(),
): { panel: HTMLElement; body: HTMLElement } {
  const header = document.createElement('header');
  header.className = 'leaderboard-panel-header';

  const titleEl = document.createElement('h2');
  titleEl.className = 'leaderboard-panel-title';
  titleEl.textContent = title;

  if (miniId) {
    header.append(
      buildVariantThumb(
        miniId,
        22,
        'leaderboard-panel-thumb',
        t('profile.variantBoard', { variant: title }, locale),
      ),
    );
  }
  header.append(titleEl);

  const body = document.createElement('div');
  body.className = 'leaderboard-panel-body';
  const loading = document.createElement('p');
  loading.className = 'leaderboard-panel-empty';
  loading.textContent = t('profile.loadingRatings', {}, locale);
  body.append(loading);

  const panel = document.createElement('section');
  panel.className = 'leaderboard-panel';
  panel.append(header, body);
  return { panel, body };
}

function renderLeaderboardPanelBody(
  body: HTMLElement,
  rows: LeaderboardTableRow[] | null,
  onlineHandles: Set<string>,
  emptyKey: 'profile.noRatedGames' | 'profile.noGamesYet',
  locale: Locale = currentLocale(),
): void {
  if (rows && rows.length > 0) {
    body.replaceChildren(renderLeaderboardTable(rows, onlineHandles));
    return;
  }
  const msg = document.createElement('p');
  msg.className = 'leaderboard-panel-empty';
  msg.textContent = rows ? t(emptyKey, {}, locale) : t('profile.ratingsLoadFailed', {}, locale);
  body.replaceChildren(msg);
}

function renderLeaderboardTable(
  rows: LeaderboardTableRow[],
  onlineHandles: Set<string>,
): HTMLTableElement {
  // Compact, header-less list in the lichess/playstrategy idiom: rank, player,
  // value only — no column headings. Every row carries a presence circle
  // (filled = online now), so the whole wall doubles as a who's-online surface.
  const table = document.createElement('table');
  table.className = 'leaderboard-table';

  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');

    const rankTd = document.createElement('td');
    rankTd.className = 'leaderboard-rank';
    rankTd.textContent = String(row.rank);

    const nameTd = document.createElement('td');
    nameTd.className = 'leaderboard-player';
    const link = document.createElement('a');
    link.href = `/@/${encodeURIComponent(row.handle)}`;
    const presence = document.createElement('span');
    presence.className = 'leaderboard-presence';
    if (onlineHandles.has(row.handle.toLowerCase())) {
      presence.classList.add('leaderboard-presence-online');
    }
    presence.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.className = 'leaderboard-player-name';
    name.textContent = row.displayName;
    link.append(presence, name);
    nameTd.append(link);

    const valueTd = document.createElement('td');
    valueTd.className = 'leaderboard-rating';
    valueTd.textContent = String(row.value);
    if (row.provisional) {
      // "?" marks a provisional rating (RD still high) — shown so the board isn't
      // empty at low liquidity, but flagged as not yet settled.
      valueTd.classList.add('leaderboard-rating-provisional');
      const q = document.createElement('span');
      q.className = 'leaderboard-rating-q';
      q.textContent = '?';
      valueTd.append(q);
    }

    tr.append(rankTd, nameTd, valueTd);
    tbody.append(tr);
  }
  table.append(tbody);
  return table;
}

async function fetchUserProfile(handle: string): Promise<UserProfile> {
  const resp = await fetch(`/api/users/${encodeURIComponent(handle)}/profile`);
  if (resp.status === 404) throw new ProfileNotFound();
  if (!resp.ok) throw new Error(`failed to load profile: ${resp.status}`);
  const data = (await resp.json()) as { profile: UserProfile };
  return data.profile;
}

async function fetchUserRatingHistory(
  handle: string,
  variant: ProfileRatingVariant,
): Promise<ProfileRatingHistory | null> {
  const resp = await fetch(
    `/api/users/${encodeURIComponent(handle)}/rating-history?variant=${encodeURIComponent(variant)}`,
  );
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`rating history failed: ${resp.status}`);
  const data = (await resp.json()) as { history: ProfileRatingHistory };
  return data.history;
}

function buildProfileHeader(profile: UserProfile, locale: Locale = currentLocale()): HTMLElement {
  // Joined + game count moved into the stat strip below; only the role badge
  // (admin) remains on the inline meta line, and only when present.
  const metaParts: HTMLElement[] = [];
  const roleBadge = buildRoleBadge(profile.user.accountRole, locale);
  if (roleBadge) metaParts.push(roleBadge);
  const patronBadge = buildPatronBadge(profile.user.patronSince, locale);
  if (patronBadge) metaParts.push(patronBadge);

  return buildProfileHeaderShell({
    eyebrow: profile.isViewer
      ? t('profile.yourProfile', {}, locale)
      : t('profile.playerProfile', {}, locale),
    title: `@${profile.user.handle}`,
    metaParts,
    actions: profile.relation
      ? buildRelationActions(profile.user.handle, profile.relation, locale)
      : undefined,
    stats: buildProfileStats(profile, locale),
  });
}

// Follow/block controls for a signed-in viewer on someone else's profile.
// Mutations return the fresh relation, so the row re-renders from the server's
// answer rather than an optimistic local flip.
function buildRelationActions(
  handle: string,
  relation: ProfileRelation,
  locale: Locale = currentLocale(),
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'profile-relation-actions';
  renderRelationActions(row, handle, relation, locale);
  return row;
}

function renderRelationActions(
  row: HTMLElement,
  handle: string,
  relation: ProfileRelation,
  locale: Locale,
): void {
  row.replaceChildren();

  // A blocked profile only offers Unblock; hiding Follow and Message avoids
  // the confusing follow-your-own-block overwrite.
  if (!relation.blocked) {
    const message = document.createElement('a');
    message.className = 'landing-setup-start';
    message.href = `/inbox/${encodeURIComponent(handle)}`;
    message.textContent = t('profile.message', {}, locale);
    row.append(message);

    // Directed correspondence challenge (async-loop). Gated on the correspondence
    // flag so it only appears where the challenge system is live.
    if (correspondenceEnabled()) {
      const challenge = document.createElement('button');
      challenge.type = 'button';
      challenge.className = 'landing-setup-start';
      challenge.textContent = t('challenge.button', {}, locale);
      challenge.addEventListener('click', () => openChallengeDialog({ handle, locale }));
      row.append(challenge);
    }

    const follow = document.createElement('button');
    follow.type = 'button';
    follow.className = relation.following ? 'landing-setup-back' : 'landing-setup-start';
    follow.textContent = relation.following
      ? t('profile.unfollow', {}, locale)
      : t('profile.follow', {}, locale);
    follow.addEventListener('click', () =>
      mutateRelation(row, handle, 'follow', relation.following ? 'DELETE' : 'POST', locale, follow),
    );
    row.append(follow);
  }

  const block = document.createElement('button');
  block.type = 'button';
  block.className = 'landing-setup-back profile-relation-block';
  block.textContent = relation.blocked
    ? t('profile.unblock', {}, locale)
    : t('profile.block', {}, locale);
  block.addEventListener('click', () =>
    mutateRelation(row, handle, 'block', relation.blocked ? 'DELETE' : 'POST', locale, block),
  );
  row.append(block);
}

async function mutateRelation(
  row: HTMLElement,
  handle: string,
  kind: 'follow' | 'block',
  method: 'POST' | 'DELETE',
  locale: Locale,
  trigger: HTMLButtonElement,
): Promise<void> {
  trigger.disabled = true;
  try {
    const resp = await fetch(`/api/users/${encodeURIComponent(handle)}/${kind}`, { method });
    if (!resp.ok) throw new Error(`relation ${kind} failed: ${resp.status}`);
    const data = (await resp.json()) as { relation: ProfileRelation };
    renderRelationActions(row, handle, data.relation, locale);
  } catch (err) {
    console.warn(err);
    trigger.disabled = false;
  }
}

// Header stat strip: neutral/positive figures only — no win/loss record (which
// just accumulates losses). Top variant + best rating come from the ratings we
// already load, so nothing here needs a server aggregate.
function buildProfileStats(profile: UserProfile, locale: Locale = currentLocale()): HTMLElement {
  const strip = document.createElement('div');
  strip.className = 'profile-stats';

  const items: Array<{ value: string; label: string; miniId?: VariantMiniId }> = [
    {
      value: String(profile.gamesTotal),
      label:
        profile.gamesTotal === 1
          ? t('profile.gameSingular', {}, locale)
          : t('profile.gamePlural', {}, locale),
    },
  ];

  const top = topVariantStat(profile.ratings, locale);
  if (top) {
    items.push({
      value: top.label,
      label: t('profile.topVariant', {}, locale),
      miniId: top.miniId ?? undefined,
    });
  }

  const best = bestRating(profile.ratings);
  if (best != null) items.push({ value: String(best), label: t('profile.bestRating', {}, locale) });

  const joined = formatJoinedDate(profile.user.createdAt, locale);
  if (joined) items.push({ value: joined, label: t('profile.memberSince', {}, locale) });

  for (const { value, label, miniId } of items) {
    const item = document.createElement('div');
    item.className = 'profile-stat';
    const valueEl = document.createElement('span');
    valueEl.className = 'profile-stat-value';
    // The top-variant stat leads its value with the shared board marker.
    if (miniId) valueEl.append(buildVariantThumb(miniId, 20, 'profile-stat-thumb', value));
    valueEl.append(document.createTextNode(value));
    const labelEl = document.createElement('span');
    labelEl.className = 'profile-stat-label';
    labelEl.textContent = label;
    item.append(valueEl, labelEl);
    strip.append(item);
  }
  return strip;
}

function defaultSelectedProfileVariant(ratings: ProfileBucketRating[]): ProfileRatingVariant {
  const best = ratings
    .filter((rating) => rating.eloRating != null && rating.ratedGamesPlayed > 0)
    .sort((a, b) => (b.eloRating ?? 0) - (a.eloRating ?? 0))[0];
  if (best) return best.variant;

  const active = ratings
    .filter((rating) => rating.totalGamesPlayed > 0)
    .sort((a, b) => b.totalGamesPlayed - a.totalGamesPlayed)[0];
  if (active) return active.variant;

  return PROFILE_VARIANT_ORDER[0] ?? 'fog';
}

function buildProfileRatingSpotlight(
  ratings: ProfileBucketRating[],
  variant: ProfileRatingVariant,
  locale: Locale = currentLocale(),
): HTMLElement {
  const bucket = ratings.find((rating) => rating.variant === variant);
  const section = document.createElement('section');
  section.className = 'profile-rating-spotlight';

  const header = document.createElement('header');
  header.className = 'profile-rating-spotlight-header';

  const eyebrow = document.createElement('span');
  eyebrow.className = 'account-eyebrow';
  eyebrow.textContent = t('profile.currentRating', {}, locale);

  const title = document.createElement('h2');
  title.textContent = profileVariantLabel(variant, locale);
  header.append(eyebrow, title);

  const metric = document.createElement('div');
  metric.className = 'profile-rating-current';

  const value = document.createElement('span');
  value.className = 'profile-rating-current-value';

  const detail = document.createElement('span');
  detail.className = 'profile-rating-current-detail';

  if (bucket?.eloRating != null && bucket.ratedGamesPlayed > 0) {
    value.textContent = String(bucket.eloRating);
    if (bucket.provisional) {
      const q = document.createElement('span');
      q.className = 'profile-rating-q';
      q.textContent = '?';
      value.append(q);
    }
    detail.textContent = t(
      bucket.ratedGamesPlayed === 1 ? 'profile.ratedGameOne' : 'profile.ratedGameMany',
      { count: bucket.ratedGamesPlayed },
      locale,
    );
  } else if (bucket && bucket.totalGamesPlayed > 0) {
    value.textContent = t('profile.unrated', {}, locale);
    detail.textContent = `${bucket.totalGamesPlayed} ${t(
      bucket.totalGamesPlayed === 1 ? 'profile.gameSingular' : 'profile.gamePlural',
      {},
      locale,
    ).toLowerCase()}`;
  } else {
    value.textContent = '—';
    detail.textContent = t('profile.noGamesYet', {}, locale);
  }
  metric.append(value, detail);

  section.append(header, metric, buildRatingChartFrame(locale));
  return section;
}

async function hydrateProfileRatingSpotlight(
  section: HTMLElement,
  handle: string,
  variant: ProfileRatingVariant,
  locale: Locale,
): Promise<void> {
  const chart = section.querySelector<HTMLElement>('.profile-rating-chart');
  if (!chart) return;
  try {
    const history = await fetchUserRatingHistory(handle, variant);
    renderRatingChartFrame(chart, history?.points ?? [], locale);
  } catch (err) {
    console.warn(err);
    renderRatingChartFrame(chart, [], locale);
  }
}

function buildRatingChartFrame(locale: Locale = currentLocale()): HTMLElement {
  const frame = document.createElement('div');
  frame.className = 'profile-rating-chart';

  renderRatingChartFrame(frame, [], locale);
  return frame;
}

function renderRatingChartFrame(
  frame: HTMLElement,
  points: ProfileRatingHistoryPoint[],
  locale: Locale = currentLocale(),
): void {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 420 150');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', t('profile.ratingHistory', {}, locale));

  for (const y of [30, 70, 110]) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '24');
    line.setAttribute('x2', '396');
    line.setAttribute('y1', String(y));
    line.setAttribute('y2', String(y));
    line.setAttribute('class', 'profile-rating-chart-grid');
    svg.append(line);
  }

  if (points.length > 0) {
    const samples = [
      { rating: points[0]!.ratingBefore },
      ...points.map((point) => ({ rating: point.ratingAfter })),
    ];
    const ratings = samples.map((sample) => sample.rating);
    const minRating = Math.min(...ratings);
    const maxRating = Math.max(...ratings);
    const padding = Math.max(20, Math.round((maxRating - minRating) * 0.15));
    const yMin = minRating - padding;
    const yMax = maxRating + padding;
    const xStart = 36;
    const xEnd = 384;
    const yTop = 24;
    const yBottom = 120;
    const denominator = Math.max(1, samples.length - 1);
    const yRange = Math.max(1, yMax - yMin);
    const coords = samples.map((sample, index) => {
      const x = xStart + ((xEnd - xStart) * index) / denominator;
      const y = yBottom - ((sample.rating - yMin) / yRange) * (yBottom - yTop);
      return { x, y };
    });

    const ratingLine = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    ratingLine.setAttribute('class', 'profile-rating-chart-line');
    ratingLine.setAttribute(
      'points',
      coords.map((coord) => `${coord.x.toFixed(1)},${coord.y.toFixed(1)}`).join(' '),
    );
    svg.append(ratingLine);

    for (const coord of coords) {
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('class', 'profile-rating-chart-dot');
      dot.setAttribute('cx', coord.x.toFixed(1));
      dot.setAttribute('cy', coord.y.toFixed(1));
      dot.setAttribute('r', '4');
      svg.append(dot);
    }

    for (const [label, y] of [
      [String(yMax), 30],
      [String(Math.round((yMax + yMin) / 2)), 70],
      [String(yMin), 110],
    ] as const) {
      const tick = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      tick.setAttribute('class', 'profile-rating-chart-label');
      tick.setAttribute('x', '396');
      tick.setAttribute('y', String(y + 4));
      tick.setAttribute('text-anchor', 'end');
      tick.textContent = label;
      svg.append(tick);
    }
  }

  const empty = document.createElement('span');
  empty.className = 'profile-rating-chart-empty';
  empty.textContent = t('profile.noRatingHistory', {}, locale);

  frame.replaceChildren(svg, ...(points.length === 0 ? [empty] : []));
}

function buildProfileTabs(profile: UserProfile, locale: Locale = currentLocale()): HTMLElement {
  const section = document.createElement('section');
  section.className = 'profile-tabs';

  const tabList = document.createElement('div');
  tabList.className = 'profile-tab-list';
  tabList.setAttribute('role', 'tablist');

  const activityPanel = buildProfileActivity(profile, locale);
  const gamesPanel = buildProfileGames(profile, locale);
  activityPanel.id = `profile-activity-${profile.user.handle}`;
  gamesPanel.id = `profile-games-${profile.user.handle}`;
  gamesPanel.hidden = true;

  const activityTab = buildProfileTabButton(
    t('profile.activity', {}, locale),
    activityPanel.id,
    true,
  );
  const gamesTab = buildProfileTabButton(t('profile.games', {}, locale), gamesPanel.id, false);
  tabList.append(activityTab, gamesTab);

  const activate = (button: HTMLButtonElement, panel: HTMLElement) => {
    for (const tab of [activityTab, gamesTab])
      tab.setAttribute('aria-selected', String(tab === button));
    activityPanel.hidden = panel !== activityPanel;
    gamesPanel.hidden = panel !== gamesPanel;
  };
  activityTab.addEventListener('click', () => activate(activityTab, activityPanel));
  gamesTab.addEventListener('click', () => activate(gamesTab, gamesPanel));

  section.append(tabList, activityPanel, gamesPanel);
  return section;
}

function buildProfileTabButton(
  label: string,
  controls: string,
  selected: boolean,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'profile-tab';
  button.setAttribute('role', 'tab');
  button.setAttribute('aria-controls', controls);
  button.setAttribute('aria-selected', String(selected));
  button.textContent = label;
  return button;
}

type ProfileActivitySummary = {
  key: string;
  day: string;
  variant: string;
  count: number;
  wins: number;
  losses: number;
  draws: number;
};

function buildProfileActivity(profile: UserProfile, locale: Locale = currentLocale()): HTMLElement {
  const section = document.createElement('section');
  section.className = 'profile-activity-panel';

  const heading = document.createElement('h2');
  heading.textContent = t('profile.activity', {}, locale);
  section.append(heading);

  if (profile.games.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'landing-games-empty';
    empty.textContent = t('profile.noAccountGames', {}, locale);
    section.append(empty);
    return section;
  }

  const list = document.createElement('ol');
  list.className = 'profile-activity-summary-list';
  for (const summary of profileActivitySummaries(profile.games, locale)) {
    list.append(buildProfileActivitySummaryRow(summary, locale));
  }
  section.append(list);
  return section;
}

function profileActivitySummaries(
  games: FeaturedGame[],
  locale: Locale = currentLocale(),
): ProfileActivitySummary[] {
  const summaries = new Map<string, ProfileActivitySummary>();
  for (const game of games) {
    const day = dayLabel(game.endedAt, locale);
    const variant = profileGameSpecLabel(game, locale);
    const key = `${day}\0${variant}`;
    let summary = summaries.get(key);
    if (!summary) {
      summary = { key, day, variant, count: 0, wins: 0, losses: 0, draws: 0 };
      summaries.set(key, summary);
    }
    summary.count += 1;
    const tone = profileResultTone(game);
    if (tone === 'win') summary.wins += 1;
    else if (tone === 'loss') summary.losses += 1;
    else summary.draws += 1;
  }
  return [...summaries.values()];
}

function buildProfileActivitySummaryRow(
  summary: ProfileActivitySummary,
  locale: Locale = currentLocale(),
): HTMLElement {
  const item = document.createElement('li');
  item.className = 'profile-activity-summary-row';

  const marker = document.createElement('span');
  marker.className = 'profile-activity-summary-marker';
  marker.setAttribute('aria-hidden', 'true');

  const body = document.createElement('span');
  body.className = 'profile-activity-summary-body';

  const day = document.createElement('span');
  day.className = 'profile-activity-summary-day';
  day.textContent = summary.day;

  const title = document.createElement('span');
  title.className = 'profile-activity-summary-title';
  title.textContent = t(
    summary.count === 1 ? 'profile.activityPlayedOne' : 'profile.activityPlayedMany',
    { count: summary.count, variant: summary.variant },
    locale,
  );
  body.append(day, title);

  const record = document.createElement('span');
  record.className = 'profile-activity-record';
  if (summary.wins > 0)
    record.append(buildProfileRecordPill(summary.wins, t('result.win', {}, locale), 'win'));
  if (summary.draws > 0) {
    record.append(buildProfileRecordPill(summary.draws, t('result.draw', {}, locale), 'draw'));
  }
  if (summary.losses > 0) {
    record.append(buildProfileRecordPill(summary.losses, t('result.loss', {}, locale), 'loss'));
  }

  item.append(marker, body, record);
  return item;
}

function buildProfileRecordPill(
  count: number,
  label: string,
  tone: 'win' | 'loss' | 'draw',
): HTMLElement {
  const pill = document.createElement('span');
  pill.className = `profile-record-pill profile-record-pill-${tone}`;
  pill.textContent = `${count} ${label.toLowerCase()}`;
  return pill;
}

// Most-played variant (rated or casual) by total completed games, with its
// board marker for the stat tile.
function topVariantStat(
  ratings: ProfileBucketRating[],
  locale: Locale = currentLocale(),
): { label: string; miniId: VariantMiniId | null } | null {
  let top: ProfileBucketRating | null = null;
  for (const r of ratings) {
    if (r.totalGamesPlayed <= 0) continue;
    if (!top || r.totalGamesPlayed > top.totalGamesPlayed) top = r;
  }
  if (!top) return null;
  return {
    label: profileVariantLabel(top.variant, locale),
    miniId: variantMiniIdForRating(top.variant),
  };
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

function buildRoleBadge(
  role: UserProfile['user']['accountRole'],
  locale: Locale = currentLocale(),
): HTMLElement | null {
  if (role === 'admin') {
    const badge = document.createElement('span');
    badge.className = 'profile-role-badge profile-role-admin';
    badge.textContent = t('profile.admin', {}, locale);
    return badge;
  }
  return null;
}

// Cosmetic Patron badge ("wings"): shown when the account has an active
// donation. Purely a thank-you; carries no gameplay meaning. Links to /patron.
function buildPatronBadge(
  patronSince: string | null | undefined,
  locale: Locale = currentLocale(),
): HTMLElement | null {
  if (!patronSince) return null;
  const badge = document.createElement('a');
  badge.className = 'profile-role-badge profile-role-patron';
  badge.href = '/patron';
  badge.title = t('profile.patronTitle', {}, locale);
  // A small paw glyph (animal theme) + the label. innerHTML is the established
  // inline-icon idiom in this codebase; the string is a static constant.
  const paw = document.createElement('span');
  paw.className = 'profile-patron-paw';
  paw.setAttribute('aria-hidden', 'true');
  paw.innerHTML = PATRON_PAW_SVG;
  badge.append(paw, document.createTextNode(t('profile.patron', {}, locale)));
  return badge;
}

// A minimal paw print (main pad + four toes), currentColor so the badge tints it.
const PATRON_PAW_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
  <ellipse cx="12" cy="16" rx="5" ry="4"/>
  <circle cx="6" cy="10" r="2"/>
  <circle cx="10" cy="7" r="2"/>
  <circle cx="14" cy="7" r="2"/>
  <circle cx="18" cy="10" r="2"/>
</svg>`;

function formatJoinedDate(
  value: string | undefined,
  locale: Locale = currentLocale(),
): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(LOCALE_META[locale].dateLocale, {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

// Local calendar day used to group activity rows under one header.
function dayKey(value: string | undefined): string {
  if (!value) return 'unknown';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'unknown';
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(value: string | undefined, locale: Locale = currentLocale()): string {
  if (!value) return t('profile.earlier', {}, locale);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return t('profile.earlier', {}, locale);
  return new Intl.DateTimeFormat(LOCALE_META[locale].dateLocale, { dateStyle: 'medium' }).format(
    date,
  );
}

export function buildProfileRatings(
  ratings: ProfileBucketRating[],
  locale: Locale = currentLocale(),
  opts: {
    selectedVariant?: ProfileRatingVariant;
    onSelect?: (variant: ProfileRatingVariant) => void;
  } = {},
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'profile-ratings';

  const heading = document.createElement('h2');
  heading.textContent = t('profile.ratings', {}, locale);
  section.append(heading);

  const variantsShown = PROFILE_VARIANT_ORDER;

  if (variantsShown.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'profile-ratings-empty';
    empty.textContent = t('profile.noRatedGames', {}, locale);
    section.append(empty);
    return section;
  }

  const rail = document.createElement('div');
  rail.className = 'profile-ratings-rail';

  for (const variant of variantsShown) {
    rail.append(buildRatingRailRow(ratings, variant, locale, opts));
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
  locale: Locale = currentLocale(),
  opts: {
    selectedVariant?: ProfileRatingVariant;
    onSelect?: (variant: ProfileRatingVariant) => void;
  } = {},
): HTMLButtonElement {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'profile-rating-row';
  row.dataset.variant = variant;
  row.setAttribute('aria-pressed', String(opts.selectedVariant === variant));
  if (opts.selectedVariant === variant) row.classList.add('profile-rating-row-selected');
  row.addEventListener('click', () => opts.onSelect?.(variant));

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
        t('profile.variantBoard', { variant: profileVariantLabel(variant, locale) }, locale),
      ),
    );
  }

  const meta = document.createElement('div');
  meta.className = 'profile-rating-meta';

  const name = document.createElement('span');
  name.className = 'profile-rating-name';
  name.textContent = profileVariantLabel(variant, locale);
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
    count.textContent = t(
      bucket.ratedGamesPlayed === 1 ? 'profile.ratedGameOne' : 'profile.ratedGameMany',
      { count: bucket.ratedGamesPlayed },
      locale,
    );
    meta.append(count);
  } else if (bucket != null && bucket.totalGamesPlayed > 0) {
    value.textContent = t('profile.unrated', {}, locale);
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

function syncSelectedRating(section: HTMLElement, variant: ProfileRatingVariant): void {
  for (const row of section.querySelectorAll<HTMLElement>('.profile-rating-row')) {
    const selected = row.dataset.variant === variant;
    row.classList.toggle('profile-rating-row-selected', selected);
    row.setAttribute('aria-pressed', String(selected));
  }
}

function buildProfileGames(profile: UserProfile, locale: Locale = currentLocale()): HTMLElement {
  const section = document.createElement('section');
  section.className = 'profile-games';

  const heading = document.createElement('h2');
  heading.textContent = t('profile.games', {}, locale);
  section.append(heading);

  if (profile.gamesTotal === 0) {
    const empty = document.createElement('p');
    empty.className = 'landing-games-empty';
    empty.textContent = t('profile.noAccountGames', {}, locale);
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
        header.textContent = dayLabel(game.endedAt, locale);
        list.append(header);
      }
      list.append(buildProfileGameRow(game, { timeOnly: true, locale }));
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
  button.textContent = t('profile.loadMore', {}, locale);
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = t('profile.loadingMore', {}, locale);
    const page = await fetchUserGamesPage(profile.user.handle, rendered, PROFILE_GAMES_PAGE).catch(
      (err) => {
        console.warn(err);
        return null;
      },
    );
    if (!page) {
      button.disabled = false;
      button.textContent = t('profile.loadMore', {}, locale);
      return;
    }
    appendGames(page.games);
    rendered += page.games.length;
    if (rendered >= page.total || page.games.length === 0) {
      moreWrap.remove();
    } else {
      button.disabled = false;
      button.textContent = t('profile.loadMore', {}, locale);
    }
  });
  moreWrap.append(button);
  section.append(moreWrap);
  return section;
}

function profileVariantLabel(
  variant: ProfileRatingVariant,
  locale: Locale = currentLocale(),
): string {
  return t(PROFILE_VARIANT_LABEL_KEY[variant], {}, locale);
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
