// Belief-replay viewer: step through a recorded game and see, per ply, the TRUE
// board, BOTH players' FoW views (hidden squares dimmed), and (when present) K
// sampled candidate-truths from the captured seat's belief set P. Data is a
// self-contained `belief-replay` jsonl from mistboard-engine
// scripts/capture_belief_replay.py.
//
// Mounted via ?belief=<src>, where <src> is one of:
//   - a single .jsonl                     → one game
//   - a comma-separated list of .jsonl    → multiple games (switcher)
//   - a .json manifest {"replays":[{path,label},...]}  → multiple games
//
// counts-only captures (header.counts_only) carry |P| per ply but no P samples
// (for games too large to re-enumerate locally, e.g. the 49.9M g0014); the
// viewer then shows boards + the |P| count and hides the samples grid.
import { createReadOnlyBoard } from '@mistboard/board-render/interactive';
import type { Api } from 'chessground/api';
import type * as cg from 'chessground/types';
import type { Color } from '@mistboard/game';

type Fow = { fen: string; hidden: string[] };
type Header = {
  type: 'belief-replay';
  name: string;
  seat: 'white' | 'black';
  orientation: 'white' | 'black';
  n_plies: number;
  counts_only?: boolean;
};
type Ply = {
  type: 'ply';
  ply: number;
  mover: 'white' | 'black';
  move: string;
  true_fen: string;
  fow: { white: Fow; black: Fow };
  seat: 'white' | 'black';
  p_size: number;
  samples: string[];
};
type GameSrc = { path: string; label?: string };
interface GameController {
  prev(): void;
  next(): void;
  flip(): void;
}

const STYLE = `
/* Consume the app's theme tokens (light by default; dark via
   :root[data-effective-theme="dark"], set by initializeThemeSettings on every
   route) so the viewer tracks the site's light/dark setting instead of
   hardcoding a palette. body already gets var(--site-bg)/var(--site-text). */
.br-wrap{max-width:1200px;margin:0 auto;padding:16px;font-family:system-ui,sans-serif;color:var(--site-text)}
.br-switch{margin-bottom:8px;font-size:14px;color:var(--site-muted)}
.br-switch select{background:var(--site-panel);border:1px solid var(--site-border);color:var(--site-text);border-radius:6px;padding:4px 8px;margin-left:6px;font-size:14px}
.br-controls{display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap}
.br-controls input[type=range]{flex:1;min-width:180px}
.br-meta{font-variant-numeric:tabular-nums;font-size:14px;color:var(--site-muted)}
.br-top{display:flex;gap:20px;flex-wrap:wrap;margin-bottom:18px}
.br-cell{width:260px}
.br-cell h3{margin:0 0 6px;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--site-muted)}
.br-samples h3{font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--site-muted);margin:0 0 8px;display:flex;align-items:center;gap:10px}
.br-samples h3 input{width:64px;background:var(--site-panel);border:1px solid var(--site-border);color:var(--site-text);border-radius:4px;padding:2px 6px}
.br-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.br-grid .cg-snap{--cg-w:150px}
/* chessground square aspect: .cg-snap only sets width; supply height here. */
.br-wrap .cg-snap{aspect-ratio:1}
.br-cell .cg-snap{width:260px}
/* Hidden squares = fog: a dark veil that reads as occlusion on either theme. */
.br-hidden{background:rgba(20,20,28,.55)}
.br-btn{background:var(--site-panel);border:1px solid var(--site-border);color:var(--site-text);border-radius:6px;padding:6px 10px;cursor:pointer}
.br-btn:hover{background:var(--site-hover)}
.br-hide{display:none}
`;

function hiddenClasses(hidden: string[]): cg.SquareClasses {
  const m: cg.SquareClasses = new Map();
  for (const sq of hidden) m.set(sq as cg.Key, 'br-hidden');
  return m;
}

async function loadSources(param: string): Promise<GameSrc[]> {
  if (param.endsWith('.json')) {
    const r = await fetch(param);
    if (!r.ok) throw new Error(`failed to load manifest ${param}: ${r.status}`);
    const j = (await r.json()) as unknown;
    const arr = Array.isArray(j) ? j : ((j as { replays?: unknown[] }).replays ?? []);
    return (arr as Array<string | GameSrc>).map((e) => (typeof e === 'string' ? { path: e } : e));
  }
  return param
    .split(',')
    .map((p) => ({ path: p.trim() }))
    .filter((s) => s.path);
}

export async function mountBeliefReplay(root: HTMLElement, param: string): Promise<void> {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  let sources: GameSrc[];
  try {
    sources = await loadSources(param);
  } catch (e) {
    root.textContent = String(e);
    return;
  }
  if (!sources.length) {
    root.textContent = `no belief-replays in ${param}`;
    return;
  }

  root.innerHTML = `
    <div class="br-wrap">
      <div class="br-switch ${sources.length > 1 ? '' : 'br-hide'}">
        game <select class="br-game"></select>
      </div>
      <div class="br-game-host"></div>
    </div>`;
  const sel = root.querySelector('.br-game') as HTMLSelectElement;
  sources.forEach((s, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = s.label ?? s.path.split('/').pop()!.replace(/\.jsonl$/, '');
    sel.appendChild(o);
  });
  const host = root.querySelector('.br-game-host') as HTMLElement;

  // One document-level key handler delegates to whichever game is active, so we
  // don't stack listeners each time the game switches.
  let current: GameController | null = null;
  const load = async (i: number) => {
    current = await renderGame(host, sources[i].path);
  };
  sel.addEventListener('change', () => void load(Number(sel.value)));
  document.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT') return;
    if (e.key === 'ArrowLeft') current?.prev();
    if (e.key === 'ArrowRight') current?.next();
    if (e.key === 'f' || e.key === 'F') current?.flip();
  });
  await load(0);
}

async function renderGame(host: HTMLElement, path: string): Promise<GameController | null> {
  const resp = await fetch(path);
  if (!resp.ok) {
    host.textContent = `failed to load belief-replay at ${path}: ${resp.status}`;
    return null;
  }
  const lines = (await resp.text()).trim().split('\n');
  const header = JSON.parse(lines[0]) as Header;
  const plies = lines.slice(1).map((l) => JSON.parse(l) as Ply).filter((p) => p.type === 'ply');
  let orient = header.orientation as Color;
  // X = visual cap on sample boards, bounded by what the capture stored. N
  // (shownSamples) is selectable 1..maxShow. counts-only captures store none.
  const VISUAL_CAP = 24;
  const capturedMax = plies.reduce((mx, p) => Math.max(mx, p.samples.length), 0);
  const maxShow = Math.min(capturedMax, VISUAL_CAP);
  const countsOnly = header.counts_only === true || maxShow === 0;
  let shownSamples = Math.min(6, maxShow);

  host.innerHTML = `
      <h2>belief replay — ${header.name} <span style="opacity:.6;font-size:14px">(${header.seat}'s belief)</span></h2>
      <div class="br-controls">
        <button class="br-btn" data-act="prev">‹ prev</button>
        <input type="range" min="0" max="${plies.length - 1}" value="0" />
        <button class="br-btn" data-act="next">next ›</button>
        <button class="br-btn" data-act="flip">⇅ flip (f)</button>
        <span class="br-meta"></span>
      </div>
      <div class="br-top">
        <div class="br-cell"><h3>White's view</h3><div class="br-fow-w"></div></div>
        <div class="br-cell"><h3>True board</h3><div class="br-true"></div></div>
        <div class="br-cell"><h3>Black's view</h3><div class="br-fow-b"></div></div>
      </div>
      <div class="br-samples ${countsOnly ? 'br-hide' : ''}">
        <h3>candidate-truths sampled from P (${header.seat}'s belief)
          <label>show <input type="number" min="1" max="${Math.max(1, maxShow)}" value="${Math.max(1, shownSamples)}" /> of ${maxShow}</label>
        </h3>
        <div class="br-grid"></div>
      </div>`;

  const q = <T extends HTMLElement>(s: string) => host.querySelector(s) as T;
  const trueApi = createReadOnlyBoard(q('.br-true'), orient);
  const fowWApi = createReadOnlyBoard(q('.br-fow-w'), orient);
  const fowBApi = createReadOnlyBoard(q('.br-fow-b'), orient);
  const grid = q<HTMLDivElement>('.br-grid');
  const sampleCells: HTMLDivElement[] = [];
  const sampleApis: Api[] = [];
  for (let i = 0; i < maxShow; i++) {
    const cell = document.createElement('div');
    grid.appendChild(cell);
    sampleCells.push(cell);
    sampleApis.push(createReadOnlyBoard(cell, orient));
  }

  const slider = q<HTMLInputElement>('input[type=range]');
  const meta = q<HTMLSpanElement>('.br-meta');
  const sampleInput = countsOnly ? null : q<HTMLInputElement>('input[type=number]');
  let cur = 0;

  function show(idx: number): void {
    cur = Math.max(0, Math.min(plies.length - 1, idx));
    const p = plies[cur];
    trueApi.set({ fen: p.true_fen, orientation: orient });
    fowWApi.set({
      fen: p.fow.white.fen,
      orientation: orient,
      highlight: { custom: hiddenClasses(p.fow.white.hidden), lastMove: false },
    });
    fowBApi.set({
      fen: p.fow.black.fen,
      orientation: orient,
      highlight: { custom: hiddenClasses(p.fow.black.hidden), lastMove: false },
    });
    if (!countsOnly) {
      sampleApis.forEach((api, j) => {
        const visible = j < shownSamples && j < p.samples.length;
        sampleCells[j].classList.toggle('br-hide', !visible);
        if (visible) api.set({ fen: p.samples[j], orientation: orient });
      });
    }
    const pPart = `|P| = ${p.p_size.toLocaleString()}`;
    const samplePart = countsOnly
      ? 'P not loaded (counts only)'
      : `showing ${Math.min(shownSamples, p.samples.length)} of ${p.samples.length} sampled`;
    meta.textContent =
      `ply ${p.ply} · ${p.mover} played ${p.move ?? '—'} · as ${orient} · ${pPart} · ${samplePart}`;
    slider.value = String(cur);
  }

  const go = (i: number) => show(i);
  const flip = () => {
    orient = orient === 'white' ? 'black' : 'white';
    show(cur);
  };
  slider.addEventListener('input', () => go(Number(slider.value)));
  sampleInput?.addEventListener('input', () => {
    shownSamples = Math.max(1, Math.min(maxShow, Number(sampleInput.value) || 1));
    show(cur);
  });
  host.querySelector('[data-act=prev]')!.addEventListener('click', () => go(cur - 1));
  host.querySelector('[data-act=next]')!.addEventListener('click', () => go(cur + 1));
  host.querySelector('[data-act=flip]')!.addEventListener('click', flip);
  show(0);
  return { prev: () => go(cur - 1), next: () => go(cur + 1), flip };
}
