// Public bot directory (/bots) and bot profile (/bot/:id). The directory is a
// compact lichess-density roster (featured identities + the Fairy-Stockfish
// ladder); the profile page reuses the player-profile surface primitives
// (profile-shell, header shell, rating rail, game rows) so it renders as a
// sibling of /@handle. Play affordances create the game directly via
// bot-play.ts; there is no setup dialog.
import { maybeGameSpecForId } from '@mistboard/game';
import './account-profile.css';
import './bots.css';
import { bindBotPlayControl } from './bot-play.js';
import { buildCommunityLayout } from './community-rail.js';
import type { FeaturedGame } from './game-display.js';
import { buildProfileGameRow, buildProfileHeaderShell } from './profile-ui.js';
import { buildNav, buildNotice } from './site-shell.js';
import { renderVariantMarker } from './variant-markers.js';
import { variantMiniIdForRawVariant } from './variants.js';

type BotPlayOption = {
  gameSpecId: string;
  engineId: string;
  playable: boolean;
};

type BotRecord = {
  games: number;
  wins: number;
  losses: number;
  draws: number;
};

type BotRatingSnapshot = {
  gameSpecId: string;
  timeClass: 'bullet' | 'blitz' | 'rapid';
  rating: number;
  ratingDeviation: number | null;
  games: number;
  source: 'manual' | 'eve-anchor' | 'import';
  sourceRef: string | null;
  createdAt: string;
  provisional: boolean;
};

type BotProfile = {
  id: string;
  displayName: string;
  bio: string;
  ownerType: 'system' | 'user';
  ownerUserId: string | null;
  activeEngineId: string;
  defaultGameSpecId: string;
  supportedGameSpecIds: string[];
  play: {
    mode: 'pve';
    gameSpecId: string;
    engineId: string;
    timeControl: { initialMs: number; incrementMs: number };
    preferredColor: 'random' | 'white' | 'black' | 'red';
  };
  playOptions?: BotPlayOption[];
  gamesTotal: number;
  record: BotRecord;
  rating: BotRatingSnapshot | null;
  ratings?: BotRatingSnapshot[];
  games?: FeaturedGame[];
};

class BotNotFound extends Error {}

const GAME_SPEC_LABELS: Record<string, string> = {
  'dark-chess': 'Fog Chess',
  'dark-mini-xiangqi': 'Dark Mini Xiangqi',
  jieqi: 'Reveal Xiangqi',
  banqi: 'Flip Xiangqi',
  'crossroads-chess': 'Crossroads Chess',
  'fortress-xiangqi': 'Fortress Xiangqi',
};

const HIDDEN_BOT_GAME_SPEC_IDS = new Set(['dark-draft960']);

const LADDER_BOT_ID_PREFIX = 'fairy-stockfish-level-';

export async function mountBots(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page', 'bots-route');

  const shell = document.createElement('main');
  shell.className = 'site-section community-shell bots-shell';

  const header = document.createElement('section');
  header.className = 'bots-directory-header';

  const eyebrow = document.createElement('span');
  eyebrow.className = 'account-eyebrow';
  eyebrow.textContent = 'Play';

  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = 'Bots';

  const sub = document.createElement('p');
  sub.className = 'bots-sub';
  sub.textContent = 'Engine opponents with public profiles. Pick a variant to start a game.';

  header.append(eyebrow, heading, sub);

  const body = document.createElement('section');
  body.className = 'bots-directory';
  body.append(statusLine('Loading bots...'));

  const content = document.createElement('div');
  content.className = 'bots-main';
  content.append(header, body);

  shell.append(buildCommunityLayout('/bots', content));
  root.append(buildNav(), shell);

  let bots: BotProfile[];
  try {
    bots = await fetchBots();
  } catch {
    body.replaceChildren(buildNotice('Bots unavailable', 'The bot directory could not load.'));
    return;
  }

  if (bots.length === 0) {
    body.replaceChildren(statusLine('No bots available.'));
    return;
  }

  body.replaceChildren(...buildBotDirectorySections(bots));
}

export async function mountBotProfile(root: HTMLElement, botId: string): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page', 'profile-route', 'bots-route');

  const shell = document.createElement('main');
  shell.className = 'profile-shell bot-profile-shell';
  root.append(buildNav(), shell);

  let bot: BotProfile;
  try {
    bot = await fetchBotProfile(botId);
  } catch (err) {
    if (err instanceof BotNotFound) {
      document.title = 'Bot not found · Mistboard';
      shell.append(buildNotice('Bot not found', 'This bot profile is not public.'));
      return;
    }
    shell.append(buildNotice('Bots unavailable', 'This bot profile could not load.'));
    return;
  }

  document.title = `${bot.displayName} · Bot · Mistboard`;

  const sidebar = document.createElement('aside');
  sidebar.className = 'bot-profile-sidebar';
  sidebar.append(buildBotRatingsRail(bot), buildBotAbout(bot));

  const main = document.createElement('div');
  main.className = 'bot-profile-main';
  main.append(buildBotPlayPanel(bot), buildRecentGames(bot));

  const body = document.createElement('div');
  body.className = 'profile-body bot-profile-body';
  body.append(sidebar, main);

  shell.append(buildBotHeader(bot), body);
}

async function fetchBots(): Promise<BotProfile[]> {
  const resp = await fetch('/api/bots', { headers: { accept: 'application/json' } });
  if (!resp.ok) throw new Error(`bots_failed_${resp.status}`);
  const data = (await resp.json()) as { bots: BotProfile[] };
  return data.bots;
}

async function fetchBotProfile(botId: string): Promise<BotProfile> {
  const resp = await fetch(`/api/bots/${encodeURIComponent(botId)}`, {
    headers: { accept: 'application/json' },
  });
  if (resp.status === 404) throw new BotNotFound();
  if (!resp.ok) throw new Error(`bot_profile_failed_${resp.status}`);
  const data = (await resp.json()) as { bot: BotProfile };
  return data.bot;
}

// ── Directory ───────────────────────────────────────────────────────────────

function buildBotDirectorySections(bots: BotProfile[]): HTMLElement[] {
  const system = bots.filter((bot) => bot.ownerType === 'system');
  const ladder = system
    .filter((bot) => bot.id.startsWith(LADDER_BOT_ID_PREFIX))
    .sort((a, b) => ladderLevel(a) - ladderLevel(b));
  const featured = system.filter((bot) => !bot.id.startsWith(LADDER_BOT_ID_PREFIX));
  const community = bots.filter((bot) => bot.ownerType === 'user');

  const groups: Array<{ title: string; rows: HTMLElement[] }> = [
    { title: 'Featured', rows: featured.map(buildFeaturedRow) },
    { title: 'Fairy-Stockfish ladder', rows: ladder.map(buildLadderRow) },
    { title: 'Community bots', rows: community.map(buildFeaturedRow) },
  ];
  return groups.filter((group) => group.rows.length > 0).map(buildRosterSection);
}

function ladderLevel(bot: BotProfile): number {
  const level = Number.parseInt(bot.id.slice(LADDER_BOT_ID_PREFIX.length), 10);
  return Number.isFinite(level) ? level : Number.MAX_SAFE_INTEGER;
}

function buildRosterSection(group: { title: string; rows: HTMLElement[] }): HTMLElement {
  const section = document.createElement('section');
  section.className = 'bot-roster-section';

  const header = document.createElement('div');
  header.className = 'bot-roster-header';

  const title = document.createElement('h2');
  title.textContent = group.title;

  const count = document.createElement('span');
  count.className = 'bot-roster-count';
  count.textContent = `${group.rows.length} ${group.rows.length === 1 ? 'bot' : 'bots'}`;

  header.append(title, count);

  const list = document.createElement('div');
  list.className = 'bot-roster';
  list.append(...group.rows);

  section.append(header, list);
  return section;
}

// Featured (and community) row: marker, name + bio + one chip per variant,
// primary rating and games on the right.
function buildFeaturedRow(bot: BotProfile): HTMLElement {
  const row = document.createElement('article');
  row.className = 'bot-row bot-row-featured';

  const marker = variantThumb(bot.defaultGameSpecId, 40, 'bot-row-marker');
  if (marker) row.append(marker);

  const body = document.createElement('div');
  body.className = 'bot-row-body';

  const title = document.createElement('div');
  title.className = 'bot-row-title';

  const name = document.createElement('a');
  name.className = 'bot-row-name';
  name.href = `/bot/${encodeURIComponent(bot.id)}`;
  name.textContent = bot.displayName;

  const badge = document.createElement('span');
  badge.className = 'bot-badge';
  badge.textContent = 'BOT';

  title.append(name, badge);

  const bio = document.createElement('p');
  bio.className = 'bot-row-bio';
  bio.textContent = bot.bio.trim() || 'Public Mistboard bot profile.';

  const chips = document.createElement('div');
  chips.className = 'bot-row-chips';
  for (const option of playOptionsFor(bot)) chips.append(buildPlayChip(bot, option));

  body.append(title, bio, chips);

  const figures = document.createElement('div');
  figures.className = 'bot-row-figures';

  const ratingSnapshot = primaryRating(bot);
  const ratingValue = document.createElement('span');
  ratingValue.className = 'bot-row-rating';
  ratingValue.textContent = ratingSnapshot ? ratingLabel(ratingSnapshot) : '—';

  const ratingCaption = document.createElement('span');
  ratingCaption.className = 'bot-row-figures-label';
  ratingCaption.textContent = ratingSnapshot
    ? `${gameSpecLabel(ratingSnapshot.gameSpecId)} ${timeClassLabel(ratingSnapshot.timeClass)}`
    : 'Unrated';

  const games = document.createElement('span');
  games.className = 'bot-row-games';
  games.textContent = gameCountLabel(bot.gamesTotal);

  figures.append(ratingValue, ratingCaption, games);

  row.append(body, figures);
  return row;
}

// Ladder row: table-like, one per level. Name, xiangqi blitz rating, then a
// play chip per variant (Fortress may be off in some environments).
function buildLadderRow(bot: BotProfile): HTMLElement {
  const row = document.createElement('article');
  row.className = 'bot-row bot-row-ladder';

  const name = document.createElement('a');
  name.className = 'bot-row-name';
  name.href = `/bot/${encodeURIComponent(bot.id)}`;
  name.textContent = bot.displayName;

  const rating = document.createElement('span');
  rating.className = 'bot-row-rating bot-row-ladder-rating';
  const blitz = botRatings(bot).find(
    (snapshot) => snapshot.gameSpecId === 'xiangqi' && snapshot.timeClass === 'blitz',
  );
  rating.textContent = blitz ? ratingLabel(blitz) : '—';
  rating.title = blitz ? 'Xiangqi blitz rating' : 'No published rating yet';

  const chips = document.createElement('div');
  chips.className = 'bot-row-chips';
  for (const option of playOptionsFor(bot)) chips.append(buildPlayChip(bot, option));

  row.append(name, rating, chips);
  return row;
}

// A playable chip is itself the play control: click starts the game against
// this bot in that variant (random side, the bot's standing clock). Unplayable
// variants render as muted, non-interactive chips.
function buildPlayChip(bot: BotProfile, option: BotPlayOption): HTMLElement {
  const label = gameSpecLabel(option.gameSpecId);

  if (!option.playable) {
    const chip = document.createElement('span');
    chip.className = 'bot-play-chip bot-play-chip-off';
    chip.title = 'Not available right now';
    appendChipContent(chip, option.gameSpecId, label);
    return chip;
  }

  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'bot-play-chip';
  chip.title = `Play ${label} against ${bot.displayName}`;
  const labelEl = appendChipContent(chip, option.gameSpecId, label);

  const arrow = document.createElement('span');
  arrow.className = 'bot-play-chip-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '▸';
  chip.append(arrow);

  bindBotPlayControl(
    chip,
    () => ({ botId: bot.id, gameSpecId: option.gameSpecId, preferredColor: 'random' }),
    {
      onStateChange: (state) => {
        labelEl.textContent =
          state === 'pending' ? 'Starting...' : state === 'error' ? 'Try again' : label;
      },
    },
  );
  return chip;
}

function appendChipContent(chip: HTMLElement, gameSpecId: string, label: string): HTMLElement {
  const thumb = variantThumb(gameSpecId, 16, 'bot-play-chip-thumb');
  if (thumb) chip.append(thumb);
  const labelEl = document.createElement('span');
  labelEl.className = 'bot-play-chip-label';
  labelEl.textContent = label;
  chip.append(labelEl);
  return labelEl;
}

// ── Profile ─────────────────────────────────────────────────────────────────

function buildBotHeader(bot: BotProfile): HTMLElement {
  const games = document.createElement('span');
  games.className = 'profile-game-count';
  games.textContent = gameCountLabel(bot.gamesTotal);

  const badge = document.createElement('span');
  badge.className = 'profile-role-badge profile-role-bot';
  badge.textContent = 'BOT';

  const owner = document.createElement('span');
  owner.className = 'profile-role-badge profile-role-owner';
  owner.textContent = bot.ownerType === 'system' ? 'First-party' : 'Community';

  return buildProfileHeaderShell({
    eyebrow: 'Bot profile',
    title: bot.displayName,
    metaParts: [games, badge, owner],
    stats: buildBotStats(bot),
  });
}

// Trimmed to what matters: primary rating, record, games, variants count. The
// raw engine id is provenance, not a stat; it lives in the About panel.
function buildBotStats(bot: BotProfile): HTMLElement {
  const stats = document.createElement('div');
  stats.className = 'profile-stats bot-stats';
  const cells: HTMLElement[] = [];
  const ratingSnapshot = primaryRating(bot);
  if (ratingSnapshot) {
    cells.push(
      statCell(
        ratingLabel(ratingSnapshot),
        `${gameSpecLabel(ratingSnapshot.gameSpecId)} ${timeClassLabel(ratingSnapshot.timeClass)}`,
      ),
    );
  }
  cells.push(
    statCell(recordLabel(bot.record), 'Record'),
    statCell(new Intl.NumberFormat().format(bot.gamesTotal), 'Games'),
    statCell(String(playOptionsFor(bot).length), 'Variants'),
  );
  stats.append(...cells);
  return stats;
}

function statCell(value: string, label: string): HTMLElement {
  const stat = document.createElement('div');
  stat.className = 'profile-stat';

  const valueEl = document.createElement('span');
  valueEl.className = 'profile-stat-value';
  valueEl.textContent = value;

  const labelEl = document.createElement('span');
  labelEl.className = 'profile-stat-label';
  labelEl.textContent = label;

  stat.append(valueEl, labelEl);
  return stat;
}

// "Play <name>" panel: one row per supported variant, each with a direct-play
// button. Unplayable variants stay listed but muted, with no action.
function buildBotPlayPanel(bot: BotProfile): HTMLElement {
  const section = document.createElement('section');
  section.className = 'bot-panel bot-profile-play';

  const heading = document.createElement('h2');
  heading.textContent = `Play ${bot.displayName}`;
  section.append(heading);

  const list = document.createElement('div');
  list.className = 'bot-play-list';
  for (const option of playOptionsFor(bot)) list.append(buildPlayRow(bot, option));
  section.append(list);
  return section;
}

function buildPlayRow(bot: BotProfile, option: BotPlayOption): HTMLElement {
  const row = document.createElement('div');
  row.className = option.playable ? 'bot-play-row' : 'bot-play-row bot-play-row-off';

  const thumb = variantThumb(option.gameSpecId, 32, 'bot-play-row-marker');
  if (thumb) row.append(thumb);

  const meta = document.createElement('div');
  meta.className = 'bot-play-row-meta';

  const name = document.createElement('span');
  name.className = 'bot-play-row-name';
  name.textContent = gameSpecLabel(option.gameSpecId);

  const clock = document.createElement('span');
  clock.className = 'bot-play-row-clock';
  clock.textContent = option.playable
    ? `${timeControlLabel(bot.play.timeControl)} · random side`
    : 'Not available right now';

  meta.append(name, clock);
  row.append(meta);

  if (option.playable) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'landing-setup-start bot-play-row-button';
    button.textContent = 'Play';
    bindBotPlayControl(
      button,
      () => ({ botId: bot.id, gameSpecId: option.gameSpecId, preferredColor: 'random' }),
      { pendingLabel: 'Starting...', errorLabel: 'Try again' },
    );
    row.append(button);
  }

  return row;
}

// Sidebar rating rail in the player-profile idiom: one compact row per
// published variant/time-class snapshot.
function buildBotRatingsRail(bot: BotProfile): HTMLElement {
  const section = document.createElement('section');
  section.className = 'profile-ratings bot-profile-ratings';

  const heading = document.createElement('h2');
  heading.className = 'profile-ratings-heading';
  heading.textContent = 'Ratings';
  section.append(heading);

  const ratings = botRatings(bot);
  if (ratings.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'profile-ratings-empty';
    empty.textContent = 'No published rating yet.';
    section.append(empty);
    return section;
  }

  const rail = document.createElement('div');
  rail.className = 'profile-ratings-rail';
  for (const rating of ratings) rail.append(buildBotRatingRow(rating));
  section.append(rail);
  return section;
}

function buildBotRatingRow(rating: BotRatingSnapshot): HTMLElement {
  const row = document.createElement('div');
  row.className = 'profile-rating-row bot-rating-row';

  const thumb = variantThumb(rating.gameSpecId, 32, 'profile-rating-thumb');
  if (thumb) row.append(thumb);

  const meta = document.createElement('div');
  meta.className = 'profile-rating-meta';

  const name = document.createElement('span');
  name.className = 'profile-rating-name';
  name.textContent = `${gameSpecLabel(rating.gameSpecId)} · ${timeClassLabel(rating.timeClass)}`;

  const figures = document.createElement('span');
  figures.className = 'profile-rating-figures';

  const value = document.createElement('span');
  value.className = 'profile-rating-value';
  value.textContent = new Intl.NumberFormat().format(rating.rating);
  if (rating.provisional) {
    const q = document.createElement('span');
    q.className = 'profile-rating-q';
    q.textContent = '?';
    value.append(q);
  }

  const games = document.createElement('span');
  games.className = 'profile-rating-games';
  games.textContent = `${rating.games} rated ${rating.games === 1 ? 'game' : 'games'}`;

  figures.append(value, games);
  meta.append(name, figures);
  row.append(meta);
  return row;
}

function buildBotAbout(bot: BotProfile): HTMLElement {
  const section = document.createElement('section');
  section.className = 'bot-panel bot-profile-about';

  const heading = document.createElement('h2');
  heading.textContent = 'About';
  section.append(heading);

  const body = document.createElement('div');
  body.className = 'bot-profile-about-body';

  if (bot.bio.trim().length > 0) {
    const bio = document.createElement('p');
    bio.textContent = bot.bio;
    body.append(bio);
  }

  const engineIds = [...new Set(playOptionsFor(bot).map((option) => option.engineId))];
  if (engineIds.length > 0) {
    const provenance = document.createElement('p');
    provenance.className = 'bot-profile-provenance';
    provenance.textContent = `${engineIds.length === 1 ? 'Engine' : 'Engines'}: ${engineIds.join(', ')}`;
    body.append(provenance);
  }

  section.append(body);
  return section;
}

function buildRecentGames(bot: BotProfile): HTMLElement {
  const section = document.createElement('section');
  section.className = 'bot-panel profile-games bot-profile-games';

  const heading = document.createElement('h2');
  heading.textContent = 'Recent games';
  section.append(heading);

  const games = bot.games ?? [];
  if (games.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'landing-games-empty';
    empty.textContent = 'No completed games yet.';
    section.append(empty);
    return section;
  }

  const list = document.createElement('ol');
  list.className = 'profile-game-list';
  for (const game of games) list.append(buildProfileGameRow(game));
  section.append(list);
  return section;
}

// ── Shared helpers ──────────────────────────────────────────────────────────

function variantThumb(gameSpecId: string, size: number, className: string): HTMLElement | null {
  const miniId = variantMiniIdForRawVariant(gameSpecId);
  if (!miniId) return null;
  const thumb = document.createElement('span');
  thumb.className = className;
  thumb.setAttribute('aria-hidden', 'true');
  thumb.innerHTML = renderVariantMarker(miniId, { size });
  return thumb;
}

function statusLine(text: string): HTMLElement {
  const p = document.createElement('p');
  p.className = 'bots-status';
  p.textContent = text;
  return p;
}

function playOptionsFor(bot: BotProfile): BotPlayOption[] {
  const options =
    bot.playOptions && bot.playOptions.length > 0
      ? bot.playOptions
      : supportedGameSpecIds(bot).map((gameSpecId) => ({
          gameSpecId,
          engineId: bot.activeEngineId,
          playable: true,
        }));
  return options.filter((option) => !HIDDEN_BOT_GAME_SPEC_IDS.has(option.gameSpecId));
}

function supportedGameSpecIds(bot: BotProfile): string[] {
  const gameSpecIds =
    bot.supportedGameSpecIds.length > 0 ? bot.supportedGameSpecIds : [bot.defaultGameSpecId];
  return gameSpecIds.filter((gameSpecId) => !HIDDEN_BOT_GAME_SPEC_IDS.has(gameSpecId));
}

function botRatings(bot: BotProfile): BotRatingSnapshot[] {
  const ratings =
    bot.ratings && bot.ratings.length > 0 ? bot.ratings : bot.rating ? [bot.rating] : [];
  return ratings.filter((rating) => !HIDDEN_BOT_GAME_SPEC_IDS.has(rating.gameSpecId));
}

function primaryRating(bot: BotProfile): BotRatingSnapshot | null {
  const ratings = botRatings(bot);
  return (
    ratings.find(
      (rating) => rating.gameSpecId === bot.defaultGameSpecId && rating.timeClass === 'blitz',
    ) ??
    bot.rating ??
    ratings[0] ??
    null
  );
}

function gameSpecLabel(gameSpecId: string): string {
  return GAME_SPEC_LABELS[gameSpecId] ?? maybeGameSpecForId(gameSpecId)?.publicName ?? gameSpecId;
}

function timeControlLabel(timeControl: BotProfile['play']['timeControl']): string {
  const initialMinutes = timeControl.initialMs / 60_000;
  const incrementSeconds = timeControl.incrementMs / 1_000;
  if (Number.isInteger(initialMinutes) && Number.isInteger(incrementSeconds)) {
    return `${initialMinutes}+${incrementSeconds}`;
  }
  return `${Math.round(timeControl.initialMs / 1_000)}s + ${Math.round(
    timeControl.incrementMs / 1_000,
  )}s`;
}

function gameCountLabel(games: number): string {
  return `${new Intl.NumberFormat().format(games)} ${games === 1 ? 'game' : 'games'}`;
}

function recordLabel(record: BotRecord): string {
  return `${record.wins}-${record.losses}-${record.draws}`;
}

function ratingLabel(rating: BotRatingSnapshot): string {
  return `${new Intl.NumberFormat().format(rating.rating)}${rating.provisional ? '?' : ''}`;
}

function timeClassLabel(timeClass: BotRatingSnapshot['timeClass']): string {
  return timeClass[0].toUpperCase() + timeClass.slice(1);
}
