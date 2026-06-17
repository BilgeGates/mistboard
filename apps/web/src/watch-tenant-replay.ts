// Generic Mistboard TV renderer for the tenant SVG family (Jieqi, Banqi, Dark
// Mini Xiangqi — red/black boards rendered as SVG, replayed from a FINISHED
// game's postgame endpoint, never live spectating). This holds ALL the shared
// "TV" chrome — header strip, board panes (one truth pane, or a per-color
// triptych), the control bar + auto-play, ply navigation, and the ReplayHandle
// contract. Each variant supplies a small TenantWatchAdapter (its postgame
// loader/helpers, board renderer, and captures fill); the per-variant module is
// then ~30 lines. See watch-banqi-replay.ts / watch-jieqi-replay.ts.
//
// Crossroads/dark-chess stay on the chessground path in replay.ts; this generic
// is for the xiangqi-style SVG tenants only.
import type { GameMeta, ReplayHandle } from './replay.js';
import { createPane, type ReplayPaneHandle } from './replay-board.js';
import { createGameHeaderStrip } from './replay-meta.js';
import { formatClock } from './web-utils.js';

const AUTO_PLAY_PLY_MS = 1100;
const AUTO_PLAY_LOOP_HOLD_MS = 2600;

// The postgame fields the shared TV chrome reads; every tenant postgame response
// carries these (the adapter's Postgame type extends this).
export type WatchPostgameMeta = {
  game: {
    mode: string;
    result: string;
    termination: string;
    plyCount: number;
    rated: boolean;
    initialMs: number | null;
    incrementMs: number | null;
  };
  state: { timeControl?: { initialMs: number; incrementMs: number } | null };
};

// The variant-specific surface. The generic owns everything else.
export type TenantWatchAdapter<Postgame extends WatchPostgameMeta, View, ViewKey extends string> = {
  installStyles(): void;
  loadPostgame(roomId: string): Promise<{ ok: true; postgame: Postgame } | { ok: false }>;
  maxPly(postgame: Postgame): number;
  // Boards to show: a triptych [red, truth, black] for per-color hidden info
  // (jieqi/mini-xiangqi) or just [truth] for symmetric variants (banqi).
  viewEntries(postgame: Postgame): ReadonlyArray<{ key: ViewKey; label: string }>;
  viewAtPly(postgame: Postgame, key: ViewKey, ply: number): View | null;
  paneKind(key: ViewKey): 'white' | 'truth' | 'black';
  // The adapter owns fog/perspective (e.g. mini-xiangqi passes showFog when the
  // pane is a per-color view rather than truth).
  renderBoard(view: View, orientation: 'red' | 'black', key: ViewKey): string;
  fillCaptures(host: HTMLElement, view: View, owner: 'red' | 'black'): void;
  // When set, the (single) board defaults to the as-played hidden-identity view
  // (hiddenKey) and a Reveal/Hide control (and the `h` key) swaps it to truth.
  // Tenants without hidden identities omit this and keep their fixed view.
  reveal?: { hiddenKey: ViewKey; truthKey: ViewKey };
};

export type TenantWatchReplayOptions = {
  autoplay?: boolean;
  metadataByRoomId?: Record<string, GameMeta>;
};

type ControlRefs = {
  first: HTMLButtonElement;
  prev: HTMLButtonElement;
  play: HTMLButtonElement;
  next: HTMLButtonElement;
  last: HTMLButtonElement;
  plyLabel: HTMLElement;
};

function resultChipKind(result: string): 'white' | 'black' | 'draw' {
  if (result === 'red-wins') return 'white';
  if (result === 'black-wins') return 'black';
  return 'draw';
}

function resultLabel(result: string): string {
  if (result === 'red-wins') return 'Red wins';
  if (result === 'black-wins') return 'Black wins';
  return 'Draw';
}

function labelize(value: string): string {
  const spaced = value.replace(/-/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function timeControlLabel(postgame: WatchPostgameMeta): string {
  const initialMs = postgame.game.initialMs ?? postgame.state.timeControl?.initialMs ?? null;
  const incrementMs = postgame.game.incrementMs ?? postgame.state.timeControl?.incrementMs ?? null;
  if (initialMs === null && incrementMs === null) return 'Untimed';
  return `${Math.round((initialMs ?? 0) / 60000)}+${Math.round((incrementMs ?? 0) / 1000)}`;
}

// Title is the matchup (like the dark-chess watch's "Human vs engine"), not the
// variant name; the channel tab already conveys the variant.
function matchupLabel(mode: string): string {
  if (mode === 'pve') return 'Human vs engine';
  if (mode === 'eve') return 'Engine vs engine';
  return 'Human vs human';
}

type SeatCell = { row: HTMLElement; clock: HTMLElement };

function seatCell(name: string): SeatCell {
  const row = document.createElement('div');
  row.className = 'replay-clock-row';
  const label = document.createElement('span');
  label.className = 'replay-clock-side';
  label.textContent = name;
  const clock = document.createElement('span');
  clock.className = 'replay-clock-time';
  row.append(label, clock);
  return { row, clock };
}

function controlButton(symbol: string, aria: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'replay-button';
  button.textContent = symbol;
  button.setAttribute('aria-label', aria);
  return button;
}

export async function mountTenantWatchReplay<
  Postgame extends WatchPostgameMeta,
  View,
  ViewKey extends string,
>(
  root: HTMLElement,
  roomId: string,
  options: TenantWatchReplayOptions,
  adapter: TenantWatchAdapter<Postgame, View, ViewKey>,
): Promise<ReplayHandle> {
  adapter.installStyles();
  const autoplay = options.autoplay ?? true;

  let activeId = roomId;
  let destroyed = false;
  let timer: number | null = null;
  let paused = !autoplay;

  // Per-game render state, rebuilt on each loadGame.
  let boardTargets: Array<{ pane: ReplayPaneHandle; key: ViewKey }> = [];
  let controls: ControlRefs | null = null;
  let seatCells: { red: SeatCell; black: SeatCell } | null = null;
  // Static initial time per side; null when untimed (the tenant postgame payload
  // carries no dense clock series, so there is no continuous countdown).
  let initialClock: { red: number; black: number } | null = null;
  let maxPly = 0;
  let currentPly = 0;
  let boardOrientation: 'red' | 'black' = 'red';
  let activePostgame: Postgame | null = null;
  // Default to the as-played (hidden) board when the tenant supports reveal.
  let revealed = false;
  let revealBtn: HTMLButtonElement | null = null;

  // Lichess convention: a player's captured material sits next to that player.
  const renderPaneCaptures = (
    pane: ReplayPaneHandle,
    view: View,
    bottomColor: 'red' | 'black',
  ): void => {
    const topColor: 'red' | 'black' = bottomColor === 'red' ? 'black' : 'red';
    // Reset before each per-ply re-render: the family fill helpers append a row
    // rather than replace, so without this the rows accumulate across plies as the
    // TV auto-advances (a fixed-height strip used to hide it by clipping).
    pane.topCapturesEl.replaceChildren();
    pane.capturesEl.replaceChildren();
    adapter.fillCaptures(pane.topCapturesEl, view, topColor);
    adapter.fillCaptures(pane.capturesEl, view, bottomColor);
  };

  const clearTimer = (): void => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };

  const sync = (): void => {
    if (!activePostgame || !controls) return;
    for (const target of boardTargets) {
      const key = adapter.reveal
        ? ((revealed ? adapter.reveal.truthKey : adapter.reveal.hiddenKey) as ViewKey)
        : target.key;
      // Fall back to the pane's own key if the chosen view is missing (e.g. a game
      // stored without per-color histories): better a revealed board than blank.
      const view =
        adapter.viewAtPly(activePostgame, key, currentPly) ??
        adapter.viewAtPly(activePostgame, target.key, currentPly);
      if (view) {
        target.pane.boardEl.innerHTML = adapter.renderBoard(view, boardOrientation, key);
        renderPaneCaptures(target.pane, view, boardOrientation);
      }
    }
    const result = currentPly >= maxPly ? ` — ${resultLabel(activePostgame.game.result)}` : '';
    controls.plyLabel.textContent = `Ply ${currentPly} / ${maxPly}${result}`;
    controls.first.disabled = currentPly <= 0;
    controls.prev.disabled = currentPly <= 0;
    controls.next.disabled = currentPly >= maxPly;
    controls.last.disabled = currentPly >= maxPly;

    // Red moves first, so after an even ply Red is to move; no active side once
    // the game has ended.
    const toMove = currentPly >= maxPly ? null : currentPly % 2 === 0 ? 'red' : 'black';
    if (seatCells) {
      if (initialClock) {
        seatCells.red.clock.textContent = formatClock(initialClock.red);
        seatCells.black.clock.textContent = formatClock(initialClock.black);
      }
      seatCells.red.row.classList.toggle('active', toMove === 'red');
      seatCells.black.row.classList.toggle('active', toMove === 'black');
    }
  };

  const scheduleAuto = (): void => {
    if (paused || destroyed || maxPly <= 0) return;
    clearTimer();
    const atEnd = currentPly >= maxPly;
    timer = window.setTimeout(
      () => {
        if (destroyed) return;
        currentPly = atEnd ? 0 : currentPly + 1;
        sync();
        scheduleAuto();
      },
      atEnd ? AUTO_PLAY_LOOP_HOLD_MS : AUTO_PLAY_PLY_MS,
    );
  };

  const setPaused = (next: boolean): void => {
    paused = next;
    if (controls) controls.play.textContent = paused ? '▶ Play' : '⏸ Pause';
    if (paused) clearTimer();
    else scheduleAuto();
  };

  // A manual step pauses auto-play (TV you can pause and scrub).
  const manualJump = (ply: number): void => {
    setPaused(true);
    currentPly = Math.max(0, Math.min(maxPly, ply));
    sync();
  };

  const toggleReveal = (): void => {
    if (!adapter.reveal) return;
    revealed = !revealed;
    if (revealBtn) revealBtn.textContent = revealed ? 'Hide' : 'Reveal';
    sync();
  };

  const buildGame = (postgame: Postgame): void => {
    activePostgame = postgame;
    maxPly = adapter.maxPly(postgame);
    currentPly = 0;
    paused = !autoplay;
    boardOrientation = 'red';
    const initialMs = postgame.game.initialMs ?? postgame.state.timeControl?.initialMs ?? null;
    initialClock = initialMs === null ? null : { red: initialMs, black: initialMs };

    const header = createGameHeaderStrip();
    header.title.textContent = matchupLabel(postgame.game.mode);
    const chip = document.createElement('span');
    chip.className = `replay-game-header-result-chip replay-game-header-result-${resultChipKind(postgame.game.result)}`;
    chip.textContent = resultLabel(postgame.game.result);
    const detail = document.createElement('span');
    detail.className = 'replay-game-header-result-detail';
    detail.textContent = `by ${labelize(postgame.game.termination)}`;
    header.result.append(chip, detail);
    const plies = document.createElement('span');
    plies.textContent = `${postgame.game.plyCount} plies`;
    const sep = document.createElement('span');
    sep.className = 'replay-game-header-sep';
    sep.textContent = '·';
    const clock = document.createElement('span');
    clock.textContent = timeControlLabel(postgame);
    const sepRated = document.createElement('span');
    sepRated.className = 'replay-game-header-sep';
    sepRated.textContent = '·';
    const rated = document.createElement('span');
    rated.textContent = postgame.game.rated ? 'Rated' : 'Casual';
    header.meta.append(plies, sep, clock, sepRated, rated);
    // The tenant postgame payloads carry no seat-name fields, so the cells fall
    // back to the color labels (matchup name lives in the header title).
    const redCell = seatCell('Red');
    const blackCell = seatCell('Black');
    header.whiteCell.append(redCell.row);
    header.blackCell.append(blackCell.row);
    seatCells = { red: redCell, black: blackCell };

    const layout = document.createElement('div');
    layout.className = 'replay-layout replay-layout-all';
    boardTargets = [];
    for (const entry of adapter.viewEntries(postgame)) {
      // The center board reads "Truth" on watch, matching the dark-chess TV (the
      // postgame review keeps its own "Server truth" label).
      const label = adapter.paneKind(entry.key) === 'truth' ? 'Truth' : entry.label;
      const pane = createPane(label, adapter.paneKind(entry.key), true, 'split');
      boardTargets.push({ pane, key: entry.key });
      layout.append(pane.el);
    }

    // Control bar below the boards (matches the dark-chess watch: no move list).
    const bar = document.createElement('div');
    bar.className = 'replay-control-bar';
    const first = controlButton('|<', 'First move');
    const prev = controlButton('<', 'Previous move');
    const play = controlButton(paused ? '▶ Play' : '⏸ Pause', 'Play / pause');
    const next = controlButton('>', 'Next move');
    const last = controlButton('>|', 'Last move');
    const flip = controlButton('↕ Flip', 'Flip boards');
    bar.append(first, prev, play, next, last, flip);
    if (adapter.reveal) {
      revealBtn = controlButton(revealed ? 'Hide' : 'Reveal', 'Reveal hidden identities');
      revealBtn.title = 'Reveal hidden identities (h)';
      revealBtn.onclick = toggleReveal;
      bar.append(revealBtn);
    }
    const plyLine = document.createElement('div');
    plyLine.className = 'replay-ply-line';
    const plyLabel = document.createElement('span');
    plyLine.append(plyLabel);

    controls = { first, prev, play, next, last, plyLabel };
    first.onclick = () => manualJump(0);
    prev.onclick = () => manualJump(currentPly - 1);
    next.onclick = () => manualJump(currentPly + 1);
    last.onclick = () => manualJump(maxPly);
    play.onclick = () => setPaused(!paused);
    flip.onclick = () => {
      boardOrientation = boardOrientation === 'red' ? 'black' : 'red';
      sync();
    };

    // Append directly to root (no wrapper), exactly like the dark-chess watch, so
    // the header/boards/control-bar spacing and alignment are inherited.
    root.replaceChildren(header.el, layout, bar, plyLine);

    sync();
    scheduleAuto();
  };

  const load = async (nextId: string): Promise<void> => {
    clearTimer();
    activeId = nextId;
    const result = await adapter.loadPostgame(nextId);
    if (destroyed) return;
    if (!result.ok) {
      const notice = document.createElement('p');
      notice.className = 'watch-empty';
      notice.textContent = 'This game could not be loaded.';
      root.replaceChildren(notice);
      return;
    }
    buildGame(result.postgame);
  };

  // Keyboard reveal toggle (`h`), only when the tenant supports reveal.
  const onKeydown = (event: KeyboardEvent): void => {
    if (!adapter.reveal || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.isContentEditable ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT')
    ) {
      return;
    }
    if (event.key === 'h' || event.key === 'H') {
      event.preventDefault();
      toggleReveal();
    }
  };
  if (adapter.reveal) window.addEventListener('keydown', onKeydown);

  await load(roomId);

  return {
    activeSampleId: () => activeId,
    destroy: () => {
      destroyed = true;
      clearTimer();
      if (adapter.reveal) window.removeEventListener('keydown', onKeydown);
      root.replaceChildren();
    },
    loadGame: async (sampleId: string) => {
      await load(sampleId);
    },
    // Watch drives game selection through the queue; no internal auto-advance pool.
    updateLoopPool: () => {},
  };
}
