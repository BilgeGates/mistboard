import { maybeGameSpecForId } from '@mistboard/game';
import './account-profile.css';
import './bots.css';
import type { FeaturedGame } from './game-display.js';
import { buildProfileGameRow, buildProfileHeaderShell } from './profile-ui.js';
import { buildNav, buildNotice } from './site-shell.js';

type BotPlay = {
  mode: 'pve';
  gameSpecId: string;
  engineId: string;
  timeControl: {
    initialMs: number;
    incrementMs: number;
  };
  preferredColor: 'random';
};

type BotProfile = {
  id: string;
  displayName: string;
  bio: string;
  activeEngineId: string;
  defaultGameSpecId: string;
  supportedGameSpecIds: string[];
  play: BotPlay;
  gamesTotal: number;
  games?: FeaturedGame[];
};

class BotNotFound extends Error {}

const GAME_SPEC_LABELS: Record<string, string> = {
  'dark-chess': 'Dark Chess',
  'dark-draft960': 'Dark Draft960',
  'dark-mini-xiangqi': 'Dark Mini Xiangqi',
  jieqi: 'Jieqi',
  banqi: 'Banqi',
  'crossroads-chess': 'Crossroads Chess',
};

export async function mountBots(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page', 'bots-route');

  const shell = document.createElement('main');
  shell.className = 'site-section bots-shell';

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
  sub.textContent = 'First-party Mistboard opponents.';

  header.append(eyebrow, heading, sub);

  const body = document.createElement('section');
  body.className = 'bots-directory';
  body.append(statusLine('Loading bots...'));

  shell.append(header, body);
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

  body.replaceChildren(...bots.map(buildBotCard));
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
  shell.append(buildBotHeader(bot), buildBotPlayPanel(bot));
  if (bot.bio.trim().length > 0) shell.append(buildBotAbout(bot));
  shell.append(buildRecentGames(bot));
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

function buildBotCard(bot: BotProfile): HTMLElement {
  const card = document.createElement('article');
  card.className = 'bot-card';

  const title = document.createElement('a');
  title.className = 'bot-card-title';
  title.href = `/bot/${encodeURIComponent(bot.id)}`;
  title.textContent = bot.displayName;

  const details = document.createElement('div');
  details.className = 'bot-card-details';
  details.append(
    detailChip(defaultGameSpecLabel(bot)),
    detailChip(timeControlLabel(bot.play.timeControl)),
    detailChip(gameCountLabel(bot.gamesTotal)),
  );

  const variants = document.createElement('div');
  variants.className = 'bot-variant-list';
  for (const gameSpecId of supportedGameSpecIds(bot)) {
    variants.append(detailChip(gameSpecLabel(gameSpecId), 'bot-variant-chip'));
  }

  const actions = document.createElement('div');
  actions.className = 'bot-card-actions';
  actions.append(buildPlayButton(bot));

  const profile = document.createElement('a');
  profile.className = 'bot-profile-link';
  profile.href = title.href;
  profile.textContent = 'Profile';
  actions.append(profile);

  card.append(title, details, variants, actions);
  return card;
}

function buildBotHeader(bot: BotProfile): HTMLElement {
  const games = document.createElement('span');
  games.className = 'profile-game-count';
  games.textContent = gameCountLabel(bot.gamesTotal);

  const badge = document.createElement('span');
  badge.className = 'profile-role-badge profile-role-bot';
  badge.textContent = 'Bot';

  return buildProfileHeaderShell({
    eyebrow: 'Bot profile',
    title: bot.displayName,
    metaParts: [games, badge],
    stats: buildBotStats(bot),
  });
}

function buildBotStats(bot: BotProfile): HTMLElement {
  const stats = document.createElement('div');
  stats.className = 'profile-stats bot-stats';
  stats.append(
    statCell(gameSpecLabel(bot.defaultGameSpecId), 'Default'),
    statCell(timeControlLabel(bot.play.timeControl), 'Play clock'),
    statCell(String(supportedGameSpecIds(bot).length), 'Variants'),
  );
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

function buildBotPlayPanel(bot: BotProfile): HTMLElement {
  const section = document.createElement('section');
  section.className = 'bot-profile-play';

  const heading = document.createElement('h2');
  heading.textContent = 'Play';

  const meta = document.createElement('p');
  meta.textContent = `${gameSpecLabel(bot.play.gameSpecId)} · ${timeControlLabel(
    bot.play.timeControl,
  )}`;

  section.append(heading, meta, buildPlayButton(bot));
  return section;
}

function buildBotAbout(bot: BotProfile): HTMLElement {
  const section = document.createElement('section');
  section.className = 'bot-profile-about';

  const heading = document.createElement('h2');
  heading.textContent = 'About';

  const body = document.createElement('p');
  body.textContent = bot.bio;

  section.append(heading, body);
  return section;
}

function buildRecentGames(bot: BotProfile): HTMLElement {
  const section = document.createElement('section');
  section.className = 'profile-games';

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

function buildPlayButton(bot: BotProfile): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'landing-setup-start bot-play-button';
  button.textContent = 'Play';
  button.addEventListener('click', () => {
    void startBotGame(bot, button);
  });
  return button;
}

async function startBotGame(bot: BotProfile, button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  button.classList.remove('bot-play-button-error');
  button.textContent = 'Starting...';
  try {
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(roomRequestForBot(bot)),
    });
    if (!response.ok) throw new Error(`room_create_failed_${response.status}`);
    const data = (await response.json()) as { url?: string };
    if (!data.url) throw new Error('room_create_missing_url');
    window.location.href = data.url;
  } catch {
    button.disabled = false;
    button.classList.add('bot-play-button-error');
    button.textContent = 'Try again';
  }
}

function roomRequestForBot(bot: BotProfile): Record<string, unknown> {
  const body: Record<string, unknown> = {
    mode: bot.play.mode,
    gameSpecId: bot.play.gameSpecId,
    engineId: bot.play.engineId,
    timeControl: bot.play.timeControl,
    preferredColor: bot.play.preferredColor,
    rated: false,
  };
  if (bot.play.gameSpecId === 'dark-chess') body.variant = 'dark-chess';
  if (bot.play.gameSpecId === 'dark-draft960') {
    body.variant = 'dark-chess';
    body.hiddenDraft960 = true;
  }
  return body;
}

function detailChip(label: string, extraClass?: string): HTMLElement {
  const chip = document.createElement('span');
  chip.className = extraClass ? `bot-chip ${extraClass}` : 'bot-chip';
  chip.textContent = label;
  return chip;
}

function statusLine(text: string): HTMLElement {
  const p = document.createElement('p');
  p.className = 'bots-status';
  p.textContent = text;
  return p;
}

function supportedGameSpecIds(bot: BotProfile): string[] {
  return bot.supportedGameSpecIds.length > 0 ? bot.supportedGameSpecIds : [bot.defaultGameSpecId];
}

function defaultGameSpecLabel(bot: BotProfile): string {
  return gameSpecLabel(bot.defaultGameSpecId);
}

function gameSpecLabel(gameSpecId: string): string {
  return GAME_SPEC_LABELS[gameSpecId] ?? maybeGameSpecForId(gameSpecId)?.publicName ?? gameSpecId;
}

function timeControlLabel(timeControl: BotPlay['timeControl']): string {
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
