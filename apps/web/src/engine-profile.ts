// Unlisted admin per-engine profile (/engine/:id). Mirrors the user profile but
// for an engine version: headline record vs humans (PvE), a secondary self-play
// (EvE) record, and recent PvE games. Admin-gated by /api/admin/engines/:id
// (open in local dev). No nav entry; reached from the /engines roster.
import './engine-profile.css';

type ModeRecord = { games: number; wins: number; losses: number; draws: number };

type GameRow = {
  roomId: string;
  playerColor: string;
  result: string;
  whiteName: string | null;
  blackName: string | null;
  endedAt: string;
  plyCount: number;
  participants: { color: string; displayName: string }[];
};

type EngineProfile = {
  engineId: string;
  name: string | null;
  pve: ModeRecord;
  eve: ModeRecord;
  recentPveGames: GameRow[];
};

class AdminRequiredError extends Error {}
class EngineNotFound extends Error {}

export async function mountEngineProfile(root: HTMLElement, engineId: string): Promise<void> {
  root.replaceChildren();
  root.classList.add('engine-profile-page');

  const shell = document.createElement('main');
  shell.className = 'site-section engine-profile-shell';
  shell.append(statusLine('Loading…'));
  root.append(shell);

  let profile: EngineProfile;
  try {
    profile = await fetchProfile(engineId);
  } catch (err) {
    if (err instanceof EngineNotFound) {
      document.title = 'Engine not found · Mistboard';
      shell.replaceChildren(statusLine('No such engine, or it has no recorded games.'));
      return;
    }
    shell.replaceChildren(
      statusLine(err instanceof AdminRequiredError ? err.message : 'Could not load engine.'),
    );
    return;
  }

  document.title = `${profile.name ?? profile.engineId} · Engine · Mistboard`;
  shell.replaceChildren(buildHeader(profile), buildRecords(profile), buildRecentGames(profile));
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
  const header = document.createElement('header');
  header.className = 'engine-profile-header';

  const title = document.createElement('h1');
  title.className = 'engine-profile-name';
  title.textContent = profile.name ?? profile.engineId;
  header.append(title);

  if (profile.name && profile.name !== profile.engineId) {
    const id = document.createElement('p');
    id.className = 'engine-profile-id';
    id.textContent = profile.engineId;
    header.append(id);
  }

  const badge = document.createElement('span');
  badge.className = 'engine-profile-badge';
  badge.textContent = 'Engine · admin only';
  header.append(badge);

  return header;
}

function buildRecords(profile: EngineProfile): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'engine-records';
  // PvE is the headline: the record vs human players. EvE (self-play / bakeoff)
  // is secondary calibration, not a competitive result.
  wrap.append(recordCard('vs Humans (PvE)', profile.pve, true));
  wrap.append(recordCard('Self-play (EvE)', profile.eve, false));
  return wrap;
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
  const wrap = document.createElement('section');
  wrap.className = 'engine-recent';

  const h = document.createElement('h2');
  h.className = 'engine-recent-heading';
  h.textContent = 'Recent games vs humans';
  wrap.append(h);

  if (profile.recentPveGames.length === 0) {
    wrap.append(statusLine('No PvE games yet.'));
    return wrap;
  }

  const list = document.createElement('div');
  list.className = 'engine-recent-list';
  for (const game of profile.recentPveGames) list.append(gameRow(game));
  wrap.append(list);
  return wrap;
}

function gameRow(game: GameRow): HTMLElement {
  const link = document.createElement('a');
  link.className = 'engine-game-row';
  link.href = `/game/${encodeURIComponent(game.roomId)}`;

  const outcome = engineOutcome(game);
  const tag = document.createElement('span');
  tag.className = `engine-game-result engine-game-${outcome}`;
  tag.textContent = outcome === 'win' ? 'W' : outcome === 'loss' ? 'L' : 'D';
  link.append(tag);

  const opp = document.createElement('span');
  opp.className = 'engine-game-opp';
  opp.textContent = `vs ${opponentName(game)}`;
  link.append(opp);

  const meta = document.createElement('span');
  meta.className = 'engine-game-meta';
  meta.textContent = `${game.plyCount} plies · ${formatDate(game.endedAt)}`;
  link.append(meta);

  return link;
}

function opponentName(game: GameRow): string {
  const opponent = game.participants.find((p) => p.color !== game.playerColor);
  if (opponent?.displayName) return opponent.displayName;
  const fallback = game.playerColor === 'white' ? game.blackName : game.whiteName;
  return fallback ?? 'Unknown';
}

function engineOutcome(game: GameRow): 'win' | 'loss' | 'draw' {
  if (game.result === 'draw') return 'draw';
  const engineWon =
    (game.playerColor === 'white' && game.result === 'white-wins') ||
    (game.playerColor === 'black' && game.result === 'black-wins');
  return engineWon ? 'win' : 'loss';
}

function statusLine(text: string): HTMLElement {
  const p = document.createElement('p');
  p.className = 'engine-profile-status';
  p.textContent = text;
  return p;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
