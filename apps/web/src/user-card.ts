// Reusable floating user-card: a compact profile summary shown on hover across
// surfaces (the friends-online widget, the leaderboard online list, and any
// future player-link surface). One shared singleton popover is appended to the
// document body; hovering an anchor lazily fetches that handle's profile,
// renders the card, and positions it near the anchor. Moving the pointer into
// the card itself keeps it open (a short grace delay bridges the anchor→card
// gap), so the card is interactive (its Follow/Message actions are clickable).
//
// The card is decoupled from the profile page on purpose: it re-implements the
// minimal Follow/Message action row rather than importing profile.ts (which
// pulls the whole leaderboard module + its CSS), so any surface can attach a
// card without inheriting that weight.

import './user-card.css';
import type { RatingVariant } from '@mistboard/game';
import { openChallengeDialog } from './challenge-dialog.js';
import { correspondenceEnabled } from './feature-flags.js';
import { t } from './i18n/catalog.js';
import { currentLocale, LOCALE_META, type Locale } from './i18n/locale.js';
import { renderVariantMarker } from './variant-markers.js';
import { ratingVariantLabel, variantMiniIdForRating } from './variants.js';

type ProfileBucketRating = {
  variant: RatingVariant;
  timeClass: 'bullet' | 'blitz' | 'rapid';
  eloRating: number | null;
  ratedGamesPlayed: number;
  totalGamesPlayed: number;
  provisional: boolean;
};

type UserCardRelation = { following: boolean; blocked: boolean };

// The subset of GET /api/users/:handle/profile the card renders.
export type UserCardProfile = {
  isViewer?: boolean;
  relation?: UserCardRelation | null;
  user: {
    handle: string;
    displayName: string;
    accountRole: 'player' | 'admin';
    createdAt: string;
  };
  ratings: ProfileBucketRating[];
  gamesTotal: number;
};

// Liveness the card can't learn from the profile fetch (presence lives in the
// online lists), so the caller passes what it knows.
export type UserCardLiveness = { online?: boolean; playing?: boolean };

// How many rated variants the compact grid shows before it stops (a hover card
// should not grow into a full ratings rail). Highest-rated first.
const MAX_RATING_TILES = 6;

// ── card body ───────────────────────────────────────────────────────────────

export function buildUserCard(
  profile: UserCardProfile,
  live: UserCardLiveness = {},
  locale: Locale = currentLocale(),
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'user-card';

  card.append(buildHeader(profile, live, locale));

  const grid = buildRatingGrid(profile.ratings);
  if (grid) card.append(grid);

  if (!profile.isViewer && profile.relation) {
    card.append(buildActions(profile.user.handle, profile.relation, locale));
  }

  card.append(buildFooter(profile, locale));
  return card;
}

function buildHeader(
  profile: UserCardProfile,
  live: UserCardLiveness,
  locale: Locale,
): HTMLElement {
  const header = document.createElement('div');
  header.className = 'user-card-header';

  if (live.online) {
    const dot = document.createElement('span');
    dot.className = 'user-card-dot';
    dot.setAttribute('aria-hidden', 'true');
    header.append(dot);
  }

  const name = document.createElement('a');
  name.className = 'user-card-name';
  name.href = `/@/${encodeURIComponent(profile.user.handle)}`;
  name.textContent = profile.user.displayName;
  header.append(name);

  if (profile.user.accountRole === 'admin') {
    const badge = document.createElement('span');
    badge.className = 'user-card-badge';
    badge.textContent = t('profile.admin', {}, locale);
    header.append(badge);
  }

  if (live.playing) {
    const mark = document.createElement('span');
    mark.className = 'user-card-playing';
    // Text-presentation crossed swords, so platforms don't swap in emoji.
    mark.textContent = '⚔︎';
    mark.title = t('profile.playingNow', {}, locale);
    mark.setAttribute('aria-label', t('profile.playingNow', {}, locale));
    header.append(mark);
  }

  return header;
}

// Compact rating grid: rated variants only (a "?"-provisional or settled Elo),
// highest first, each a variant marker beside its value. Returns null when the
// player has no rated variant so the card collapses cleanly instead of showing
// a dead grid.
function buildRatingGrid(ratings: ProfileBucketRating[]): HTMLElement | null {
  const rated = ratings
    .filter((r) => r.eloRating != null && r.ratedGamesPlayed > 0)
    .sort((a, b) => (b.eloRating ?? 0) - (a.eloRating ?? 0))
    .slice(0, MAX_RATING_TILES);
  if (rated.length === 0) return null;

  const grid = document.createElement('div');
  grid.className = 'user-card-ratings';

  for (const bucket of rated) {
    const tile = document.createElement('div');
    tile.className = 'user-card-rating';

    const miniId = variantMiniIdForRating(bucket.variant);
    const label = variantLabel(bucket.variant);
    if (miniId) {
      const icon = document.createElement('span');
      icon.className = 'user-card-rating-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = renderVariantMarker(miniId, { size: 20, label });
      tile.append(icon);
    }

    const value = document.createElement('span');
    value.className = 'user-card-rating-value';
    value.textContent = `${bucket.eloRating}${bucket.provisional ? '?' : ''}`;
    tile.title = label;
    tile.append(value);

    grid.append(tile);
  }

  return grid;
}

// Minimal action row: Message + Follow/Unfollow. A blocked profile shows
// nothing actionable here (the full profile page owns block/unblock); the card
// is a lightweight surface, so it stays to the two common actions.
function buildActions(handle: string, relation: UserCardRelation, locale: Locale): HTMLElement {
  const row = document.createElement('div');
  row.className = 'user-card-actions';
  renderActions(row, handle, relation, locale);
  return row;
}

function renderActions(
  row: HTMLElement,
  handle: string,
  relation: UserCardRelation,
  locale: Locale,
): void {
  row.replaceChildren();
  if (relation.blocked) return;

  const message = document.createElement('a');
  message.className = 'user-card-action';
  message.href = `/inbox/${encodeURIComponent(handle)}`;
  message.textContent = t('profile.message', {}, locale);
  row.append(message);

  if (correspondenceEnabled()) {
    const challenge = document.createElement('button');
    challenge.type = 'button';
    challenge.className = 'user-card-action';
    challenge.textContent = t('challenge.button', {}, locale);
    challenge.addEventListener('click', () => openChallengeDialog({ handle, locale }));
    row.append(challenge);
  }

  const follow = document.createElement('button');
  follow.type = 'button';
  follow.className = relation.following
    ? 'user-card-action user-card-action-active'
    : 'user-card-action';
  follow.textContent = relation.following
    ? t('profile.unfollow', {}, locale)
    : t('profile.follow', {}, locale);
  follow.addEventListener('click', async () => {
    follow.disabled = true;
    try {
      const resp = await fetch(`/api/users/${encodeURIComponent(handle)}/follow`, {
        method: relation.following ? 'DELETE' : 'POST',
      });
      if (!resp.ok) throw new Error(`follow toggle failed: ${resp.status}`);
      const data = (await resp.json()) as { relation: UserCardRelation };
      // Keep the shared cache in step so a re-hover reflects the new edge.
      const cached = profileCache.get(handle.toLowerCase());
      if (cached) {
        void cached.then((p) => {
          if (p) p.relation = data.relation;
        });
      }
      renderActions(row, handle, data.relation, locale);
    } catch (err) {
      console.warn(err);
      follow.disabled = false;
    }
  });
  row.append(follow);
}

function buildFooter(profile: UserCardProfile, locale: Locale): HTMLElement {
  const footer = document.createElement('div');
  footer.className = 'user-card-footer';

  const games = document.createElement('span');
  games.textContent = `${profile.gamesTotal} ${t(
    profile.gamesTotal === 1 ? 'profile.gameSingular' : 'profile.gamePlural',
    {},
    locale,
  )}`;
  footer.append(games);

  const joined = formatJoined(profile.user.createdAt, locale);
  if (joined) {
    const joinedEl = document.createElement('span');
    joinedEl.textContent = `${t('profile.memberSince', {}, locale)} ${joined}`;
    footer.append(joinedEl);
  }

  return footer;
}

// ── hover attach ──────────────────────────────────────────────────────────

// One shared popover element + the handle it currently shows, so hovering many
// rows reuses a single node instead of leaking one per anchor.
let popover: HTMLElement | null = null;
let popoverHandle: string | null = null;
let showTimer: number | null = null;
let hideTimer: number | null = null;
let pointerInCard = false;
let pointerInAnchor = false;

// Per-page cache of profile fetches, keyed by lowercased handle. A card can
// mutate a cached profile's relation in place (see renderActions) so a re-hover
// reflects follow state without a refetch.
const profileCache = new Map<string, Promise<UserCardProfile | null>>();

const SHOW_DELAY_MS = 220;
const HIDE_DELAY_MS = 160;

async function fetchProfile(handle: string): Promise<UserCardProfile | null> {
  const key = handle.toLowerCase();
  const existing = profileCache.get(key);
  if (existing) return existing;
  const pending = (async () => {
    const resp = await fetch(`/api/users/${encodeURIComponent(handle)}/profile`).catch(() => null);
    if (!resp?.ok) return null;
    const data = (await resp.json()) as { profile: UserCardProfile };
    return data.profile;
  })().catch(() => null);
  profileCache.set(key, pending);
  const resolved = await pending;
  // Don't cache a failed fetch: let a later hover retry.
  if (!resolved) profileCache.delete(key);
  return resolved;
}

function ensurePopover(): HTMLElement {
  if (popover) return popover;
  const el = document.createElement('div');
  el.className = 'user-card-popover';
  el.hidden = true;
  el.addEventListener('mouseenter', () => {
    pointerInCard = true;
    cancelHide();
  });
  el.addEventListener('mouseleave', () => {
    pointerInCard = false;
    scheduleHide();
  });
  document.body.append(el);
  popover = el;
  return el;
}

function positionPopover(el: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  el.hidden = false;
  const cardW = el.offsetWidth;
  const cardH = el.offsetHeight;
  const gap = 8;
  const margin = 8;
  // Prefer the anchor's right; fall back to its left when the card would clip
  // the right edge.
  let left = rect.right + gap;
  if (left + cardW > window.innerWidth - margin) left = rect.left - gap - cardW;
  if (left < margin) left = margin;
  // Vertically align to the anchor top, clamped into the viewport.
  let top = rect.top;
  if (top + cardH > window.innerHeight - margin) top = window.innerHeight - margin - cardH;
  if (top < margin) top = margin;
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
}

function cancelShow(): void {
  if (showTimer != null) {
    window.clearTimeout(showTimer);
    showTimer = null;
  }
}

function cancelHide(): void {
  if (hideTimer != null) {
    window.clearTimeout(hideTimer);
    hideTimer = null;
  }
}

function scheduleHide(): void {
  cancelHide();
  hideTimer = window.setTimeout(() => {
    if (pointerInCard || pointerInAnchor) return;
    if (popover) popover.hidden = true;
    popoverHandle = null;
  }, HIDE_DELAY_MS);
}

// Attach a hover card to `anchor`. `handle` is the account handle to load;
// `live` is what the caller already knows about presence (online/playing).
// Returns a disposer that removes the listeners (call it if the anchor is torn
// down while cards are in flight).
export function attachUserCard(
  anchor: HTMLElement,
  handle: string,
  live: UserCardLiveness = {},
): () => void {
  const onEnter = () => {
    pointerInAnchor = true;
    cancelHide();
    cancelShow();
    showTimer = window.setTimeout(async () => {
      const profile = await fetchProfile(handle);
      if (!profile) return;
      // The pointer may have left during the fetch; only show if we're still
      // meant to (pointer on anchor or already on the card).
      if (!pointerInAnchor && !pointerInCard) return;
      const el = ensurePopover();
      el.replaceChildren(buildUserCard(profile, live));
      popoverHandle = handle;
      positionPopover(el, anchor);
    }, SHOW_DELAY_MS);
  };
  const onLeave = () => {
    pointerInAnchor = false;
    cancelShow();
    scheduleHide();
  };
  anchor.addEventListener('mouseenter', onEnter);
  anchor.addEventListener('mouseleave', onLeave);
  return () => {
    anchor.removeEventListener('mouseenter', onEnter);
    anchor.removeEventListener('mouseleave', onLeave);
    if (popoverHandle === handle) scheduleHide();
  };
}

// ── helpers ───────────────────────────────────────────────────────────────

function variantLabel(variant: RatingVariant): string {
  return ratingVariantLabel(variant) ?? variant;
}

function formatJoined(value: string | undefined, locale: Locale): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(LOCALE_META[locale].dateLocale, {
    month: 'long',
    year: 'numeric',
  }).format(date);
}
