// The review board's local-engine widget (fills mountReviewLayout's `enginePanel`
// slot). Owns a ceval handle, an on/off toggle, an advantage gauge, and up to
// MultiPV principal-variation lines. Position is pushed in via setPosition() from
// the postgame's ply navigation; scores are normalised to Red's POV so the gauge
// reads the same regardless of whose turn it is.
import {
  CEVAL_ENGINE_NAME,
  type CevalHandle,
  type CevalLine,
  type CevalUpdate,
  type CevalVariant,
  cevalSupported,
  createCeval,
  preloadEngine,
} from './ceval.js';
import './engine-panel.css';
import type { EvalBar } from './eval-bar.js';
import { formatEval, winProbRed } from './eval-format.js';

export interface EnginePanel {
  el: HTMLElement;
  /** Push the current position (move history from startpos, engine UCI). */
  setPosition(movesUci: string[]): void;
  dispose(): void;
}

export interface EnginePanelOptions {
  variant: CevalVariant;
  multiPv?: number;
  maxDepth?: number;
  /** Prettify a PV move for display; defaults to the raw engine UCI. */
  formatPvMove?: (uci: string) => string;
  /** Optional on-board eval bar to drive in lockstep with the panel. */
  evalBar?: EvalBar;
}

type Side = 'red' | 'black';

const DEBOUNCE_MS = 150;

export function createEnginePanel(opts: EnginePanelOptions): EnginePanel {
  const supported = cevalSupported();
  const multiPv = opts.multiPv ?? 3;
  const maxDepth = opts.maxDepth ?? 18;
  const formatMove = opts.formatPvMove ?? ((uci: string) => uci);

  const el = document.createElement('section');
  el.className = 'engine-panel';

  const head = document.createElement('div');
  head.className = 'engine-panel__head';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'engine-panel__toggle';
  toggle.setAttribute('aria-pressed', 'false');
  const gauge = document.createElement('div');
  gauge.className = 'engine-panel__gauge';
  const gaugeFill = document.createElement('div');
  gaugeFill.className = 'engine-panel__gauge-fill';
  gauge.append(gaugeFill);
  const evalLabel = document.createElement('strong');
  evalLabel.className = 'engine-panel__eval';
  evalLabel.textContent = '–';
  head.append(toggle, gauge, evalLabel);

  const meta = document.createElement('div');
  meta.className = 'engine-panel__meta';

  const lines = document.createElement('ol');
  lines.className = 'engine-panel__lines';

  el.append(head, meta, lines);

  let handle: CevalHandle | null = null;
  let on = false;
  let currentMoves: string[] = [];
  let debounceId: ReturnType<typeof setTimeout> | undefined;

  function sideToMove(moves: string[]): Side {
    return moves.length % 2 === 0 ? 'red' : 'black';
  }

  function syncToggle(): void {
    toggle.textContent = on ? 'Engine on' : 'Engine';
    toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    toggle.classList.toggle('engine-panel__toggle--on', on);
    el.classList.toggle('engine-panel--on', on);
  }

  function setGauge(cp: number | null, mate: number | null): void {
    const prob = winProbRed(cp, mate);
    gaugeFill.style.width = `${(prob * 100).toFixed(1)}%`;
  }

  function clearOutput(): void {
    evalLabel.textContent = '–';
    meta.textContent = '';
    lines.replaceChildren();
    setGauge(null, null);
    opts.evalBar?.reset();
  }

  function render(update: CevalUpdate, side: Side): void {
    const best = update.lines[0];
    if (best) {
      const { cp, mate } = redPov(best, side);
      evalLabel.textContent = formatEval(cp, mate);
      setGauge(cp, mate);
      opts.evalBar?.setEval(cp, mate);
    }
    meta.textContent = update.depth
      ? `${CEVAL_ENGINE_NAME} · depth ${update.depth}${update.nps ? ` · ${formatKnps(update.nps)}` : ''}`
      : `${CEVAL_ENGINE_NAME} · thinking…`;
    lines.replaceChildren(...update.lines.map((line) => renderLine(line, side, formatMove)));
  }

  function evaluateNow(): void {
    if (!on || !supported) return;
    const moves = currentMoves;
    const side = sideToMove(moves);
    meta.textContent = `${CEVAL_ENGINE_NAME} · loading…`;
    opts.evalBar?.setLoading();
    void handle!
      .evaluate({
        movesUci: moves,
        multiPv,
        maxDepth,
        onUpdate: (update) => render(update, side),
      })
      .catch((err: unknown) => {
        meta.textContent = `Engine error: ${(err as Error).message ?? 'failed'}`;
      });
  }

  function setPosition(movesUci: string[]): void {
    currentMoves = movesUci;
    if (!on || !supported) return;
    clearTimeout(debounceId);
    debounceId = setTimeout(evaluateNow, DEBOUNCE_MS);
  }

  function turnOn(): void {
    if (!handle) handle = createCeval(opts.variant);
    on = true;
    syncToggle();
    meta.textContent = `${CEVAL_ENGINE_NAME} · loading…`;
    void preloadEngine()
      .then(() => {
        if (on) evaluateNow();
      })
      .catch((err: unknown) => {
        meta.textContent = `Engine unavailable: ${(err as Error).message ?? 'failed'}`;
      });
  }

  function turnOff(): void {
    on = false;
    syncToggle();
    handle?.stop();
    clearOutput();
  }

  if (!supported) {
    toggle.disabled = true;
    toggle.textContent = 'Engine';
    meta.textContent = 'Local engine needs a cross-origin-isolated reload.';
  } else {
    toggle.addEventListener('click', () => (on ? turnOff() : turnOn()));
  }
  syncToggle();
  clearOutput();

  return {
    el,
    setPosition,
    dispose() {
      clearTimeout(debounceId);
      handle?.dispose();
    },
  };
}

function renderLine(line: CevalLine, side: Side, formatMove: (uci: string) => string): HTMLElement {
  const li = document.createElement('li');
  li.className = 'engine-panel__line';
  const { cp, mate } = redPov(line, side);
  const score = document.createElement('span');
  score.className = `engine-panel__line-eval ${evalTone(cp, mate)}`;
  score.textContent = formatEval(cp, mate);
  const pv = document.createElement('span');
  pv.className = 'engine-panel__line-pv';
  pv.textContent = line.pvUci.slice(0, 8).map(formatMove).join(' ');
  li.append(score, pv);
  return li;
}

// Chip tone by who's ahead (Red POV), matching the on-board eval bar's palette:
// Red-ahead reads light, Black-ahead dark, near-even neutral.
function evalTone(cp: number | null, mate: number | null): string {
  const value = mate != null ? (mate > 0 ? 1 : -1) : (cp ?? 0) / 100;
  if (value > 0.15) return 'is-red';
  if (value < -0.15) return 'is-black';
  return 'is-even';
}

function redPov(line: CevalLine, side: Side): { cp: number | null; mate: number | null } {
  const sign = side === 'red' ? 1 : -1;
  return {
    cp: line.scoreCp == null ? null : line.scoreCp * sign,
    mate: line.mate == null ? null : line.mate * sign,
  };
}

function formatKnps(nps: number): string {
  return nps >= 1000 ? `${Math.round(nps / 1000)}k nps` : `${nps} nps`;
}
