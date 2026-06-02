// Unlisted admin per-engine profile (/engine/:id). Reuses the player-profile
// surface primitives (header shell + game rows + CSS) so it renders as a sibling
// of /@handle; the middle block shows the engine's PvE (headline) and EvE
// (secondary) records instead of rating buckets. Admin-gated by
// /api/admin/engines/:id (open in local dev). No nav entry; reached from /engines.
import './account-profile.css';
import './engine-profile.css';
import type { FeaturedGame } from './game-display.js';
import { buildProfileGameRow, buildProfileHeaderShell } from './profile-ui.js';
import { buildFooter, buildNav, buildNotice } from './site-shell.js';

type ModeRecord = { games: number; wins: number; losses: number; draws: number };

type EngineProfile = {
  engineId: string;
  name: string | null;
  pve: ModeRecord;
  eve: ModeRecord;
  recentPveGames: FeaturedGame[];
};

class AdminRequiredError extends Error {}
class EngineNotFound extends Error {}

export async function mountEngineProfile(root: HTMLElement, engineId: string): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page', 'profile-route');

  const shell = document.createElement('main');
  shell.className = 'profile-shell';
  root.append(buildNav(), shell, buildFooter());

  let profile: EngineProfile;
  try {
    profile = await fetchProfile(engineId);
  } catch (err) {
    if (err instanceof EngineNotFound) {
      document.title = 'Engine not found · Mistboard';
      shell.append(buildNotice('Engine not found', 'No such engine, or it has no recorded games.'));
      return;
    }
    shell.append(
      buildNotice(
        'Could not load engine',
        err instanceof AdminRequiredError ? err.message : 'Please try again.',
      ),
    );
    return;
  }

  document.title = `${profile.name ?? profile.engineId} · Engine · Mistboard`;
  shell.append(buildHeader(profile), buildRecords(profile), buildRecentGames(profile));
}

async function fetchProfile(engineId: string): Promise<EngineProfile> {
  const resp = await fetch(`/api/admin/engines/${encodeURIComponent(engineId)}`, {
    headers: { accept: 'application/json' },
  });
  if (resp.status === 403) {
    throw new AdminRequiredError('Admin access required. Sign in with an admin account.');
  }
  if (resp.status === 404) throw new EngineNotFound();
  if (!resp.ok) throw new Error(`engine_profile_failed_${resp.status}`);
  const data = (await resp.json()) as { profile: EngineProfile };
  return data.profile;
}

function buildHeader(profile: EngineProfile): HTMLElement {
  const metaParts: HTMLElement[] = [];

  if (profile.name && profile.name !== profile.engineId) {
    const id = document.createElement('span');
    id.className = 'profile-handle';
    id.textContent = profile.engineId;
    metaParts.push(id);
  }

  const total = profile.pve.games + profile.eve.games;
  const games = document.createElement('span');
  games.className = 'profile-game-count';
  games.textContent = `${total} ${total === 1 ? 'game' : 'games'}`;
  metaParts.push(games);

  const badge = document.createElement('span');
  badge.className = 'profile-role-badge profile-role-admin';
  badge.textContent = 'Engine';
  metaParts.push(badge);

  return buildProfileHeaderShell({
    eyebrow: 'Engine profile',
    title: profile.name ?? profile.engineId,
    metaParts,
  });
}

function buildRecords(profile: EngineProfile): HTMLElement {
  const section = document.createElement('section');
  section.className = 'engine-records';
  // PvE is the headline (record vs human players); EvE (vs other engine versions
  // and the anchor, including mirror self-play) is secondary calibration.
  section.append(recordCard('vs Humans (PvE)', profile.pve, true));
  section.append(recordCard('vs Engines (EvE)', profile.eve, false));
  return section;
}

function recordCard(label: string, record: ModeRecord, primary: boolean): HTMLElement {
  const card = document.createElement('div');
  card.className = primary ? 'engine-record engine-record-primary' : 'engine-record';

  const h = document.createElement('h2');
  h.className = 'engine-record-label';
  h.textContent = label;

  const wld = document.createElement('p');
  wld.className = 'engine-record-wld';
  if (record.games === 0) {
    wld.textContent = 'No games yet';
  } else {
    const decided = record.wins + record.losses;
    const pct = decided > 0 ? ` · ${Math.round((record.wins / decided) * 100)}% win` : '';
    wld.textContent = `${record.wins}–${record.losses}–${record.draws}${pct}`;
  }

  const games = document.createElement('p');
  games.className = 'engine-record-games';
  games.textContent = record.games === 1 ? '1 game' : `${record.games} games`;

  card.append(h, wld, games);
  return card;
}

function buildRecentGames(profile: EngineProfile): HTMLElement {
  const section = document.createElement('section');
  section.className = 'profile-games';

  const heading = document.createElement('h2');
  heading.textContent = 'Recent games vs humans';
  section.append(heading);

  if (profile.recentPveGames.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'landing-games-empty';
    empty.textContent = 'No games vs humans yet.';
    section.append(empty);
    return section;
  }

  const list = document.createElement('ol');
  list.className = 'profile-game-list';
  for (const game of profile.recentPveGames) list.append(buildProfileGameRow(game));
  section.append(list);
  return section;
}
