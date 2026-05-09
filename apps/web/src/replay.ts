import {
  clockRemainingMs,
  fogOfWarVariant,
  replayGameEvents,
  type Board,
  type ClockState,
  type Color,
  type GameEvent,
  type GameState,
  type PieceRole,
  type PlayerView,
  type Square,
} from '@bichess/game';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type * as cg from 'chessground/types';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';
import {
  buildAnnotationFromForm,
  formatAnnotationLine,
  loadAnnotations,
  saveAnnotation,
  updateAnnotation,
  type Annotation,
  type AnnotationContext,
} from './annotations.js';
import { createBeliefPanel, type BeliefConfig, type BeliefPanelHandle } from './belief-panel.js';

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const ranks = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const allSquares: Square[] = ranks.flatMap((r) => files.map((f) => `${f}${r}` as Square));

const FALLBACK_PLAY_MS = 900;
const COMPUTE_SCALE = 50;
const MIN_PLAY_MS = 700;
const MAX_PLAY_MS = 2500;
const DEFAULT_BETWEEN_GAME_DELAY_MS = 8000;

const replayAbortControllers = new WeakMap<HTMLElement, AbortController>();

type MovePlayedExt = { type: 'move-played'; compute_ms?: number };

export type GameMeta = {
  whiteName: string | null;
  blackName: string | null;
  result: string;
  timeControl?: Record<string, unknown> | null;
  termination: string;
  plyCount: number;
};

export type ReplayOptions = {
  autoplay?: boolean;
  /** Initial move count to show. Clamped to the loaded game's ply count. */
  initialPly?: number;
  /** Called whenever the displayed ply changes after a game loads. */
  onPlyChange?: (ply: number, maxPly: number) => void;
  /** When false, white/black panes stay on their last fogged view at game-end. Truth always reveals. */
  revealOnFinish?: boolean;
  /** When false, the prev/next/play control bar is hidden (autoplay-only mode). */
  showControls?: boolean;
  /** Initial board orientation for all replay panes. Defaults to White's perspective. */
  orientation?: Color;
  /** @deprecated Use orientation. Kept for older callers. */
  blackOrientation?: Color;
  /** When set, after each game finishes the next sample loads automatically. */
  loopSamples?: string[];
  /** Pause length on the reveal frame before cycling to the next loop sample. */
  betweenGameDelayMs?: number;
  /**
   * Override URL construction for sample ids. Default loads from
   * `/replay-samples/<safe-id>.jsonl`. Bakeoff browser uses this to point
   * at `/bakeoff/<path>` without the safe-id sanitization that would mangle
   * filenames containing slashes or dots.
   */
  urlForId?: (sampleId: string) => string;
  /**
   * Custom loader. Bypasses urlForId entirely — for callers that fetch
   * events from a JSON API rather than a static JSONL file.
   */
  loaderForId?: (sampleId: string) => Promise<GameEvent[]>;
  /**
   * Per-game metadata to display in a header bar above the boards. Keyed
   * by sampleId. When absent, no bar renders.
   */
  metadataByRoomId?: Record<string, GameMeta>;
  /**
   * When set, enables the annotation tooling. Press `a` at any ply to open
   * the modal pre-filled with the move just played. Annotations persist via
   * POST /api/annotations (handled by the Vite dev plugin in development).
   */
  annotation?: AnnotationConfig;
  belief?: BeliefConfig;
};

export type AnnotationConfig = {
  manifestUrl: string;
  /** Maps a sampleId (e.g. "games/game-0011-W-tier1-black.jsonl") to its game index in the manifest. */
  gameIndexForSampleId: (sampleId: string) => number | null;
  /** Maps a sampleId to the tier1 color in that game. */
  tier1ColorForSampleId: (sampleId: string) => 'white' | 'black' | null;
  /** Called after a save so the caller can refresh sidebar badges. */
  onSaved?: () => void;
};

export async function mountReplay(
  root: HTMLElement,
  initialSampleId: string,
  options: ReplayOptions = {},
): Promise<void> {
  const reveal = options.revealOnFinish !== false;
  const showControls = options.showControls !== false;
  let boardOrientation = options.orientation ?? options.blackOrientation ?? 'white';
  const loopSamples = options.loopSamples;
  const betweenGameDelayMs = options.betweenGameDelayMs ?? DEFAULT_BETWEEN_GAME_DELAY_MS;
  const autoplay = options.autoplay === true || loopSamples !== undefined;
  const urlForId = options.urlForId ?? defaultUrlForId;
  const loaderForId = options.loaderForId;
  const metadataByRoomId = options.metadataByRoomId;
  const onPlyChange = options.onPlyChange;

  // If mountReplay is called again on the same root (e.g. switching games
  // in the bakeoff browser), abort any keyboard listeners from the prior
  // mount so we don't leak handlers.
  const priorAbort = replayAbortControllers.get(root);
  if (priorAbort) priorAbort.abort();
  const abortController = new AbortController();
  replayAbortControllers.set(root, abortController);

  root.replaceChildren();
  root.classList.add('replay-page');

  const layout = document.createElement('div');
  layout.className = 'replay-layout';

  const whiteBaseLabel = "White's view";
  const blackBaseLabel = "Black's view";

  const whitePane = createPane(whiteBaseLabel);
  const truthPane = createPane('Truth');
  const blackPane = createPane(blackBaseLabel);
  layout.append(whitePane.el, truthPane.el, blackPane.el);
  root.append(layout);

  const gameIdFooter = metadataByRoomId ? createGameIdFooter() : null;
  if (gameIdFooter) root.append(gameIdFooter);
  const clockPanel = createClockPanel();
  root.append(clockPanel.el);

  const firstBtn = controlButton('|◀', 'Jump to start');
  const prevBtn = controlButton('◀', 'Previous ply');
  const playBtn = controlButton('▶ Play', 'Play');
  const nextBtn = controlButton('▶', 'Next ply');
  const lastBtn = controlButton('▶|', 'Jump to end');
  const flipBtn = controlButton('Flip', 'Flip all boards');
  const plyLabel = document.createElement('span');
  plyLabel.className = 'replay-ply-label';

  if (showControls) {
    const controls = document.createElement('div');
    controls.className = 'replay-controls';
    controls.append(firstBtn, prevBtn, playBtn, nextBtn, lastBtn, flipBtn, plyLabel);
    root.append(controls);
  }

  const whiteCg = createBoard(whitePane.boardEl, boardOrientation);
  const truthCg = createBoard(truthPane.boardEl, boardOrientation);
  const blackCg = createBoard(blackPane.boardEl, boardOrientation);

  const annotation = options.annotation;
  const belief = options.belief;
  const toolsRow = belief || annotation ? document.createElement('div') : null;
  if (toolsRow) {
    toolsRow.className = 'replay-tools-row';
    root.append(toolsRow);
  }
  let beliefPanel: BeliefPanelHandle | null = null;
  if (belief) {
    beliefPanel = createBeliefPanel();
    toolsRow?.append(beliefPanel.el);
  }

  let annotPanel: HTMLDivElement | null = null;
  let annotForm: AnnotFormHandle | null = null;
  let annotListEl: HTMLDivElement | null = null;
  if (annotation) {
    annotPanel = document.createElement('div');
    annotPanel.className = 'annot-panel';
    toolsRow?.append(annotPanel);

    annotForm = createAnnotForm({
      onSave: handleAnnotSave,
    });
    annotPanel.append(annotForm.el);

    annotListEl = document.createElement('div');
    annotListEl.className = 'annot-panel-list-wrapper';
    annotPanel.append(annotListEl);
  }

  let activeSample = initialSampleId;
  let events: GameEvent[] = [];
  let moveCount = 0;
  let currentPly = 0;
  let shouldApplyInitialPly = Number.isFinite(options.initialPly);
  let playTimer: number | null = null;
  let loopTimer: number | null = null;
  let finishedAck = false;
  let annotationsForGame: Annotation[] = [];
  let lastNotifiedPly: number | null = null;

  function render(): void {
    root.dataset.sampleId = activeSample;
    root.dataset.ply = String(currentPly);
    const sliced = sliceToPly(events, currentPly);
    const projection = replayGameEvents(sliced);
    const state = projection.state;
    const finished = state.status.type === 'finished';
    renderClockPanel(clockPanel, state.clock, state, currentMeta());

    setBoardFromState(truthCg, state);

    if (finished && reveal) {
      // Postgame reveal: collapse all three panes to truth so the viewer
      // sees the full board they couldn't see during play.
      setBoardFromState(whiteCg, state);
      setBoardFromState(blackCg, state);
    } else {
      const whiteView = fogOfWarVariant.getPlayerView(state, 'white');
      const blackView = fogOfWarVariant.getPlayerView(state, 'black');
      setBoardFromView(whiteCg, whiteView);
      setBoardFromView(blackCg, blackView);
    }

    const showRevealLabels = finished && reveal;
    whitePane.labelEl.textContent = showRevealLabels
      ? `${whiteBaseLabel} — revealed`
      : whiteBaseLabel;
    blackPane.labelEl.textContent = showRevealLabels
      ? `${blackBaseLabel} — revealed`
      : blackBaseLabel;
    whitePane.el.classList.toggle('revealed', showRevealLabels);
    blackPane.el.classList.toggle('revealed', showRevealLabels);

    if (showControls) {
      const annotMark = annotation && annotationsAtPly(currentPly).length > 0 ? ' ★' : '';
      plyLabel.textContent = `Ply ${currentPly} / ${moveCount}${gameOverSuffix(state)}${annotMark}`;
      firstBtn.disabled = currentPly === 0;
      prevBtn.disabled = currentPly === 0;
      nextBtn.disabled = currentPly >= moveCount;
      lastBtn.disabled = currentPly >= moveCount;
    }

    if (finished) {
      applyEndGameState(state);
    } else {
      whitePane.el.classList.remove('winner', 'loser');
      blackPane.el.classList.remove('winner', 'loser');
      truthPane.el.classList.remove('finished');
      whitePane.statusEl.textContent = '';
      blackPane.statusEl.textContent = '';
      truthPane.statusEl.textContent = '';
    }

    if (finished && !finishedAck) {
      finishedAck = true;
      scheduleLoopIfNeeded();
    }

    renderAnnotPanel();
    beliefPanel?.render(currentPly);
    notifyPlyChange();
  }

  function notifyPlyChange(): void {
    if (!onPlyChange || lastNotifiedPly === currentPly) return;
    lastNotifiedPly = currentPly;
    onPlyChange(currentPly, moveCount);
  }

  function annotationsAtPly(ply: number): Annotation[] {
    return annotationsForGame.filter((a) => a.ply === ply);
  }

  function currentAnnotContext(): AnnotationContext | null {
    if (!annotation) return null;
    if (currentPly < 1) return null;
    const moveEvent = moveEventAtPly(currentPly);
    if (!moveEvent || moveEvent.type !== 'move-played') return null;

    const gameIndex = annotation.gameIndexForSampleId(activeSample);
    const tier1Color = annotation.tier1ColorForSampleId(activeSample);
    if (gameIndex === null) return null;

    const sliced = sliceToPly(events, currentPly);
    const projection = replayGameEvents(sliced);
    const fenAfter = boardFen(projection.state.board);
    const moveColor = (moveEvent as { color: Color }).color;
    const moveObj = (moveEvent as { move: { from: string; to: string; promotion?: string } }).move;
    const promotion = moveObj.promotion ? pieceFen(moveObj.promotion as PieceRole, 'black') : '';
    const uci = `${moveObj.from}${moveObj.to}${promotion}`;

    return {
      manifestUrl: annotation.manifestUrl,
      gamePath: activeSample,
      gameIndex,
      ply: currentPly,
      movePlayedUci: uci,
      movePlayedColor: moveColor,
      isTier1Move: tier1Color !== null && moveColor === tier1Color,
      boardFenAfter: fenAfter,
    };
  }

  function renderAnnotPanel(): void {
    if (!annotPanel || !annotation || !annotForm || !annotListEl) return;

    annotForm.setContext(currentAnnotContext());

    annotListEl.replaceChildren();
    const heading = document.createElement('div');
    heading.className = 'annot-panel-list-heading';
    heading.textContent = `Notes (${annotationsForGame.length})`;
    annotListEl.append(heading);

    if (annotationsForGame.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'annot-panel-empty';
      empty.textContent = 'No notes for this game yet.';
      annotListEl.append(empty);
      return;
    }

    const list = document.createElement('div');
    list.className = 'annot-panel-list';
    const sorted = [...annotationsForGame].sort((a, b) => a.ply - b.ply);
    for (const a of sorted) {
      const row = document.createElement('div');
      row.className = `annot-panel-item annot-${a.severity}${a.ply === currentPly ? ' active' : ''}`;

      const jumpBtn = document.createElement('button');
      jumpBtn.type = 'button';
      jumpBtn.className = 'annot-panel-item-jump';
      jumpBtn.textContent = formatAnnotationLine(a);
      jumpBtn.title = 'Jump to this ply';
      jumpBtn.addEventListener('click', () => {
        stopPlay();
        clearLoopTimer();
        finishedAck = false;
        setCurrentPly(a.ply);
        render();
      });

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'annot-panel-item-edit';
      editBtn.textContent = '✎';
      editBtn.title = 'Edit this note';
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        stopPlay();
        clearLoopTimer();
        finishedAck = false;
        setCurrentPly(a.ply);
        render();
        annotForm?.loadForEdit(a);
      });

      row.append(jumpBtn, editBtn);
      list.append(row);
    }
    annotListEl.append(list);
  }

  async function handleAnnotSave(
    formValues: {
      severity: 'major' | 'minor' | 'good' | 'neutral';
      better: string;
      note: string;
    },
    editing: Annotation | null,
  ): Promise<void> {
    if (editing) {
      const updated: Annotation = {
        ...editing,
        severity: formValues.severity,
        suggested_move_uci: formValues.better.trim() || null,
        note: formValues.note.trim(),
      };
      await updateAnnotation(updated);
      annotationsForGame = annotationsForGame.map((a) =>
        a.id === editing.id ? updated : a,
      );
    } else {
      const ctx = currentAnnotContext();
      if (!ctx) return;
      const annot = buildAnnotationFromForm(ctx, formValues);
      await saveAnnotation(annot);
      annotationsForGame = [...annotationsForGame, annot];
    }
    annotForm?.clearAfterSave();
    render();
    annotation?.onSaved?.();
  }

  async function reloadAnnotations(): Promise<void> {
    if (!annotation) return;
    const idx = annotation.gameIndexForSampleId(activeSample);
    if (idx === null) {
      annotationsForGame = [];
      return;
    }
    const all = await loadAnnotations();
    annotationsForGame = all.filter(
      (a) =>
        a.game_index === idx
        && a.game_path === activeSample
        && a.manifest_url === annotation.manifestUrl,
    );
  }

  function moveEventAtPly(ply: number): GameEvent | null {
    if (ply < 1) return null;
    let seen = 0;
    for (const event of events) {
      if (event.type !== 'move-played') continue;
      seen += 1;
      if (seen === ply) return event;
    }
    return null;
  }


  function scheduleLoopIfNeeded(): void {
    if (!loopSamples || loopSamples.length === 0) return;
    if (loopTimer !== null) return;
    loopTimer = window.setTimeout(() => {
      loopTimer = null;
      const next = pickNextSample(loopSamples, activeSample);
      void loadGame(next);
    }, betweenGameDelayMs);
  }

  function clearLoopTimer(): void {
    if (loopTimer !== null) {
      window.clearTimeout(loopTimer);
      loopTimer = null;
    }
  }

  function stopPlay(): void {
    if (playTimer !== null) {
      window.clearTimeout(playTimer);
      playTimer = null;
    }
    playBtn.textContent = '▶ Play';
  }

  function startPlay(): void {
    if (playTimer !== null) return;
    playBtn.textContent = '⏸ Pause';
    scheduleNextPly();
  }

  function scheduleNextPly(): void {
    const nextPly = currentPly + 1;
    if (nextPly > moveCount) {
      stopPlay();
      return;
    }
    const delay = delayForPly(nextPly);
    playTimer = window.setTimeout(() => {
      setCurrentPly(nextPly);
      render();
      scheduleNextPly();
    }, delay);
  }

  function setCurrentPly(ply: number): void {
    currentPly = Math.min(Math.max(ply, 0), moveCount);
  }

  function delayForPly(ply: number): number {
    let movesSeen = 0;
    for (const event of events) {
      if (event.type !== 'move-played') continue;
      movesSeen += 1;
      if (movesSeen !== ply) continue;
      const ext = event as unknown as MovePlayedExt;
      if (typeof ext.compute_ms === 'number' && ext.compute_ms >= 0) {
        return clampPlay(ext.compute_ms * COMPUTE_SCALE);
      }
      return FALLBACK_PLAY_MS;
    }
    return FALLBACK_PLAY_MS;
  }

  function clampPlay(ms: number): number {
    return Math.min(MAX_PLAY_MS, Math.max(MIN_PLAY_MS, ms));
  }

  async function loadGame(sampleId: string): Promise<void> {
    stopPlay();
    clearLoopTimer();
    activeSample = sampleId;
    annotationsForGame = [];
    events = loaderForId
      ? await loaderForId(sampleId)
      : await loadEvents(sampleId, urlForId);
    moveCount = events.filter((e) => e.type === 'move-played').length;
    beliefPanel?.setRows(belief?.rowsForSampleId(sampleId) ?? []);
    beliefPanel?.setTraceRows(belief?.traceRowsForSampleId?.(sampleId) ?? []);
    if (shouldApplyInitialPly && typeof options.initialPly === 'number') {
      currentPly = Math.min(Math.max(Math.floor(options.initialPly), 0), moveCount);
      shouldApplyInitialPly = false;
    } else {
      currentPly = 0;
    }
    lastNotifiedPly = null;
    finishedAck = false;
    applyMetadata();
    applyPerspective();
    if (annotation) await reloadAnnotations();
    render();
    if (autoplay) startPlay();
  }

  function applyPerspective(): void {
    const tier1Color = annotation?.tier1ColorForSampleId(activeSample) ?? null;
    applyBoardOrientation();
    if (tier1Color === 'black') {
      layout.replaceChildren(blackPane.el, truthPane.el, whitePane.el);
    } else {
      layout.replaceChildren(whitePane.el, truthPane.el, blackPane.el);
    }
  }

  // Attach click-to-pick on the truth board's inner cg-board element. cg-board
  // is the actual square-grid (full width of cg-wrap); the outer .replay-board
  // parent can be larger, which broke the prior coordinate math. Click events
  // bubble up from cg-board through pieces (which have pointer-events:none)
  // and squares to here, so a single listener on the parent works.
  if (annotation && annotForm) {
    truthPane.boardEl.style.cursor = 'crosshair';
    truthPane.boardEl.addEventListener('click', (e) => {
      const sq = squareFromCgBoardClick(truthPane.boardEl, e, boardOrientation);
      if (sq) annotForm?.appendPickedSquare(sq);
    });
  }


  function applyMetadata(): void {
    const meta = currentMeta();
    whitePane.nameEl.textContent = meta?.whiteName ?? '';
    blackPane.nameEl.textContent = meta?.blackName ?? '';
    if (gameIdFooter) {
      gameIdFooter.textContent = meta ? `game ${activeSample}` : '';
    }
    // Reset any prior end-game state (returning to ply 0).
    whitePane.el.classList.remove('winner', 'loser');
    blackPane.el.classList.remove('winner', 'loser');
    truthPane.el.classList.remove('finished');
    whitePane.statusEl.textContent = '';
    blackPane.statusEl.textContent = '';
    truthPane.statusEl.textContent = '';
  }

  function currentMeta(): GameMeta | undefined {
    return metadataByRoomId?.[activeSample];
  }

  function applyEndGameState(state: GameState): void {
    if (state.status.type !== 'finished') return;
    const winner = state.status.winner;
    const reasonLabel = endGameReasonLabel(state.status.reason);

    if (winner === 'white') {
      whitePane.el.classList.add('winner');
      blackPane.el.classList.add('loser');
      whitePane.statusEl.textContent = 'WINNER';
      blackPane.statusEl.textContent = 'LOST';
    } else if (winner === 'black') {
      blackPane.el.classList.add('winner');
      whitePane.el.classList.add('loser');
      blackPane.statusEl.textContent = 'WINNER';
      whitePane.statusEl.textContent = 'LOST';
    } else {
      // Draw — neither side gets winner/loser visual state.
      whitePane.statusEl.textContent = 'DRAW';
      blackPane.statusEl.textContent = 'DRAW';
    }
    truthPane.el.classList.add('finished');
    truthPane.statusEl.textContent = reasonLabel;
  }

  function endGameReasonLabel(reason: string): string {
    if (reason === 'king-captured') return 'King captured';
    if (reason === 'timeout') return 'Timeout';
    if (reason === 'checkmate') return 'Checkmate';
    if (reason === 'draw') return 'Draw';
    return reason;
  }

  if (showControls) {
    firstBtn.addEventListener('click', () => {
      stopPlay();
      clearLoopTimer();
      finishedAck = false;
      setCurrentPly(0);
      render();
    });
    prevBtn.addEventListener('click', () => {
      stopPlay();
      clearLoopTimer();
      finishedAck = false;
      if (currentPly > 0) {
        setCurrentPly(currentPly - 1);
        render();
      }
    });
    nextBtn.addEventListener('click', () => {
      stopPlay();
      clearLoopTimer();
      if (currentPly < moveCount) {
        setCurrentPly(currentPly + 1);
        render();
      }
    });
    lastBtn.addEventListener('click', () => {
      stopPlay();
      clearLoopTimer();
      setCurrentPly(moveCount);
      render();
    });
    playBtn.addEventListener('click', () => {
      if (playTimer !== null) {
        stopPlay();
      } else if (currentPly >= moveCount) {
        finishedAck = false;
        setCurrentPly(0);
        render();
        startPlay();
      } else {
        startPlay();
      }
    });
    flipBtn.addEventListener('click', () => {
      boardOrientation = boardOrientation === 'white' ? 'black' : 'white';
      applyBoardOrientation();
    });
  }

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stopPlay();
        clearLoopTimer();
        finishedAck = false;
        if (currentPly > 0) {
          setCurrentPly(currentPly - 1);
          render();
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        stopPlay();
        clearLoopTimer();
        if (currentPly < moveCount) {
          setCurrentPly(currentPly + 1);
          render();
        }
      } else if (e.key === 'a' && annotation && annotForm) {
        e.preventDefault();
        stopPlay();
        clearLoopTimer();
        annotForm.focus();
      }
    },
    { signal: abortController.signal },
  );

  await loadGame(initialSampleId);

  function applyBoardOrientation(): void {
    whiteCg.set({ orientation: boardOrientation });
    truthCg.set({ orientation: boardOrientation });
    blackCg.set({ orientation: boardOrientation });
  }
}

function pickNextSample(pool: string[], current: string): string {
  if (pool.length <= 1) return pool[0] ?? current;
  const others = pool.filter((id) => id !== current);
  return others[Math.floor(Math.random() * others.length)] ?? pool[0];
}

function createGameIdFooter(): HTMLDivElement {
  const footer = document.createElement('div');
  footer.className = 'replay-game-id';
  return footer;
}

type ClockPanelHandle = {
  blackRow: HTMLDivElement;
  blackTime: HTMLSpanElement;
  el: HTMLDivElement;
  label: HTMLSpanElement;
  whiteRow: HTMLDivElement;
  whiteTime: HTMLSpanElement;
};

function createClockPanel(): ClockPanelHandle {
  const el = document.createElement('div');
  el.className = 'replay-clock-panel';
  el.hidden = true;

  const label = document.createElement('span');
  label.className = 'replay-clock-control';

  const whiteRow = createClockRow('White');
  const blackRow = createClockRow('Black');
  el.append(label, whiteRow.row, blackRow.row);

  return {
    blackRow: blackRow.row,
    blackTime: blackRow.time,
    el,
    label,
    whiteRow: whiteRow.row,
    whiteTime: whiteRow.time,
  };
}

function createClockRow(colorLabel: string): { row: HTMLDivElement; time: HTMLSpanElement } {
  const row = document.createElement('div');
  row.className = 'replay-clock-row';
  const label = document.createElement('span');
  label.className = 'replay-clock-side';
  label.textContent = colorLabel;
  const time = document.createElement('span');
  time.className = 'replay-clock-time';
  row.append(label, time);
  return { row, time };
}

function renderClockPanel(
  panel: ClockPanelHandle,
  clock: ClockState | undefined,
  state: GameState,
  meta: GameMeta | undefined,
): void {
  const timeControl = clock ? timeControlLabelFromClock(clock) : timeControlLabelFromMeta(meta?.timeControl);
  if (!clock && !timeControl) {
    panel.el.hidden = true;
    return;
  }

  panel.el.hidden = false;
  panel.label.textContent = timeControl ? `Time ${timeControl}` : 'Clock';

  if (!clock) {
    panel.whiteTime.textContent = '—';
    panel.blackTime.textContent = '—';
    panel.whiteRow.classList.remove('active');
    panel.blackRow.classList.remove('active');
    return;
  }

  const displayAt = clock.runningSince ?? eventTimeAtState(state) ?? 0;
  panel.whiteTime.textContent = formatClock(clockRemainingMs(clock, 'white', displayAt));
  panel.blackTime.textContent = formatClock(clockRemainingMs(clock, 'black', displayAt));
  panel.whiteRow.classList.toggle('active', state.status.type === 'playing' && clock.activeColor === 'white');
  panel.blackRow.classList.toggle('active', state.status.type === 'playing' && clock.activeColor === 'black');
}

function eventTimeAtState(state: GameState): number | null {
  return state.clock?.runningSince ?? null;
}

function timeControlLabelFromClock(clock: ClockState): string {
  const base = formatClock(clock.initialMs);
  const incrementSeconds = Math.round(clock.incrementMs / 1000);
  return incrementSeconds > 0 ? `${base}+${incrementSeconds}` : base;
}

function timeControlLabelFromMeta(raw: Record<string, unknown> | null | undefined): string | null {
  if (!raw) return null;
  if (raw.kind === 'none') return null;

  const initialSeconds = numericValue(raw.initial_seconds);
  const incrementSeconds = numericValue(raw.increment_seconds);
  if (initialSeconds !== null) {
    const base = formatClock(initialSeconds * 1000);
    return incrementSeconds && incrementSeconds > 0 ? `${base}+${Math.round(incrementSeconds)}` : base;
  }

  const initialMs = numericValue(raw.initialMs) ?? numericValue(raw.initial_ms);
  const incrementMs = numericValue(raw.incrementMs) ?? numericValue(raw.increment_ms);
  if (initialMs !== null) {
    const base = formatClock(initialMs);
    const increment = incrementMs ? Math.round(incrementMs / 1000) : 0;
    return increment > 0 ? `${base}+${increment}` : base;
  }

  const perMoveMs = numericValue(raw.milliseconds) ?? numericValue(raw.per_move_ms);
  if (raw.kind === 'per-move' && perMoveMs !== null) return `${formatClock(perMoveMs)} / move`;

  return typeof raw.kind === 'string' ? raw.kind : null;
}

function numericValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatClock(ms: number): string {
  const bounded = Math.max(0, ms);
  const totalSeconds = Math.ceil(bounded / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function createPane(label: string): {
  el: HTMLDivElement;
  boardEl: HTMLDivElement;
  labelEl: HTMLDivElement;
  nameEl: HTMLDivElement;
  statusEl: HTMLDivElement;
} {
  const el = document.createElement('div');
  el.className = 'replay-pane';
  const labelEl = document.createElement('div');
  labelEl.className = 'replay-pane-label';
  labelEl.textContent = label;
  const nameEl = document.createElement('div');
  nameEl.className = 'replay-pane-name';
  const boardEl = document.createElement('div');
  boardEl.className = 'board replay-board';
  const statusEl = document.createElement('div');
  statusEl.className = 'replay-pane-status';
  el.append(labelEl, nameEl, boardEl, statusEl);
  return { el, boardEl, labelEl, nameEl, statusEl };
}

function controlButton(text: string, title: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'replay-button';
  btn.textContent = text;
  btn.title = title;
  return btn;
}

function sliceToPly(events: GameEvent[], ply: number): GameEvent[] {
  const result: GameEvent[] = [];
  let moves = 0;
  for (const event of events) {
    if (event.type === 'move-played') {
      if (moves >= ply) break;
      result.push(event);
      moves += 1;
    } else {
      result.push(event);
    }
  }
  return result;
}

function defaultUrlForId(sampleId: string): string {
  const safeId = sampleId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeId) throw new Error(`invalid replay id: ${sampleId}`);
  return `/replay-samples/${safeId}.jsonl`;
}

async function loadEvents(
  sampleId: string,
  urlForId: (id: string) => string = defaultUrlForId,
): Promise<GameEvent[]> {
  const url = urlForId(sampleId);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`failed to load replay sample ${sampleId} at ${url}: ${resp.status}`);
  const text = await resp.text();
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as GameEvent);
}

function createBoard(el: HTMLElement, orientation: Color): Api {
  return Chessground(el, {
    animation: { enabled: true, duration: 140 },
    coordinates: false,
    coordinatesOnSquares: false,
    fen: '8/8/8/8/8/8/8/8',
    orientation,
    movable: { free: false, color: undefined, dests: new Map() },
    draggable: { enabled: false },
    selectable: { enabled: false },
    premovable: { enabled: false },
    viewOnly: true,
  });
}

/** Compute algebraic square (e.g., "e4") from a click event on a chessground
 *  inner cg-board element. cg-board is rendered at full width of cg-wrap and
 *  matches the visible board exactly — unlike the outer .replay-board parent
 *  which can be wider/taller due to padding. Returns null if click is off the
 *  board or if the element isn't found. */
function squareFromCgBoardClick(
  boardEl: HTMLElement,
  e: MouseEvent,
  orientation: Color,
): string | null {
  const cg = boardEl.querySelector('cg-board') as HTMLElement | null;
  if (!cg) return null;
  const rect = cg.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return null;
  const fileIdx = Math.floor((x / rect.width) * 8);
  const rankIdx = Math.floor((y / rect.height) * 8);
  const fileChar =
    orientation === 'white'
      ? String.fromCharCode(97 + fileIdx)
      : String.fromCharCode(97 + (7 - fileIdx));
  const rankNum = orientation === 'white' ? 8 - rankIdx : 1 + rankIdx;
  if (fileChar < 'a' || fileChar > 'h' || rankNum < 1 || rankNum > 8) return null;
  return `${fileChar}${rankNum}`;
}

function setBoardFromView(api: Api, view: PlayerView): void {
  const lastMove = view.lastMove
    ? ([view.lastMove.from, view.lastMove.to] as cg.Key[])
    : undefined;
  api.set({
    fen: boardFen(view.board),
    lastMove,
    highlight: { custom: hiddenSquareClasses(view), lastMove: true },
  });
}

function setBoardFromState(api: Api, state: GameState): void {
  const lastMove = state.lastMove
    ? ([state.lastMove.from, state.lastMove.to] as cg.Key[])
    : undefined;
  api.set({
    fen: boardFen(state.board),
    lastMove,
    highlight: { custom: new Map(), lastMove: true },
  });
}

function hiddenSquareClasses(view: PlayerView): cg.SquareClasses {
  const classes = new Map<cg.Key, string>();
  if (view.variant !== 'fog-of-war' || view.status.type === 'finished') return classes;
  const visible = new Set(view.visibleSquares);
  for (const square of allSquares) {
    if (!visible.has(square)) classes.set(square as cg.Key, 'fog-hidden');
  }
  return classes;
}

function boardFen(board: Board): string {
  const fenRanks = [8, 7, 6, 5, 4, 3, 2, 1];
  return fenRanks.map((rank) => boardRankFen(board, rank)).join('/');
}

function boardRankFen(board: Board, rank: number): string {
  let empty = 0;
  let fen = '';
  for (const file of files) {
    const piece = board[`${file}${rank}` as Square];
    if (!piece) {
      empty += 1;
      continue;
    }
    if (empty > 0) {
      fen += String(empty);
      empty = 0;
    }
    fen += pieceFen(piece.role, piece.color);
  }
  return empty > 0 ? `${fen}${empty}` : fen;
}

function pieceFen(role: PieceRole, color: Color): string {
  const map: Record<PieceRole, string> = {
    bishop: 'b',
    king: 'k',
    knight: 'n',
    pawn: 'p',
    queen: 'q',
    rook: 'r',
  };
  const ch = map[role];
  return color === 'white' ? ch.toUpperCase() : ch;
}

type AnnotFormHandle = {
  el: HTMLElement;
  setContext: (ctx: AnnotationContext | null) => void;
  loadForEdit: (a: Annotation) => void;
  focus: () => void;
  clearAfterSave: () => void;
  appendPickedSquare: (sq: string) => void;
};

function createAnnotForm(opts: {
  onSave: (
    values: {
      severity: 'major' | 'minor' | 'good' | 'neutral';
      better: string;
      note: string;
    },
    editing: Annotation | null,
  ) => Promise<void>;
}): AnnotFormHandle {
  const el = document.createElement('div');
  el.className = 'annot-form';
  el.innerHTML = `
    <div class="annot-form-header">
      <span class="annot-form-title">Annotate</span>
      <span class="annot-form-context">— scrub to a ply to begin</span>
      <button type="button" class="annot-form-cancel-edit" hidden>✕ cancel edit</button>
    </div>
    <div class="annot-form-row">
      <label class="annot-form-label">Severity</label>
      <div class="annot-form-radios">
        <label class="annot-form-radio annot-form-radio-major"><input type="radio" name="annot-severity" value="major" checked> Major</label>
        <label class="annot-form-radio annot-form-radio-minor"><input type="radio" name="annot-severity" value="minor"> Minor</label>
        <label class="annot-form-radio annot-form-radio-neutral"><input type="radio" name="annot-severity" value="neutral"> Neutral</label>
        <label class="annot-form-radio annot-form-radio-good"><input type="radio" name="annot-severity" value="good"> Good</label>
      </div>
      <label class="annot-form-label" for="annot-better">Better</label>
      <input type="text" id="annot-better" class="annot-form-input annot-form-input-better" placeholder="click 2 squares on Truth, or type UCI" autocomplete="off">
      <button type="button" class="annot-form-better-clear" title="Clear the picked move">×</button>
    </div>
    <div class="annot-form-row annot-form-row-note">
      <textarea id="annot-note" class="annot-form-note" rows="2" placeholder="What stood out — mistake, better idea, or strong move and why? (⌘/Ctrl+Enter saves)"></textarea>
      <button type="button" class="annot-form-save">Save</button>
    </div>
    <div class="annot-form-status"></div>
  `;

  const titleEl = el.querySelector('.annot-form-title') as HTMLSpanElement;
  const contextEl = el.querySelector('.annot-form-context') as HTMLSpanElement;
  const noteEl = el.querySelector('#annot-note') as HTMLTextAreaElement;
  const betterEl = el.querySelector('#annot-better') as HTMLInputElement;
  const betterClearBtn = el.querySelector('.annot-form-better-clear') as HTMLButtonElement;
  const cancelEditBtn = el.querySelector('.annot-form-cancel-edit') as HTMLButtonElement;
  const saveBtn = el.querySelector('.annot-form-save') as HTMLButtonElement;
  const statusEl = el.querySelector('.annot-form-status') as HTMLDivElement;

  let editingAnnotation: Annotation | null = null;
  let lastContext: AnnotationContext | null = null;

  function exitEditMode(): void {
    editingAnnotation = null;
    cancelEditBtn.hidden = true;
    el.classList.remove('annot-form-editing');
    titleEl.textContent = 'Annotate';
    saveBtn.textContent = 'Save';
    applyContextHeader(lastContext);
    noteEl.value = '';
    betterEl.value = '';
  }

  function applyContextHeader(ctx: AnnotationContext | null): void {
    if (!ctx) {
      contextEl.textContent = '— scrub to a ply to begin';
      return;
    }
    const tier1Marker = ctx.isTier1Move ? 'tier1' : 'random';
    contextEl.innerHTML = `— ply <strong>${ctx.ply}</strong> · played <span class="annot-form-move">${ctx.movePlayedUci}</span> <span class="annot-form-meta">(${ctx.movePlayedColor}, ${tier1Marker})</span>`;
  }

  betterClearBtn.addEventListener('click', () => {
    betterEl.value = '';
    betterEl.focus();
  });

  cancelEditBtn.addEventListener('click', () => {
    exitEditMode();
  });

  // Clicks on the truth board push squares into the better-move input.
  // Two clicks fill in a UCI; a third click starts over.
  function appendPickedSquare(sq: string): void {
    const cur = betterEl.value.trim();
    if (cur.length === 0 || cur.length >= 4) {
      betterEl.value = sq;
    } else if (cur.length === 2) {
      betterEl.value = cur + sq;
    } else {
      // Mid-typed weird state — replace with this square as the new "from".
      betterEl.value = sq;
    }
  }

  let ready = false;

  function isReady(): boolean {
    return ready || editingAnnotation !== null;
  }

  function severityValue(): 'major' | 'minor' | 'good' | 'neutral' {
    const checked = el.querySelector('input[name=annot-severity]:checked') as HTMLInputElement | null;
    const v = checked?.value ?? 'major';
    return (v === 'minor' || v === 'good' || v === 'neutral' ? v : 'major') as
      | 'major' | 'minor' | 'good' | 'neutral';
  }

  async function tryToSave(): Promise<void> {
    if (!isReady()) {
      statusEl.textContent = 'No move at current ply.';
      statusEl.className = 'annot-form-status annot-form-status-warn';
      return;
    }
    saveBtn.disabled = true;
    statusEl.textContent = editingAnnotation ? 'Updating…' : 'Saving…';
    statusEl.className = 'annot-form-status';
    try {
      await opts.onSave(
        {
          severity: severityValue(),
          better: betterEl.value,
          note: noteEl.value,
        },
        editingAnnotation,
      );
      statusEl.textContent = editingAnnotation ? 'Updated.' : 'Saved.';
      statusEl.className = 'annot-form-status annot-form-status-ok';
    } catch (err) {
      statusEl.textContent = `Save failed: ${(err as Error).message}`;
      statusEl.className = 'annot-form-status annot-form-status-err';
    } finally {
      saveBtn.disabled = false;
    }
  }

  saveBtn.addEventListener('click', () => void tryToSave());
  el.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      void tryToSave();
    }
  });

  return {
    el,
    setContext(ctx) {
      ready = ctx !== null;
      lastContext = ctx;
      // Don't blow away the editing context header while editing.
      if (!editingAnnotation) {
        applyContextHeader(ctx);
      }
    },
    loadForEdit(a) {
      editingAnnotation = a;
      const sevInput = el.querySelector(
        `input[name=annot-severity][value="${a.severity}"]`,
      ) as HTMLInputElement | null;
      if (sevInput) sevInput.checked = true;
      betterEl.value = a.suggested_move_uci ?? '';
      noteEl.value = a.note;
      titleEl.textContent = 'Edit note';
      saveBtn.textContent = 'Update';
      cancelEditBtn.hidden = false;
      el.classList.add('annot-form-editing');
      contextEl.innerHTML = `— ply <strong>${a.ply}</strong> · played <span class="annot-form-move">${a.move_played_uci}</span> <span class="annot-form-meta">(${a.move_played_color}, editing)</span>`;
      noteEl.focus();
    },
    focus() {
      noteEl.focus();
    },
    clearAfterSave() {
      if (editingAnnotation) {
        exitEditMode();
        return;
      }
      noteEl.value = '';
      betterEl.value = '';
      // keep severity at last selection — user is likely classifying a streak of similar issues
    },
    appendPickedSquare,
  };
}

function gameOverSuffix(state: GameState): string {
  if (state.status.type !== 'finished') return '';
  const winner = state.status.winner;
  if (!winner) return ` — drawn (${state.status.reason})`;
  return ` — ${winner} wins (${state.status.reason})`;
}
