import { mountReplay } from './replay.js';

type ManifestGame = {
  index: number;
  tier1_color: 'white' | 'black';
  outcome: 'W' | 'L' | 'D';
  plies: number;
  end_reason: string;
  truncated: boolean;
  tier1_seed: number;
  random_seed: number;
  path: string;
};

type Manifest = {
  evaluator: string;
  depth: number;
  max_particles: number;
  target_n: number;
  risk_aversion: number;
  threat_lambda: number;
  max_plies: number;
  base_seed: number;
  games_total: number;
  games_saved: number;
  save_only: string;
  tier1_record: { wins: number; losses: number; draws: number };
  games: ManifestGame[];
};

const DEFAULT_MANIFEST_URL = '/bakeoff/manifest.json';

export async function mountBakeoff(
  root: HTMLElement,
  manifestUrl: string = DEFAULT_MANIFEST_URL,
): Promise<void> {
  const resp = await fetch(manifestUrl);
  if (!resp.ok) {
    root.textContent = `failed to load manifest at ${manifestUrl}: ${resp.status}`;
    return;
  }
  const manifest = (await resp.json()) as Manifest;

  // The manifest's `path` is relative to the manifest dir
  // (e.g. "games/game-0021-W-tier1-white.jsonl"). Derive base from the URL.
  const lastSlash = manifestUrl.lastIndexOf('/');
  const baseDir = lastSlash >= 0 ? manifestUrl.slice(0, lastSlash) : '';

  root.replaceChildren();
  root.classList.add('bakeoff-page');

  const layout = document.createElement('div');
  layout.className = 'bakeoff-layout';

  const sidebar = document.createElement('div');
  sidebar.className = 'bakeoff-sidebar';

  const replayArea = document.createElement('div');
  replayArea.className = 'bakeoff-replay-area';

  layout.append(sidebar, replayArea);
  root.append(layout);

  const r = manifest.tier1_record;
  const header = document.createElement('div');
  header.className = 'bakeoff-header';
  header.innerHTML = `
    <div class="bakeoff-header-line">${manifest.games.length} games saved</div>
    <div class="bakeoff-header-line">Tier-1 ${r.wins}W ${r.losses}L ${r.draws}D</div>
    <div class="bakeoff-header-meta">eval=${manifest.evaluator} mp=${manifest.max_particles} target_n=${manifest.target_n}</div>
  `;
  sidebar.append(header);

  const list = document.createElement('div');
  list.className = 'bakeoff-game-list';
  sidebar.append(list);

  let activeBtn: HTMLButtonElement | null = null;

  const urlForId = (id: string) => `${baseDir}/${id}`;

  function loadGame(game: ManifestGame, btn: HTMLButtonElement): void {
    if (activeBtn) activeBtn.classList.remove('active');
    btn.classList.add('active');
    activeBtn = btn;
    void mountReplay(replayArea, game.path, { urlForId });
  }

  for (const game of manifest.games) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `bakeoff-game-item bakeoff-${game.outcome}`;
    const truncMark = game.truncated ? ' ⏱' : '';
    btn.innerHTML = `
      <span class="bakeoff-game-id">#${game.index + 1}</span>
      <span class="bakeoff-game-outcome">${game.outcome}</span>
      <span class="bakeoff-game-color">tier1=${game.tier1_color[0]}</span>
      <span class="bakeoff-game-plies">${game.plies}p${truncMark}</span>
    `;
    btn.title = `seed=${game.tier1_seed} end=${game.end_reason}`;
    btn.addEventListener('click', () => loadGame(game, btn));
    list.append(btn);
  }

  if (manifest.games.length > 0) {
    const firstBtn = list.firstElementChild as HTMLButtonElement | null;
    if (firstBtn) loadGame(manifest.games[0], firstBtn);
  }
}
