// Belief-replay viewer: step through a recorded game and see, per ply, the TRUE
// board, BOTH players' FoW views (hidden squares dimmed), and K sampled
// candidate-truths from the captured seat's belief set P (PEnumState). Data is a
// self-contained `belief-replay` jsonl from mistboard-engine
// scripts/capture_belief_replay.py. Mounted via ?belief=<path-to-jsonl>.
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

const STYLE = `
.br-wrap{max-width:1200px;margin:0 auto;padding:16px;font-family:system-ui,sans-serif;color:#e8e8e8}
.br-controls{display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap}
.br-controls input[type=range]{flex:1;min-width:180px}
.br-meta{font-variant-numeric:tabular-nums;font-size:14px;opacity:.9}
.br-top{display:flex;gap:20px;flex-wrap:wrap;margin-bottom:18px}
.br-cell{width:260px}
.br-cell h3{margin:0 0 6px;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;opacity:.7}
.br-samples h3{font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;opacity:.7;margin:0 0 8px;display:flex;align-items:center;gap:10px}
.br-samples h3 input{width:64px;background:#2a2a35;border:1px solid #444;color:#e8e8e8;border-radius:4px;padding:2px 6px}
.br-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.br-grid .cg-snap{--cg-w:150px}
/* chessground square aspect: .cg-snap only sets width; supply height here. */
.br-wrap .cg-snap{aspect-ratio:1}
.br-cell .cg-snap{width:260px}
.br-hidden{background:rgba(20,20,28,.6)}
.br-btn{background:#2a2a35;border:1px solid #444;color:#e8e8e8;border-radius:6px;padding:6px 10px;cursor:pointer}
.br-btn:hover{background:#363645}
.br-hide{display:none}
`;

function hiddenClasses(hidden: string[]): cg.SquareClasses {
  const m: cg.SquareClasses = new Map();
  for (const sq of hidden) m.set(sq as cg.Key, 'br-hidden');
  return m;
}

export async function mountBeliefReplay(root: HTMLElement, path: string): Promise<void> {
  const resp = await fetch(path);
  if (!resp.ok) {
    root.textContent = `failed to load belief-replay at ${path}: ${resp.status}`;
    return;
  }
  const lines = (await resp.text()).trim().split('\n');
  const header = JSON.parse(lines[0]) as Header;
  const plies = lines.slice(1).map((l) => JSON.parse(l) as Ply).filter((p) => p.type === 'ply');
  const orient = header.orientation as Color;
  const maxSamples = plies.reduce((mx, p) => Math.max(mx, p.samples.length), 0);
  let shownSamples = Math.min(6, maxSamples);

  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  root.innerHTML = `
    <div class="br-wrap">
      <h2>belief replay — ${header.name} <span style="opacity:.6;font-size:14px">(${header.seat}'s belief)</span></h2>
      <div class="br-controls">
        <button class="br-btn" data-act="prev">‹ prev</button>
        <input type="range" min="0" max="${plies.length - 1}" value="0" />
        <button class="br-btn" data-act="next">next ›</button>
        <span class="br-meta"></span>
      </div>
      <div class="br-top">
        <div class="br-cell"><h3>True board</h3><div class="br-true"></div></div>
        <div class="br-cell"><h3>White's FoW view</h3><div class="br-fow-w"></div></div>
        <div class="br-cell"><h3>Black's FoW view</h3><div class="br-fow-b"></div></div>
      </div>
      <div class="br-samples">
        <h3>sampled candidate-truths from P (${header.seat}'s belief)
          <label>show <input type="number" min="1" max="${maxSamples}" value="${shownSamples}" /> of ${maxSamples}</label>
        </h3>
        <div class="br-grid"></div>
      </div>
    </div>`;

  const q = <T extends HTMLElement>(s: string) => root.querySelector(s) as T;
  const trueApi = createReadOnlyBoard(q('.br-true'), orient);
  const fowWApi = createReadOnlyBoard(q('.br-fow-w'), orient);
  const fowBApi = createReadOnlyBoard(q('.br-fow-b'), orient);
  const grid = q<HTMLDivElement>('.br-grid');
  const sampleCells: HTMLDivElement[] = [];
  const sampleApis: Api[] = [];
  for (let i = 0; i < maxSamples; i++) {
    const cell = document.createElement('div');
    grid.appendChild(cell);
    sampleCells.push(cell);
    sampleApis.push(createReadOnlyBoard(cell, orient));
  }

  const slider = q<HTMLInputElement>('input[type=range]');
  const meta = q<HTMLSpanElement>('.br-meta');
  const sampleInput = q<HTMLInputElement>('input[type=number]');
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
    sampleApis.forEach((api, j) => {
      const visible = j < shownSamples && j < p.samples.length;
      sampleCells[j].classList.toggle('br-hide', !visible);
      if (visible) api.set({ fen: p.samples[j], orientation: orient });
    });
    meta.textContent = `ply ${p.ply} · ${p.mover} played ${p.move} · |P| = ${p.p_size.toLocaleString()} · ${p.samples.length} samples captured`;
    slider.value = String(cur);
  }

  const go = (i: number) => show(i);
  slider.addEventListener('input', () => go(Number(slider.value)));
  sampleInput.addEventListener('input', () => {
    shownSamples = Math.max(1, Math.min(maxSamples, Number(sampleInput.value) || 1));
    show(cur);
  });
  root.querySelector('[data-act=prev]')!.addEventListener('click', () => go(cur - 1));
  root.querySelector('[data-act=next]')!.addEventListener('click', () => go(cur + 1));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') go(cur - 1);
    if (e.key === 'ArrowRight') go(cur + 1);
  });
  show(0);
}
