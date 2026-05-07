import { mountReplay } from './replay.js';
import { loadAnnotations, type Annotation } from './annotations.js';

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
  tier1_version?: string;
  tier1_commit?: string;
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

const DEFAULT_MANIFEST_URL = '/bakeoff-v0.6.0-mirror/manifest.json';

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

  const topbar = document.createElement('header');
  topbar.className = 'bakeoff-topbar';

  const titleWrap = document.createElement('div');
  const title = document.createElement('h1');
  title.textContent = 'Engine Lab';
  const subtitle = document.createElement('p');
  subtitle.textContent = 'Review engine games and annotate what to fix next.';
  titleWrap.append(title, subtitle);

  const homeLink = document.createElement('a');
  homeLink.href = '/';
  homeLink.textContent = 'Home';

  topbar.append(titleWrap, homeLink);

  const layout = document.createElement('div');
  layout.className = 'bakeoff-layout';

  const sidebar = document.createElement('div');
  sidebar.className = 'bakeoff-sidebar';

  const replayArea = document.createElement('div');
  replayArea.className = 'bakeoff-replay-area';

  layout.append(sidebar, replayArea);
  root.append(topbar, layout);

  const r = manifest.tier1_record;
  const header = document.createElement('div');
  header.className = 'bakeoff-header';
  const versionLine = manifest.tier1_version
    ? `<div class="bakeoff-header-version">Tier-1 v${manifest.tier1_version}${manifest.tier1_commit ? ` · ${manifest.tier1_commit}` : ''}</div>`
    : '';
  header.innerHTML = `
    ${versionLine}
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

  const gameByPath = new Map<string, ManifestGame>();
  for (const g of manifest.games) gameByPath.set(g.path, g);
  const gameIndexForSampleId = (sampleId: string): number | null => {
    return gameByPath.get(sampleId)?.index ?? null;
  };
  const tier1ColorForSampleId = (sampleId: string): 'white' | 'black' | null => {
    return gameByPath.get(sampleId)?.tier1_color ?? null;
  };

  const badgeByIndex = new Map<number, HTMLSpanElement>();

  async function refreshAnnotationCounts(): Promise<void> {
    const all: Annotation[] = await loadAnnotations();
    const counts = new Map<number, number>();
    for (const a of all) {
      if (a.manifest_url !== manifestUrl) continue;
      counts.set(a.game_index, (counts.get(a.game_index) ?? 0) + 1);
    }
    for (const [idx, badge] of badgeByIndex) {
      const n = counts.get(idx) ?? 0;
      badge.textContent = n > 0 ? `★${n}` : '';
    }
  }

  function loadGame(game: ManifestGame, btn: HTMLButtonElement): void {
    if (activeBtn) activeBtn.classList.remove('active');
    btn.classList.add('active');
    activeBtn = btn;
    void mountReplay(replayArea, game.path, {
      urlForId,
      annotation: {
        manifestUrl,
        gameIndexForSampleId,
        tier1ColorForSampleId,
        onSaved: () => void refreshAnnotationCounts(),
      },
    });
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
      <span class="bakeoff-game-notes"></span>
    `;
    btn.title = `seed=${game.tier1_seed} end=${game.end_reason}`;
    btn.addEventListener('click', () => loadGame(game, btn));
    list.append(btn);
    const badge = btn.querySelector('.bakeoff-game-notes') as HTMLSpanElement;
    badgeByIndex.set(game.index, badge);
  }

  await refreshAnnotationCounts();

  if (manifest.games.length > 0) {
    const firstBtn = list.firstElementChild as HTMLButtonElement | null;
    if (firstBtn) loadGame(manifest.games[0], firstBtn);
  }
}
