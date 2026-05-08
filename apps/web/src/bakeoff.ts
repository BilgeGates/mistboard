import { mountReplay } from './replay.js';
import { loadAnnotations, type Annotation } from './annotations.js';
import { loadBeliefRows, type BeliefRow } from './belief-panel.js';

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
  verbose_belief?: boolean;
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
  const beliefRowsByGame = new Map<number, BeliefRow[]>();
  let beliefLoadError: string | null = null;
  if (manifest.verbose_belief === true) {
    try {
      const rows = await loadBeliefRows(`${baseDir}/belief.jsonl`);
      for (const row of rows) {
        const group = beliefRowsByGame.get(row.game_index) ?? [];
        group.push(row);
        beliefRowsByGame.set(row.game_index, group);
      }
    } catch (err) {
      beliefLoadError = (err as Error).message;
    }
  }

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
  if (beliefLoadError) {
    const warning = document.createElement('div');
    warning.className = 'bakeoff-belief-warning';
    warning.textContent = beliefLoadError;
    sidebar.append(warning);
  }

  const list = document.createElement('div');
  list.className = 'bakeoff-game-list';
  sidebar.append(list);

  const activeMeta = document.createElement('div');
  activeMeta.className = 'bakeoff-active-meta';
  sidebar.append(activeMeta);

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

  const annotationKey = (game: Pick<ManifestGame, 'index' | 'path'>): string =>
    `${game.index}\u0000${game.path}`;
  const badgeByGame = new Map<string, HTMLSpanElement>();

  async function refreshAnnotationCounts(): Promise<void> {
    const all: Annotation[] = await loadAnnotations();
    const counts = new Map<string, number>();
    for (const a of all) {
      if (a.manifest_url !== manifestUrl) continue;
      const key = `${a.game_index}\u0000${a.game_path}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const [key, badge] of badgeByGame) {
      const n = counts.get(key) ?? 0;
      badge.textContent = n > 0 ? `★${n}` : '';
    }
  }

  function loadGame(game: ManifestGame, btn: HTMLButtonElement): void {
    if (activeBtn) activeBtn.classList.remove('active');
    btn.classList.add('active');
    activeBtn = btn;
    activeMeta.innerHTML = `
      <div class="bakeoff-active-title">queue game ${game.index} · sidebar #${game.index + 1}</div>
      <div>${game.path}</div>
      <div>outcome=${game.outcome} tier1=${game.tier1_color} plies=${game.plies} end=${game.end_reason}</div>
      <div>seed=${game.tier1_seed}${game.truncated ? ' truncated' : ''}</div>
    `;
    void mountReplay(replayArea, game.path, {
      urlForId,
      annotation: {
        manifestUrl,
        gameIndexForSampleId,
        tier1ColorForSampleId,
        onSaved: () => void refreshAnnotationCounts(),
      },
      belief: manifest.verbose_belief === true
        ? {
            rowsForSampleId(sampleId) {
              const idx = gameIndexForSampleId(sampleId);
              return idx === null ? [] : (beliefRowsByGame.get(idx) ?? []);
            },
          }
        : undefined,
    });
  }

  for (const game of manifest.games) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `bakeoff-game-item bakeoff-${game.outcome}`;
    const truncMark = game.truncated ? ' ⏱' : '';
    btn.innerHTML = `
      <span class="bakeoff-game-id">#${game.index + 1}</span>
      <span class="bakeoff-game-qid">q${game.index}</span>
      <span class="bakeoff-game-outcome">${game.outcome}</span>
      <span class="bakeoff-game-color">tier1=${game.tier1_color[0]}</span>
      <span class="bakeoff-game-plies">${game.plies}p${truncMark}</span>
      <span class="bakeoff-game-notes"></span>
    `;
    btn.title = `queue game ${game.index}; sidebar #${game.index + 1}; ${game.path}; seed=${game.tier1_seed}; end=${game.end_reason}`;
    btn.addEventListener('click', () => loadGame(game, btn));
    list.append(btn);
    const badge = btn.querySelector('.bakeoff-game-notes') as HTMLSpanElement;
    badgeByGame.set(annotationKey(game), badge);
  }

  await refreshAnnotationCounts();

  if (manifest.games.length > 0) {
    const firstBtn = list.firstElementChild as HTMLButtonElement | null;
    if (firstBtn) loadGame(manifest.games[0], firstBtn);
  }
}
