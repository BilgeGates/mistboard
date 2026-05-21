import {
  algebraicMoveLabels as buildAlgebraicMoveLabels,
  clockRemainingMs,
  fogOfWarVariant,
  replayGameEvents,
  type Board,
  type ClockState,
  type Color,
  type GameEvent,
  type GameState,
  type Move,
  type Piece,
  type PieceRole,
  type PlayerView,
  type Square,
} from '@mistboard/game';
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
import { files, ranks, allSquares, formatClock } from './web-utils.js';
import { createBeliefPanel, type BeliefConfig, type BeliefPanelHandle } from './belief-panel.js';

const FALLBACK_PLAY_MS = 900;
const COMPUTE_SCALE = 50;
const LEGACY_RECORDED_TIME_SCALE = 0.12;
const MIN_RECORDED_DELTA_MS = 150;
const MIN_PLAY_MS = 700;
const MAX_PLAY_MS = 2500;
const DEFAULT_BETWEEN_GAME_DELAY_MS = 8000;

const replayAbortControllers = new WeakMap<HTMLElement, AbortController>();

type MovePlayedEvent = Extract<GameEvent, { type: 'move-played' }>;
type MovePlayedExt = MovePlayedEvent & { compute_ms?: number; thinkTimeMs?: number };

export type GameMeta = {
  whiteName: string | null;
  blackName: string | null;
  gameUrl?: string | null;
  modeLabel?: string;
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
  /** Render transport as the room-page side panel or the legacy inline bar. Defaults to inline. */
  controlsMode?: 'bar' | 'panel';
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
  metadataMode?: 'full' | 'compact';
  /**
   * Which panes to render. 'all' (default) shows white | truth | black.
   * Provide a resolver to pick a single pane per sample — used by the
   * landing hero, which shows one player's POV instead of the review triptych.
   * Returning 'all' from the resolver shows all three.
   */
  panes?: 'all' | { resolver: (sampleId: string, meta: GameMeta | undefined) => 'white' | 'black' | 'all' };
  /** When true, suppress the compact-mode game id pill (room slug). */
  hideGameIdPill?: boolean;
  /**
   * When set, enables the annotation tooling. Press `a` at any ply to open
   * the modal pre-filled with the move just played. Annotations persist via
   * POST /api/annotations (handled by the Vite dev plugin in development).
   */
  annotation?: AnnotationConfig;
  belief?: BeliefConfig;
  enginePanels?: EngineReviewPanels;
};

export type EngineReviewPanels = {
  belief?: {
    available: boolean;
    defaultOpen?: boolean;
    seats?: Color[];
    snapshotKinds?: string[];
  };
  trace?: {
    available: boolean;
    defaultOpen?: boolean;
    seats?: Color[];
  };
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
  const controlsMode = options.controlsMode ?? 'bar';
  let boardOrientation = options.orientation ?? options.blackOrientation ?? 'white';
  const loopSamples = options.loopSamples;
  const betweenGameDelayMs = options.betweenGameDelayMs ?? DEFAULT_BETWEEN_GAME_DELAY_MS;
  const autoplay = options.autoplay === true || loopSamples !== undefined;
  const urlForId = options.urlForId ?? defaultUrlForId;
  const loaderForId = options.loaderForId;
  const metadataByRoomId = options.metadataByRoomId;
  const metadataMode = options.metadataMode ?? 'full';
  const panesResolver = typeof options.panes === 'object' ? options.panes.resolver : null;
  const hideGameIdPill = options.hideGameIdPill === true;
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
  root.classList.toggle('replay-compact', metadataMode === 'compact');

  const layout = document.createElement('div');
  layout.className = 'replay-layout';

  const whiteBaseLabel = "White's view";
  const blackBaseLabel = "Black's view";

  const whitePane = createPane(whiteBaseLabel, 'white');
  const truthPane = createPane('Truth', 'truth');
  const blackPane = createPane(blackBaseLabel, 'black');
  layout.append(whitePane.el, truthPane.el, blackPane.el);
  // Apply the pane choice synchronously so the triptych doesn't flash before
  // loadGame() finishes its async fetch and calls applyMetadata().
  if (panesResolver) {
    const initialMeta = metadataByRoomId?.[initialSampleId];
    const initialChoice = panesResolver(initialSampleId, initialMeta);
    layout.classList.add(
      initialChoice === 'white'
        ? 'replay-layout-single-white'
        : initialChoice === 'black'
          ? 'replay-layout-single-black'
          : 'replay-layout-all',
    );
  }
  root.append(layout);

  const firstBtn = controlButton('|<', 'First position');
  const prevBtn = controlButton('<', 'Previous move');
  const playBtn = controlButton('▶ Play', 'Play');
  const nextBtn = controlButton('>', 'Next move');
  const lastBtn = controlButton('>|', 'Latest position');
  const flipBtn = controlButton('Flip', 'Flip all boards');
  const plyLabel = document.createElement('span');
  plyLabel.className = 'replay-ply-label';
  const movesPanel = showControls && controlsMode === 'panel' ? createReplayMovesPanel() : null;

  const gameMetaPanel = metadataByRoomId ? createGameMetaPanel(metadataMode, { hideGameIdPill }) : null;
  if (gameMetaPanel) root.append(gameMetaPanel.el);
  if (movesPanel) root.append(movesPanel.el);
  const clockPanel = createClockPanel();
  // In compact + single-POV mode (landing hero) the truth pane is CSS-hidden,
  // so clocks hosted on truth would also be hidden. Track the current host
  // pane so we can move the clock rows when the visible pane changes across
  // looped games.
  let compactClockHost: { boardEl: HTMLDivElement; clockSlot: HTMLDivElement } | null = null;
  function relocateCompactClockRows(host: { boardEl: HTMLDivElement; clockSlot: HTMLDivElement }): void {
    if (compactClockHost === host) return;
    clockPanel.blackRow.remove();
    clockPanel.whiteRow.remove();
    host.boardEl.before(clockPanel.blackRow);
    host.clockSlot.append(clockPanel.whiteRow);
    compactClockHost = host;
  }
  function paneForChoice(choice: 'white' | 'black' | 'all'): { boardEl: HTMLDivElement; clockSlot: HTMLDivElement } {
    return choice === 'white' ? whitePane : choice === 'black' ? blackPane : truthPane;
  }
  if (metadataMode === 'compact') {
    // Un-hide clock rows immediately so the host column reserves the same
    // vertical space as the side panes' spacers from first paint; otherwise
    // the board sits ~42px higher until clocks render, then jumps when
    // renderClockPanel un-hides them.
    clockPanel.blackRow.hidden = false;
    clockPanel.whiteRow.hidden = false;
    clockPanel.blackTime.textContent = '—';
    clockPanel.whiteTime.textContent = '—';
    clockPanel.blackRow.classList.add('replay-clock-row-top');
    clockPanel.whiteRow.classList.add('replay-clock-row-bottom');

    if (panesResolver) {
      // Single-POV layout: the only visible pane hosts the clocks (and
      // player names live inside the clock rows via setClockPanelNames).
      // The hidden panes don't need spacers since they contribute nothing
      // to layout.
      const initialMeta = metadataByRoomId?.[initialSampleId];
      const initialChoice = panesResolver(initialSampleId, initialMeta);
      relocateCompactClockRows(paneForChoice(initialChoice));
    } else {
      // Triptych: clocks on truth, spacers on side panes so all three
      // board tops align.
      whitePane.boardEl.before(createCompactClockSpacer());
      blackPane.boardEl.before(createCompactClockSpacer());
      whitePane.clockSlot.append(createCompactClockSpacer());
      blackPane.clockSlot.append(createCompactClockSpacer());
      relocateCompactClockRows(truthPane);
    }
  } else {
    whitePane.clockSlot.append(clockPanel.whiteRow);
    blackPane.clockSlot.append(clockPanel.blackRow);
    root.append(clockPanel.el);
  }

  if (showControls && controlsMode === 'bar') {
    const controls = document.createElement('div');
    controls.className = 'replay-control-bar';
    controls.append(firstBtn, prevBtn, playBtn, nextBtn, lastBtn, flipBtn, plyLabel);
    root.append(controls);
  }

  const whiteCg = createBoard(whitePane.boardEl, boardOrientation);
  const truthCg = createBoard(truthPane.boardEl, boardOrientation);
  const blackCg = createBoard(blackPane.boardEl, boardOrientation);

  const annotation = options.annotation;
  const belief = options.belief;
  const enginePanelDock = createEnginePanelDock(options.enginePanels);
  const toolsRow = belief || annotation || enginePanelDock ? document.createElement('div') : null;
  const toolsToggleBar = toolsRow ? createAnalysisToolToggleBar() : null;
  if (toolsRow) {
    toolsRow.className = 'replay-tools-row';
    root.append(toolsRow);
    if (toolsToggleBar) toolsRow.append(toolsToggleBar.el);
  }
  let beliefPanel: BeliefPanelHandle | null = null;
  let beliefPanelVisible = Boolean(belief);
  let annotationPanelVisible = Boolean(annotation);
  if (enginePanelDock) toolsRow?.append(enginePanelDock.el);
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

  if (toolsToggleBar) {
    if (beliefPanel) {
      toolsToggleBar.addToggle('belief', 'Belief', true, (visible) => {
        beliefPanelVisible = visible;
        syncAnalysisToolVisibility();
      });
    }
    if (annotPanel) {
      toolsToggleBar.addToggle('annotation', 'Annotate', true, (visible) => {
        annotationPanelVisible = visible;
        syncAnalysisToolVisibility();
      });
    }
  }
  syncAnalysisToolVisibility();

  let activeSample = initialSampleId;
  let events: GameEvent[] = [];
  let moveCount = 0;
  let currentPly = 0;
  let shouldApplyInitialPly = Number.isFinite(options.initialPly);
  let playTimer: number | null = null;
  let loopTimer: number | null = null;
  let clockTickTimer: number | null = null;
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
    renderClockState(state, sliced);

    setBoardFromState(truthCg, state);

    if (finished && reveal) {
      // Postgame reveal: collapse all three panes to truth so the viewer
      // sees the full board they couldn't see during play.
      setBoardFromState(whiteCg, state);
      setBoardFromState(blackCg, state);
    } else {
      // At game end, getPlayerView would collapse visibility to just the
      // player's own piece squares (getVisibilityMoves returns [] when
      // state.status.type !== 'playing'). For postgame fog views where we
      // intentionally don't reveal — the landing hero loop, primarily — that
      // looks like the fog snuffs vision to nothing the instant the game
      // ends. Compute visibility against a synthetic playing state so the
      // player keeps the same mid-game vision they had on the last ply
      // (fog still on, opponent moves still hidden — just not collapsed).
      const visState = finished ? syntheticPlayingState(state) : state;
      let whiteView = fogOfWarVariant.getPlayerView(visState, 'white');
      let blackView = fogOfWarVariant.getPlayerView(visState, 'black');
      if (finished) {
        whiteView = { ...whiteView, status: state.status, legalMoves: [] };
        blackView = { ...blackView, status: state.status, legalMoves: [] };
      }
      if (
        finished
        && state.status.type === 'finished'
        && state.status.reason === 'king-captured'
        && state.lastMove
      ) {
        const loser = state.status.winner === 'white' ? 'black' : 'white';
        const attacker = state.board[state.lastMove.to];
        if (attacker) {
          if (loser === 'black') {
            blackView = revealKingCaptureForLoser(blackView, state.lastMove, attacker);
          } else {
            whiteView = revealKingCaptureForLoser(whiteView, state.lastMove, attacker);
          }
        }
      }
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
      movesPanel && renderReplayMovesPanel(movesPanel, {
        activePly: currentPly,
        eventIndex: currentReplayEventIndex(),
        events,
        moveCount,
        onJump: (ply) => {
          stopPlay();
          clearLoopTimer();
          finishedAck = false;
          setCurrentPly(ply);
          render();
        },
      });
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
    syncAnalysisToolVisibility();
    notifyPlyChange();
  }

  function notifyPlyChange(): void {
    if (!onPlyChange || lastNotifiedPly === currentPly) return;
    lastNotifiedPly = currentPly;
    onPlyChange(currentPly, moveCount);
  }

  function syncAnalysisToolVisibility(): void {
    if (beliefPanel) beliefPanel.el.hidden = !beliefPanelVisible;
    if (annotPanel) annotPanel.hidden = !annotationPanelVisible;
    toolsToggleBar?.setPressed('belief', beliefPanelVisible);
    toolsToggleBar?.setPressed('annotation', annotationPanelVisible);
    const hasVisibleAnalysis = Boolean((beliefPanel && beliefPanelVisible) || (annotPanel && annotationPanelVisible));
    root.classList.toggle('analysis-tools-open', hasVisibleAnalysis);
    root.classList.toggle('analysis-tools-collapsed', !hasVisibleAnalysis);
    root.classList.toggle('analysis-belief-open', Boolean(beliefPanel && beliefPanelVisible));
    root.classList.toggle('analysis-annotation-open', Boolean(annotPanel && annotationPanelVisible));
    if (toolsRow) {
      toolsRow.classList.toggle('analysis-tools-collapsed', !hasVisibleAnalysis);
      toolsRow.classList.toggle('analysis-belief-open', Boolean(beliefPanel && beliefPanelVisible));
      toolsRow.classList.toggle('analysis-annotation-open', Boolean(annotPanel && annotationPanelVisible));
    }
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
      loadGame(next).catch((err) => console.warn('[replay loop] failed to load game, skipping:', next, err));
    }, betweenGameDelayMs);
  }

  function clearLoopTimer(): void {
    if (loopTimer !== null) {
      window.clearTimeout(loopTimer);
      loopTimer = null;
    }
  }

  function renderClockState(state: GameState, slicedEvents: GameEvent[]): void {
    const displayAt = replayClockDisplayAt(slicedEvents, state);
    renderClockPanel(clockPanel, state.clock, state, currentMeta(), displayAt ?? undefined);
  }

  function stopPlay(): void {
    if (playTimer !== null) {
      window.clearTimeout(playTimer);
      playTimer = null;
    }
    clearClockTickTimer();
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
      scheduleLoopIfNeeded();
      return;
    }
    const delay = delayForPly(nextPly);
    playTimer = window.setTimeout(() => {
      clearClockTickTimer();
      setCurrentPly(nextPly);
      render();
      scheduleNextPly();
    }, delay);
    startClockTickTimer(nextPly, delay);
  }

  function clearClockTickTimer(): void {
    if (clockTickTimer !== null) {
      window.clearInterval(clockTickTimer);
      clockTickTimer = null;
    }
  }

  function startClockTickTimer(nextPly: number, delay: number): void {
    clearClockTickTimer();
    if (delay <= 0) return;
    const sliced = sliceToPly(events, currentPly);
    const projection = replayGameEvents(sliced);
    const state = projection.state;
    const clock = state.clock;
    if (!clock || state.status.type !== 'playing' || clock.runningSince === null) return;
    const startDisplay = clock.runningSince;
    const nextEvent = moveEventAtPly(nextPly);
    const endDisplay = nextEvent && typeof nextEvent.at === 'number' && Number.isFinite(nextEvent.at)
      ? nextEvent.at
      : startDisplay + delay;
    const gap = Math.max(0, endDisplay - startDisplay);
    const startWall = performance.now();
    const meta = currentMeta();
    const tick = (): void => {
      const elapsedWall = performance.now() - startWall;
      const fraction = Math.min(elapsedWall / delay, 1);
      const displayAt = startDisplay + gap * fraction;
      renderClockPanel(clockPanel, clock, state, meta, displayAt);
    };
    clockTickTimer = window.setInterval(tick, 100);
  }

  function setCurrentPly(ply: number): void {
    currentPly = Math.min(Math.max(ply, 0), moveCount);
  }

  function currentReplayEventIndex(): number {
    if (events.length === 0) return 0;
    return sliceToPly(events, currentPly).length;
  }

  function delayForPly(ply: number): number {
    return thinkTimeDelayForPly(ply)
      ?? recordedDelayForPly(ply)
      ?? computeDelayForPly(ply)
      ?? FALLBACK_PLAY_MS;
  }

  function thinkTimeDelayForPly(ply: number): number | null {
    const event = moveEventAtPly(ply);
    if (!event || event.type !== 'move-played') return null;
    const ext = event as MovePlayedExt;
    if (typeof ext.thinkTimeMs !== 'number' || ext.thinkTimeMs < 0) return null;
    return Math.max(0, ext.thinkTimeMs);
  }

  function recordedDelayForPly(ply: number): number | null {
    const event = moveEventAtPly(ply);
    if (!event || event.type !== 'move-played') return null;
    const previousAt = ply > 1
      ? moveEventAtPly(ply - 1)?.at
      : replayStartAt();
    if (typeof previousAt !== 'number') return null;

    const elapsed = event.at - previousAt;
    if (!Number.isFinite(elapsed) || elapsed < MIN_RECORDED_DELTA_MS) return null;
    return clampPlay(elapsed * LEGACY_RECORDED_TIME_SCALE);
  }

  function computeDelayForPly(ply: number): number | null {
    const event = moveEventAtPly(ply);
    if (!event || event.type !== 'move-played') return null;
    const ext = event as MovePlayedExt;
    if (typeof ext.compute_ms === 'number' && ext.compute_ms >= 0) {
      return clampPlay(ext.compute_ms * COMPUTE_SCALE);
    }
    return null;
  }

  function replayStartAt(): number | null {
    let startedAt: number | null = null;
    for (const event of events) {
      if (event.type === 'move-played') break;
      if (
        event.type === 'clock-started'
        || event.type === 'draft-start-resolved'
        || event.type === 'bid-resolved'
        || event.type === 'room-created'
      ) {
        startedAt = event.at;
      }
    }
    return startedAt;
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
    if (tier1Color) boardOrientation = tier1Color;
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
    whitePane.nameEl.textContent = '';
    blackPane.nameEl.textContent = '';
    setClockPanelNames(clockPanel, meta);
    renderGameMetaPanel(gameMetaPanel, meta, activeSample);
    if (panesResolver) {
      const choice = panesResolver(activeSample, meta);
      layout.classList.remove('replay-layout-single-white', 'replay-layout-single-black', 'replay-layout-all');
      layout.classList.add(
        choice === 'white'
          ? 'replay-layout-single-white'
          : choice === 'black'
            ? 'replay-layout-single-black'
            : 'replay-layout-all',
      );
      if (metadataMode === 'compact') {
        // Move clock rows onto the now-visible pane so clocks + names stay
        // attached to the only board the viewer sees.
        relocateCompactClockRows(paneForChoice(choice));
      }
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
  abortController.signal.addEventListener('abort', () => {
    stopPlay();
    clearLoopTimer();
  }, { once: true });

  // If the initial sample fails to load (e.g. a DB game with no events endpoint),
  // fall through to the next available loop sample rather than crashing the mount.
  try {
    await loadGame(initialSampleId);
  } catch (err) {
    const fallback = loopSamples?.find((id) => id !== initialSampleId);
    if (fallback) {
      await loadGame(fallback);
    } else {
      throw err;
    }
  }

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

type GameMetaPanelHandle = {
  details: HTMLDivElement;
  el: HTMLElement;
  mode: 'full' | 'compact';
  hideGameIdPill: boolean;
};

function createGameMetaPanel(
  mode: 'full' | 'compact' = 'full',
  opts: { hideGameIdPill?: boolean } = {},
): GameMetaPanelHandle {
  const el = document.createElement('aside');
  el.className = `replay-game-meta-card replay-game-meta-card-${mode} side-panel meta-panel`;
  el.setAttribute('aria-label', 'Game metadata');
  const section = document.createElement('section');
  section.className = 'panel-section';
  const title = document.createElement('h2');
  title.textContent = mode === 'compact' ? 'Featured game' : 'Game';
  const details = document.createElement('div');
  details.className = 'game-info replay-game-meta-details';
  if (mode === 'compact') {
    section.append(details);
  } else {
    section.append(title, details);
  }
  el.append(section);
  return { details, el, mode, hideGameIdPill: opts.hideGameIdPill === true };
}

function renderGameMetaPanel(
  panel: GameMetaPanelHandle | null,
  meta: GameMeta | undefined,
  activeSample: string,
): void {
  if (!panel) return;
  if (!meta) {
    panel.el.hidden = true;
    panel.details.replaceChildren();
    return;
  }

  panel.el.hidden = false;
  const timeControl = timeControlLabelFromMeta(meta.timeControl);
  const items: Array<{ label: string; value: string }> = panel.mode === 'compact'
    ? []
    : [
        { label: 'Mode', value: meta.modeLabel ?? 'Replay' },
        { label: 'Result', value: resultLabel(meta.result) },
        { label: 'End', value: terminationLabel(meta.termination) },
        ...(timeControl ? [{ label: 'Time', value: timeControl }] : []),
        { label: 'Plies', value: String(meta.plyCount) },
        { label: 'Game', value: activeSample },
      ];

  panel.details.replaceChildren();
  for (const item of items) {
    panel.details.append(infoItem(item.label, item.value));
  }
  if (panel.mode === 'compact') {
    if (!panel.hideGameIdPill) {
      const gameId = document.createElement(meta.gameUrl ? 'a' : 'span');
      gameId.className = 'replay-game-id';
      gameId.textContent = activeSample;
      if (gameId instanceof HTMLAnchorElement && meta.gameUrl) gameId.href = meta.gameUrl;
      panel.details.append(gameId);
    }
  } else if (meta.gameUrl) {
    const link = document.createElement('a');
    link.className = 'replay-game-link';
    link.href = meta.gameUrl;
    link.textContent = 'View game';
    panel.details.append(link);
  }
}

function infoItem(labelText: string, valueText: string): HTMLDivElement {
  const item = document.createElement('div');
  const label = document.createElement('span');
  label.textContent = labelText;
  const value = document.createElement('strong');
  value.textContent = valueText;
  item.append(label, value);
  return item;
}

type AnalysisToolToggleBarHandle = {
  addToggle: (id: string, label: string, initialPressed: boolean, onToggle: (visible: boolean) => void) => void;
  el: HTMLElement;
  setPressed: (id: string, pressed: boolean) => void;
};

function createAnalysisToolToggleBar(): AnalysisToolToggleBarHandle {
  const el = document.createElement('div');
  el.className = 'analysis-tool-togglebar';
  const buttons = new Map<string, HTMLButtonElement>();

  function setPressed(id: string, pressed: boolean): void {
    const button = buttons.get(id);
    if (!button) return;
    button.setAttribute('aria-pressed', String(pressed));
    button.classList.toggle('active', pressed);
  }

  return {
    addToggle(id, label, initialPressed, onToggle) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => {
        const pressed = button.getAttribute('aria-pressed') === 'true';
        onToggle(!pressed);
      });
      buttons.set(id, button);
      el.append(button);
      setPressed(id, initialPressed);
    },
    el,
    setPressed,
  };
}

type ReplayMovesPanelHandle = {
  controls: {
    first: HTMLButtonElement;
    last: HTMLButtonElement;
    next: HTMLButtonElement;
    prev: HTMLButtonElement;
  };
  el: HTMLElement;
  meta: HTMLParagraphElement;
  moveList: HTMLOListElement;
};

type ReplayMoveEntry = {
  event: MovePlayedEvent;
  eventIndex: number;
  label: string;
  ply: number;
};

function createReplayMovesPanel(): ReplayMovesPanelHandle {
  const el = document.createElement('aside');
  el.className = 'side-panel moves-panel replay-moves-panel';
  el.setAttribute('aria-label', 'Replay and move list');

  const section = document.createElement('section');
  section.className = 'panel-section';
  const title = document.createElement('h2');
  title.textContent = 'Replay';

  const controls = document.createElement('div');
  controls.className = 'replay-controls';
  const first = controlButton('|<', 'First position');
  const prev = controlButton('<', 'Previous move');
  const next = controlButton('>', 'Next move');
  const last = controlButton('>|', 'Latest position');
  controls.append(first, prev, next, last);

  const meta = document.createElement('p');
  meta.className = 'replay-meta';
  meta.textContent = 'Replay';

  const moveList = document.createElement('ol');
  moveList.className = 'move-list';

  section.append(title, controls, meta, moveList);
  el.append(section);
  return {
    controls: { first, last, next, prev },
    el,
    meta,
    moveList,
  };
}

function renderReplayMovesPanel(
  panel: ReplayMovesPanelHandle,
  state: {
    activePly: number;
    eventIndex: number;
    events: GameEvent[];
    moveCount: number;
    onJump: (ply: number) => void;
  },
): void {
  panel.meta.textContent = state.events.length === 0
    ? 'No events'
    : `Replay · event ${state.eventIndex} of ${state.events.length}`;
  panel.controls.first.disabled = state.activePly === 0;
  panel.controls.prev.disabled = state.activePly === 0;
  panel.controls.next.disabled = state.activePly >= state.moveCount;
  panel.controls.last.disabled = state.activePly >= state.moveCount;
  panel.controls.first.onclick = () => state.onJump(0);
  panel.controls.prev.onclick = () => state.onJump(state.activePly - 1);
  panel.controls.next.onclick = () => state.onJump(state.activePly + 1);
  panel.controls.last.onclick = () => state.onJump(state.moveCount);
  renderReplayMoveList(panel.moveList, state.events, state.activePly, state.onJump);
}

function renderReplayMoveList(
  list: HTMLOListElement,
  events: GameEvent[],
  activePly: number,
  onJump: (ply: number) => void,
): void {
  const entries = replayMoveEntries(events);
  list.replaceChildren();
  if (entries.length === 0) return;
  const fullMoves = Math.ceil(entries.length / 2);
  const rows: HTMLLIElement[] = [];
  for (let moveNumber = 1; moveNumber <= fullMoves; moveNumber += 1) {
    const whitePly = moveNumber * 2 - 1;
    const blackPly = moveNumber * 2;
    const row = document.createElement('li');
    row.className = 'move-row';
    const label = document.createElement('span');
    label.className = 'move-number';
    label.textContent = String(moveNumber);
    row.append(label);
    row.append(replayMoveCell(entries[whitePly - 1], 'white', activePly, onJump));
    row.append(replayMoveCell(entries[blackPly - 1], 'black', activePly, onJump));
    rows.push(row);
  }
  list.append(...rows);
  scrollActiveMoveIntoView(list);
}

function scrollActiveMoveIntoView(list: HTMLOListElement): void {
  window.requestAnimationFrame(() => {
    const active = list.querySelector<HTMLButtonElement>('button.active');
    if (!active) return;
    const listRect = list.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const centeredDelta = activeRect.top - listRect.top - (list.clientHeight - activeRect.height) / 2;
    list.scrollTo({ top: Math.max(0, list.scrollTop + centeredDelta), behavior: 'auto' });
  });
}

function replayMoveCell(
  entry: ReplayMoveEntry | undefined,
  color: Color,
  activePly: number,
  onJump: (ply: number) => void,
): HTMLElement {
  if (!entry) {
    const empty = document.createElement('span');
    empty.className = `${color}-ply move-empty`;
    return empty;
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.className = [
    color === 'white' ? 'white-ply' : 'black-ply',
    activePly === entry.ply ? 'active' : '',
  ].filter(Boolean).join(' ');
  button.textContent = entry.label;
  button.title = `Event ${entry.eventIndex}`;
  button.addEventListener('click', () => onJump(entry.ply));
  return button;
}

function replayMoveEntries(events: GameEvent[]): ReplayMoveEntry[] {
  const entries: ReplayMoveEntry[] = [];
  const labelsByEventIndex = buildAlgebraicMoveLabels(events, events[0]?.roomId ?? 'replay');
  for (const [index, event] of events.entries()) {
    if (event.type === 'move-played') {
      entries.push({
        event,
        eventIndex: index + 1,
        label: labelsByEventIndex.get(index + 1) ?? coordinateMoveLabel(event.move),
        ply: entries.length + 1,
      });
    }
  }
  return entries;
}

function coordinateMoveLabel(move: Move): string {
  const promotion = move.promotion ? `=${pieceLetter(move.promotion)}` : '';
  return `${move.from}${move.to}${promotion}`;
}

function pieceLetter(role: Exclude<PieceRole, 'king' | 'pawn'>): string {
  const letters: Record<Exclude<PieceRole, 'king' | 'pawn'>, string> = {
    bishop: 'B',
    knight: 'N',
    queen: 'Q',
    rook: 'R',
  };
  return letters[role];
}

type EnginePanelDockHandle = {
  el: HTMLElement;
};

type EnginePanelId = 'belief' | 'trace';
type EnginePanelSpec = {
  defaultOpen: boolean;
  description: string;
  id: EnginePanelId;
  label: string;
  meta: string[];
  title: string;
};

function createEnginePanelDock(panels: EngineReviewPanels | undefined): EnginePanelDockHandle | null {
  const panelSpecs = enginePanelSpecs(panels);
  if (panelSpecs.length === 0) return null;

  const el = document.createElement('section');
  el.className = 'engine-review-panel';
  const tabs = document.createElement('div');
  tabs.className = 'engine-review-tabs';
  const body = document.createElement('div');
  body.className = 'engine-review-body';

  const activeFromUrl = panelIdFromSearch(new URLSearchParams(window.location.search).get('panel'));
  let active: EnginePanelId | null = panelSpecs.find((spec) => spec.id === activeFromUrl)?.id
    ?? panelSpecs.find((spec) => spec.defaultOpen)?.id
    ?? null;

  const buttons = new Map<EnginePanelId, HTMLButtonElement>();
  for (const spec of panelSpecs) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = spec.label;
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', () => {
      active = active === spec.id ? null : spec.id;
      render();
    });
    buttons.set(spec.id, button);
    tabs.append(button);
  }

  function render(): void {
    body.replaceChildren();
    for (const [id, button] of buttons) {
      const isActive = active === id;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-expanded', String(isActive));
    }
    if (!active) {
      const empty = document.createElement('p');
      empty.className = 'engine-review-empty';
      empty.textContent = 'Engine review panels are available for this game.';
      body.append(empty);
      return;
    }
    const spec = panelSpecs.find((candidate) => candidate.id === active);
    if (!spec) return;
    const title = document.createElement('h2');
    title.textContent = spec.title;
    const copy = document.createElement('p');
    copy.textContent = spec.description;
    const meta = document.createElement('div');
    meta.className = 'engine-review-meta';
    for (const item of spec.meta) {
      const chip = document.createElement('span');
      chip.textContent = item;
      meta.append(chip);
    }
    body.append(title, copy, meta);
  }

  el.append(tabs, body);
  render();
  return { el };
}

function enginePanelSpecs(panels: EngineReviewPanels | undefined): EnginePanelSpec[] {
  const specs: EnginePanelSpec[] = [];
  if (panels?.belief?.available) {
    specs.push({
      defaultOpen: panels.belief.defaultOpen === true,
      description: 'Belief artifacts exist for this engine game. The next viewer slice will load the stored belief snapshots into the inspector.',
      id: 'belief',
      label: 'Belief',
      meta: [
        seatsLabel(panels.belief.seats),
        snapshotKindsLabel(panels.belief.snapshotKinds),
      ].filter(Boolean),
      title: 'Belief Inspector',
    });
  }
  if (panels?.trace?.available) {
    specs.push({
      defaultOpen: panels.trace.defaultOpen === true,
      description: 'Engine trace artifacts exist for this game. The next viewer slice will load decision rows and queue reasons here.',
      id: 'trace',
      label: 'Trace',
      meta: [seatsLabel(panels.trace.seats)].filter(Boolean),
      title: 'Engine Trace',
    });
  }
  return specs;
}

function panelIdFromSearch(value: string | null): EnginePanelId | null {
  return value === 'belief' || value === 'trace' ? value : null;
}

function seatsLabel(seats: Color[] | undefined): string {
  if (!seats || seats.length === 0) return '';
  return `Seats: ${seats.map(capitalizeColor).join(', ')}`;
}

function snapshotKindsLabel(kinds: string[] | undefined): string {
  if (!kinds || kinds.length === 0) return '';
  return `Snapshots: ${kinds.join(', ')}`;
}

function capitalizeColor(color: Color): string {
  return color === 'white' ? 'White' : 'Black';
}

type ClockPanelHandle = {
  blackLabel: HTMLSpanElement;
  blackRow: HTMLDivElement;
  blackTime: HTMLSpanElement;
  el: HTMLDivElement;
  label: HTMLSpanElement;
  whiteLabel: HTMLSpanElement;
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
  el.append(label);

  return {
    blackLabel: blackRow.label,
    blackRow: blackRow.row,
    blackTime: blackRow.time,
    el,
    label,
    whiteLabel: whiteRow.label,
    whiteRow: whiteRow.row,
    whiteTime: whiteRow.time,
  };
}

function createClockRow(colorLabel: string): { label: HTMLSpanElement; row: HTMLDivElement; time: HTMLSpanElement } {
  const row = document.createElement('div');
  row.className = 'replay-clock-row';
  row.hidden = true;
  const label = document.createElement('span');
  label.className = 'replay-clock-side';
  label.textContent = colorLabel;
  const time = document.createElement('span');
  time.className = 'replay-clock-time';
  row.append(label, time);
  return { label, row, time };
}

function createCompactClockSpacer(): HTMLDivElement {
  const spacer = document.createElement('div');
  spacer.className = 'replay-clock-spacer';
  spacer.setAttribute('aria-hidden', 'true');
  return spacer;
}

function setClockPanelNames(panel: ClockPanelHandle, meta: GameMeta | undefined): void {
  panel.whiteLabel.textContent = meta?.whiteName ?? 'White';
  panel.blackLabel.textContent = meta?.blackName ?? 'Black';
}

function renderClockPanel(
  panel: ClockPanelHandle,
  clock: ClockState | undefined,
  state: GameState,
  meta: GameMeta | undefined,
  displayAtOverride?: number,
): void {
  const timeControl = clock ? timeControlLabelFromClock(clock) : timeControlLabelFromMeta(meta?.timeControl);
  const hasPlayerLabels = Boolean(meta?.whiteName || meta?.blackName);
  if (!clock && !timeControl && !hasPlayerLabels) {
    panel.el.hidden = true;
    panel.whiteRow.hidden = true;
    panel.blackRow.hidden = true;
    return;
  }

  panel.el.hidden = !timeControl;
  panel.whiteRow.hidden = false;
  panel.blackRow.hidden = false;
  panel.label.textContent = timeControl ? `Time ${timeControl}` : 'Clock';
  panel.label.hidden = true;

  if (!clock) {
    panel.whiteTime.textContent = timeControl === 'Untimed' ? 'Untimed' : '—';
    panel.blackTime.textContent = timeControl === 'Untimed' ? 'Untimed' : '—';
    panel.whiteRow.classList.remove('active');
    panel.blackRow.classList.remove('active');
    return;
  }

  const displayAt = displayAtOverride ?? clock.runningSince ?? 0;
  panel.whiteTime.textContent = formatClock(clockRemainingMs(clock, 'white', displayAt), true);
  panel.blackTime.textContent = formatClock(clockRemainingMs(clock, 'black', displayAt), true);
  panel.whiteRow.classList.toggle('active', state.status.type === 'playing' && clock.activeColor === 'white');
  panel.blackRow.classList.toggle('active', state.status.type === 'playing' && clock.activeColor === 'black');
}

function replayClockDisplayAt(events: GameEvent[], state: GameState): number | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const at = events[index]?.at;
    if (typeof at === 'number' && Number.isFinite(at)) return at;
  }
  return state.clock?.runningSince ?? null;
}

function timeControlLabelFromClock(clock: ClockState): string {
  const base = formatClock(clock.initialMs);
  const incrementSeconds = Math.round(clock.incrementMs / 1000);
  return incrementSeconds > 0 ? `${base}+${incrementSeconds}` : base;
}

function timeControlLabelFromMeta(raw: Record<string, unknown> | null | undefined): string | null {
  if (!raw) return null;
  if (raw.kind === 'none') return 'Untimed';

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

function resultLabel(result: string): string {
  if (result === 'white-wins') return 'White wins';
  if (result === 'black-wins') return 'Black wins';
  return 'Draw';
}

function terminationLabel(termination: string): string {
  return termination
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function numericValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function createPane(label: string, kind: 'white' | 'truth' | 'black'): {
  el: HTMLDivElement;
  boardEl: HTMLDivElement;
  clockSlot: HTMLDivElement;
  labelEl: HTMLDivElement;
  nameEl: HTMLDivElement;
  statusEl: HTMLDivElement;
} {
  const el = document.createElement('div');
  el.className = `replay-pane replay-pane-${kind}`;
  const labelEl = document.createElement('div');
  labelEl.className = 'replay-pane-label';
  labelEl.textContent = label;
  const nameEl = document.createElement('div');
  nameEl.className = 'replay-pane-name';
  const boardEl = document.createElement('div');
  boardEl.className = 'board replay-board';
  const clockSlot = document.createElement('div');
  clockSlot.className = 'replay-pane-clock-slot';
  const statusEl = document.createElement('div');
  statusEl.className = 'replay-pane-status';
  el.append(labelEl, nameEl, boardEl, clockSlot, statusEl);
  return { el, boardEl, clockSlot, labelEl, nameEl, statusEl };
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
    animation: { enabled: false, duration: 0 },
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
  if (view.variant !== 'fog-of-war') return classes;
  const visible = new Set(view.visibleSquares);
  for (const square of allSquares) {
    if (!visible.has(square)) classes.set(square as cg.Key, 'fog-hidden');
  }
  return classes;
}

// Build a "playing"-status copy of a finished state so getPlayerView computes
// visibility as if the game were still in progress. The synthetic turn is the
// side that did NOT play the last move (i.e., whoever would have been to move
// next), so visibleLastMoveForPlayer behaves the same as it did mid-game.
function syntheticPlayingState(state: GameState): GameState {
  const lastTo = state.lastMove?.to;
  const moverColor: Color | null = lastTo ? (state.board[lastTo]?.color ?? null) : null;
  const turn: Color = moverColor === 'white' ? 'black' : moverColor === 'black' ? 'white' : 'white';
  return { ...state, status: { type: 'playing', turn } };
}

function revealKingCaptureForLoser(view: PlayerView, lastMove: Move, attacker: Piece): PlayerView {
  const visible = new Set(view.visibleSquares);
  const board = { ...view.board };
  visible.add(lastMove.to);
  visible.add(lastMove.from);
  board[lastMove.to] = attacker;
  delete board[lastMove.from];
  return {
    ...view,
    board,
    visibleSquares: [...visible].sort() as Square[],
    lastMove,
  };
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
