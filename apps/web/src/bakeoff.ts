import './bakeoff.css';
import { type Annotation, loadAnnotations } from './annotations.js';
import { type BeliefRow, loadBeliefRows, loadTraceRows, type TraceRow } from './belief-panel.js';
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

const DEFAULT_MANIFEST_URL = '/bakeoff-v0.7.12-rung2-transition-fast/manifest.json';
const BAKEOFF_ENGINE_LABEL = 'Mistboard Engine';

export async function mountBakeoff(
  root: HTMLElement,
  manifestUrl: string = DEFAULT_MANIFEST_URL,
): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const initialGameIndex = parseOptionalInt(params.get('game') ?? params.get('gameIndex'));
  const initialPly = parseOptionalInt(params.get('ply'));
  const captureMode = params.get('capture') === 'belief';
  const requestedBeliefSeat = params.get('beliefSeat') ?? params.get('seat');

  const resp = await fetch(manifestUrl);
  if (!resp.ok) {
    root.textContent = `failed to load manifest at ${manifestUrl}: ${resp.status}`;
    return;
  }
  const contentType = resp.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    root.textContent =
      `failed to load manifest at ${manifestUrl}: expected JSON but got ${contentType || 'unknown content type'}. ` +
      'This usually means the bakeoff manifest path does not exist under apps/web/public.';
    return;
  }
  const manifest = (await resp.json()) as Manifest;

  // The manifest's `path` is relative to the manifest dir
  // (e.g. "games/game-0021-W-tier1-white.jsonl"). Derive base from the URL.
  const lastSlash = manifestUrl.lastIndexOf('/');
  const baseDir = lastSlash >= 0 ? manifestUrl.slice(0, lastSlash) : '';
  const beliefRowsByGame = new Map<number, BeliefRow[]>();
  const traceRowsByGame = new Map<number, TraceRow[]>();
  let beliefLoadError: string | null = null;
  if (manifest.verbose_belief === true) {
    try {
      const rows = await loadBeliefRows(`${baseDir}/belief.jsonl`);
      for (const row of rows) {
        const group = beliefRowsByGame.get(row.game_index) ?? [];
        group.push(row);
        beliefRowsByGame.set(row.game_index, group);
      }
      const traceRows = await loadTraceRows(`${baseDir}/trace.jsonl`);
      for (const row of traceRows) {
        const group = traceRowsByGame.get(row.game_index) ?? [];
        group.push(row);
        traceRowsByGame.set(row.game_index, group);
      }
    } catch (err) {
      beliefLoadError = (err as Error).message;
    }
  }

  root.replaceChildren();
  root.classList.add('bakeoff-page');
  root.classList.toggle('bakeoff-capture-mode', captureMode);

  const topbar = document.createElement('header');
  topbar.className = 'bakeoff-topbar';

  const titleWrap = document.createElement('div');
  const title = document.createElement('h1');
  title.textContent = 'Lab';
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
    ? `<div class="bakeoff-header-version">${BAKEOFF_ENGINE_LABEL} ${manifest.tier1_version}${manifest.tier1_commit ? ` · ${manifest.tier1_commit}` : ''}</div>`
    : '';
  header.innerHTML = `
    ${versionLine}
    <div class="bakeoff-header-line">${manifest.games.length} games saved</div>
    <div class="bakeoff-header-line">${BAKEOFF_ENGINE_LABEL} ${r.wins}W ${r.losses}L ${r.draws}D</div>
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
      <div>outcome=${game.outcome} engine=${game.tier1_color} plies=${game.plies} end=${game.end_reason}</div>
      <div>belief=${requestedBeliefSeat ? `seat ${requestedBeliefSeat}` : `reviewed side ${game.tier1_color}`}</div>
      <div>seed=${game.tier1_seed}${game.truncated ? ' truncated' : ''}</div>
    `;
    void mountReplay(replayArea, game.path, {
      urlForId,
      orientation: game.tier1_color,
      annotation: {
        manifestUrl,
        gameIndexForSampleId,
        tier1ColorForSampleId,
        onSaved: () => void refreshAnnotationCounts(),
      },
      belief:
        manifest.verbose_belief === true
          ? {
              rowsForSampleId(sampleId) {
                const idx = gameIndexForSampleId(sampleId);
                if (idx === null) return [];
                return (beliefRowsByGame.get(idx) ?? []).filter((row) =>
                  requestedBeliefSeat
                    ? row.tier1_seat === requestedBeliefSeat
                    : row.tier1_side === game.tier1_color,
                );
              },
              traceRowsForSampleId(sampleId) {
                const idx = gameIndexForSampleId(sampleId);
                if (idx === null) return [];
                return (traceRowsByGame.get(idx) ?? []).filter((row) =>
                  requestedBeliefSeat
                    ? row.tier1_seat === requestedBeliefSeat
                    : row.tier1_side === game.tier1_color,
                );
              },
            }
          : undefined,
      initialPly,
    });
  }

  for (const game of manifest.games) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `bakeoff-game-item bakeoff-${game.outcome}`;
    btn.dataset.gameIndex = String(game.index);
    const truncMark = game.truncated ? ' ⏱' : '';
    btn.innerHTML = `
      <span class="bakeoff-game-id">#${game.index + 1}</span>
      <span class="bakeoff-game-qid">q${game.index}</span>
      <span class="bakeoff-game-outcome">${game.outcome}</span>
      <span class="bakeoff-game-color">engine=${game.tier1_color[0]}</span>
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
    const initialIdx = initialGameIndex ?? manifest.games[0]?.index;
    const initialGame =
      manifest.games.find((game) => game.index === initialIdx) ?? manifest.games[0];
    const initialBtn = initialGame
      ? list.querySelector<HTMLButtonElement>(`[data-game-index="${initialGame.index}"]`)
      : null;
    if (initialGame && initialBtn) loadGame(initialGame, initialBtn);
  }
}

function parseOptionalInt(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isInteger(n) ? n : undefined;
}
