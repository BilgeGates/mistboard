// Client-side ("local") engine analysis for the review board, powered by the
// vendored Fairy-Stockfish WASM build (apps/web/public/engine/fairy-stockfish).
//
// FSF-wasm is multi-threaded-only: it allocates a *shared* WebAssembly.Memory and
// THROWS when SharedArrayBuffer is unavailable, so the host document MUST be
// cross-origin isolated (COOP: same-origin + COEP). cevalSupported() gates on that;
// callers show a "reload to enable" affordance when it is false. Everything here is
// lazy — importing the module in a non-isolated page (or a test) does nothing until
// evaluate()/preloadEngine() is called.

const ENGINE_BASE = '/engine/fairy-stockfish/';
// The vendored FSF assets live in public/ and are NOT content-hashed like the Vite
// bundle, so the CDN caches them by bare path for hours (max-age=14400). Bump this
// whenever the vendored stockfish.js changes to force a fresh edge fetch (this CF
// config keys on the query string). Only the script URL is versioned; the wasm +
// worker are resolved by the engine's own locateFile and load fine unversioned.
const ENGINE_SCRIPT_VERSION = '1.1.11';

/** Human label for the engine, shown in the analysis panel. */
export const CEVAL_ENGINE_NAME = 'Fairy-Stockfish';

/** Variants the vendored engine can evaluate. Both run on one shared instance. */
export type CevalVariant = 'xiangqi' | 'fortressxiangqi';

export interface CevalLine {
  /** 1-based rank within MultiPV (1 = best). */
  multipv: number;
  depth: number;
  /** Centipawns, side-to-move POV; null when `mate` is set. */
  scoreCp: number | null;
  /** Signed moves-to-mate, side-to-move POV; null otherwise. */
  mate: number | null;
  /** Principal variation, engine UCI. */
  pvUci: string[];
}

export interface CevalUpdate {
  depth: number;
  seldepth: number;
  nodes: number;
  nps: number;
  /** Lines sorted ascending by multipv. Scores are from the side-to-move POV. */
  lines: CevalLine[];
}

export interface CevalRequest {
  /** Move history from the start position, in engine UCI. */
  movesUci: string[];
  /** Number of ranked lines to return (default 1). */
  multiPv?: number;
  /** Cap search depth; the engine streams shallower updates first (default 18). */
  maxDepth?: number;
  /** Progressive callback fired as depth increases (throttled). */
  onUpdate?: (update: CevalUpdate) => void;
}

export interface CevalHandle {
  readonly variant: CevalVariant;
  /** Evaluate a position; resolves with the deepest update reached. */
  evaluate(req: CevalRequest): Promise<CevalUpdate>;
  /** Halt the current search (the pending evaluate never resolves). */
  stop(): void;
  dispose(): void;
}

/** True only when SharedArrayBuffer is usable — i.e. the page is cross-origin isolated. */
export function cevalSupported(): boolean {
  return (
    typeof SharedArrayBuffer === 'function' &&
    typeof crossOriginIsolated === 'boolean' &&
    crossOriginIsolated === true
  );
}

// --- low-level engine (singleton) ---------------------------------------------

interface RawEngine {
  postMessage(cmd: string): void;
  addMessageListener(cb: (line: string) => void): void;
  FS: { writeFile(path: string, data: string | Uint8Array): void };
}

type StockfishFactory = (opts: { locateFile: (f: string) => string }) => Promise<RawEngine>;

declare global {
  // The classic engine script assigns this global (its UMD tail finds no
  // module/define in the browser, so it falls back to a global).
  // eslint-disable-next-line no-var
  var Stockfish: StockfishFactory | undefined;
}

class EngineCore {
  private listeners = new Set<(line: string) => void>();

  constructor(private raw: RawEngine) {
    raw.addMessageListener((line) => {
      for (const cb of [...this.listeners]) cb(line);
    });
  }

  send(cmd: string): void {
    this.raw.postMessage(cmd);
  }

  onLine(cb: (line: string) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  writeFile(path: string, data: string): void {
    this.raw.FS.writeFile(path, data);
  }

  waitFor(pred: (line: string) => boolean): Promise<string> {
    return new Promise((resolve) => {
      const off = this.onLine((line) => {
        if (pred(line)) {
          off();
          resolve(line);
        }
      });
    });
  }
}

let enginePromise: Promise<EngineCore> | null = null;

function injectEngineScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector('script[data-fsf-engine]')) {
      resolve();
      return;
    }
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.dataset.fsfEngine = '1';
    el.addEventListener('load', () => resolve());
    el.addEventListener('error', () => reject(new Error('ceval: failed to load engine script')));
    document.head.appendChild(el);
  });
}

async function loadEngineCore(): Promise<EngineCore> {
  if (!cevalSupported()) {
    throw new Error('ceval_unsupported: page is not cross-origin isolated');
  }
  await injectEngineScript(`${ENGINE_BASE}stockfish.js?v=${ENGINE_SCRIPT_VERSION}`);
  const factory = globalThis.Stockfish;
  if (typeof factory !== 'function') {
    throw new Error('ceval: engine global missing after script load');
  }
  const raw = await factory({ locateFile: (f) => ENGINE_BASE + f });
  const core = new EngineCore(raw);

  core.send('uci');
  await core.waitFor((line) => line === 'uciok');

  // Modest resources: leave a core for the UI, cap threads/hash for a review board.
  const cores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 2) : 2;
  const threads = Math.max(1, Math.min(cores - 1, 8));
  core.send(`setoption name Threads value ${threads}`);
  core.send('setoption name Hash value 64');

  // Load our custom Fortress variant into the engine's in-memory FS. Standard
  // xiangqi is a Fairy-Stockfish built-in and needs no .ini.
  try {
    const ini = await fetch(`${ENGINE_BASE}fortress-xiangqi.ini`).then((r) => r.text());
    core.writeFile('fortress-xiangqi.ini', ini);
    core.send('setoption name VariantPath value fortress-xiangqi.ini');
  } catch {
    // Fortress analysis will be unavailable, but xiangqi still works.
  }

  const ready = core.waitFor((line) => line === 'readyok');
  core.send('isready');
  await ready;
  return core;
}

/** Warm the engine up ahead of the first evaluate (script + wasm + variant load). */
export function preloadEngine(): Promise<void> {
  if (!enginePromise) enginePromise = loadEngineCore();
  return enginePromise.then(() => undefined);
}

function engine(): Promise<EngineCore> {
  if (!enginePromise) enginePromise = loadEngineCore();
  return enginePromise;
}

// --- info-line parsing --------------------------------------------------------

export interface InfoFields {
  depth: number;
  seldepth: number;
  multipv: number;
  scoreCp: number | null;
  mate: number | null;
  nodes: number;
  nps: number;
  pvUci: string[];
}

/** Parse a UCI `info` line into fields. Exported for tests. Returns null for
 *  `info string ...` and non-info lines. */
export function parseInfo(line: string): InfoFields | null {
  const t = line.split(/\s+/);
  if (t[0] !== 'info' || t[1] === 'string') return null;
  const f: InfoFields = {
    depth: 0,
    seldepth: 0,
    multipv: 1,
    scoreCp: null,
    mate: null,
    nodes: 0,
    nps: 0,
    pvUci: [],
  };
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case 'depth':
        f.depth = Number(t[++i]);
        break;
      case 'seldepth':
        f.seldepth = Number(t[++i]);
        break;
      case 'multipv':
        f.multipv = Number(t[++i]);
        break;
      case 'nodes':
        f.nodes = Number(t[++i]);
        break;
      case 'nps':
        f.nps = Number(t[++i]);
        break;
      case 'score':
        if (t[i + 1] === 'cp') {
          f.scoreCp = Number(t[i + 2]);
          i += 2;
        } else if (t[i + 1] === 'mate') {
          f.mate = Number(t[i + 2]);
          i += 2;
        }
        break;
      case 'pv':
        f.pvUci = t.slice(i + 1);
        return f;
    }
  }
  return f;
}

const EMIT_THROTTLE_MS = 80;

// --- public handle ------------------------------------------------------------

class Ceval implements CevalHandle {
  private token = 0;
  private currentOff: (() => void) | null = null;

  constructor(readonly variant: CevalVariant) {}

  async evaluate(req: CevalRequest): Promise<CevalUpdate> {
    const core = await engine();
    this.stop(); // supersede any in-flight search
    const myToken = ++this.token;
    const multiPv = req.multiPv ?? 1;
    const maxDepth = req.maxDepth ?? 18;

    core.send('stop');
    core.send(`setoption name UCI_Variant value ${this.variant}`);
    core.send(`setoption name MultiPV value ${multiPv}`);
    core.send(
      req.movesUci.length
        ? `position startpos moves ${req.movesUci.join(' ')}`
        : 'position startpos',
    );

    const byPv = new Map<number, CevalLine>();
    let depth = 0;
    let seldepth = 0;
    let nodes = 0;
    let nps = 0;
    let lastEmit = 0;
    let started = false;

    const snapshot = (): CevalUpdate => ({
      depth,
      seldepth,
      nodes,
      nps,
      lines: [...byPv.values()].sort((a, b) => a.multipv - b.multipv),
    });

    return await new Promise<CevalUpdate>((resolve) => {
      const off = core.onLine((line) => {
        if (this.token !== myToken || !started) return;
        if (line.startsWith('info ')) {
          const info = parseInfo(line);
          if (!info) return;
          if (info.depth) depth = info.depth;
          if (info.seldepth) seldepth = info.seldepth;
          if (info.nodes) nodes = info.nodes;
          if (info.nps) nps = info.nps;
          if (info.pvUci.length) {
            byPv.set(info.multipv, {
              multipv: info.multipv,
              depth: info.depth,
              scoreCp: info.scoreCp,
              mate: info.mate,
              pvUci: info.pvUci,
            });
            const now = Date.now();
            if (req.onUpdate && now - lastEmit > EMIT_THROTTLE_MS) {
              lastEmit = now;
              req.onUpdate(snapshot());
            }
          }
        } else if (line.startsWith('bestmove')) {
          off();
          if (this.currentOff === off) this.currentOff = null;
          const final = snapshot();
          req.onUpdate?.(final);
          resolve(final);
        }
      });
      this.currentOff = off;

      const ready = core.waitFor((line) => line === 'readyok');
      core.send('isready');
      void ready.then(() => {
        if (this.token !== myToken) return;
        started = true;
        core.send(`go depth ${maxDepth}`);
      });
    });
  }

  stop(): void {
    this.token++; // supersede: in-flight listeners bail
    if (this.currentOff) {
      this.currentOff();
      this.currentOff = null;
    }
    void engine()
      .then((core) => core.send('stop'))
      .catch(() => {});
  }

  dispose(): void {
    this.stop();
  }
}

export function createCeval(variant: CevalVariant): CevalHandle {
  return new Ceval(variant);
}
