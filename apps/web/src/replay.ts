import { boardFen, pieceFen } from '@mistboard/board-render/interactive';
import {
  type Color,
  darkChessVariant,
  type GameEvent,
  type GameState,
  type PieceRole,
  replayGameEvents,
} from '@mistboard/game';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';
import './replay-analysis.css';
import {
  type Annotation,
  type AnnotationContext,
  buildAnnotationFromForm,
  loadAnnotations,
  saveAnnotation,
  updateAnnotation,
} from './annotations.js';
import { type BeliefConfig, type BeliefPanelHandle, createBeliefPanel } from './belief-panel.js';
import { computeCaptures } from './captures.js';
import {
  type AnnotationConfig,
  type AnnotationPanelHandle,
  type AnnotFormValues,
  createAnnotationPanel,
  renderAnnotationPanel,
} from './replay-annotations.js';
import {
  createBoard,
  createPane,
  type ReplayPaneHandle,
  renderPaneCaptures,
  renderTruthCaptures,
  revealKingCaptureForLoser,
  setBoardFromState,
  setBoardFromView,
  squareFromCgBoardClick,
} from './replay-board.js';
import {
  createClockPanel,
  createCompactClockSpacer,
  type ReplayThinkingBudgetState,
  renderClockPanel,
  replayClockDisplayAt,
  setClockPanelNames,
} from './replay-clocks.js';
import {
  createAnalysisToolToggleBar,
  createEnginePanelDock,
  type EngineReviewPanels,
} from './replay-engine-panels.js';
import {
  createGameHeaderStrip,
  createGameMetaPanel,
  createShareButton,
  type GameMeta,
  playerViewLabel,
  renderGameHeader,
  renderGameMetaPanel,
  thinkingBudgetMsFromMeta,
} from './replay-meta.js';
import { createReplayMovesPanel, renderReplayMovesPanel } from './replay-moves-panel.js';
import {
  compactReplayClockSidesForOrientation,
  DEFAULT_BETWEEN_GAME_DELAY_MS,
  DEFAULT_WALL_CLOCK_TICK_MS,
  FALLBACK_PLAY_MS,
  positiveMs,
  resolveWallClockReplayPosition,
  resolveWallClockThinkingElapsedMs,
  type WallClockReplayLoop,
  type WallClockReplayPosition,
} from './replay-wall-clock.js';

const COMPUTE_SCALE = 50;
const LEGACY_RECORDED_TIME_SCALE = 0.12;
const MIN_RECORDED_DELTA_MS = 150;
const MIN_PLAY_MS = 700;
const MAX_PLAY_MS = 2500;
const MIN_THINKING_BUDGET_PLAY_MS = 700;

const replayAbortControllers = new WeakMap<HTMLElement, AbortController>();

type MovePlayedEvent = Extract<GameEvent, { type: 'move-played' }>;
type MovePlayedExt = MovePlayedEvent & { compute_ms?: number; thinkTimeMs?: number };

export type { AnnotationConfig } from './replay-annotations.js';
export type { EngineReviewPanels } from './replay-engine-panels.js';
export type { GameMeta } from './replay-meta.js';
export type {
  WallClockReplayLoop,
  WallClockReplayLoopSample,
  WallClockReplayPosition,
  WallClockReplayTiming,
} from './replay-wall-clock.js';
export {
  compactReplayClockSidesForOrientation,
  resolveWallClockReplayPosition,
  resolveWallClockThinkingElapsedMs,
} from './replay-wall-clock.js';

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
  /** Optional per-game board orientation. Applied whenever a new sample loads. */
  orientationForId?: (sampleId: string, meta: GameMeta | undefined) => Color | null | undefined;
  /** @deprecated Use orientation. Kept for older callers. */
  blackOrientation?: Color;
  /** When set, after each game finishes the next sample loads automatically. */
  loopSamples?: string[];
  /** When set, replay position is derived from wall-clock time across the sample corpus. */
  wallClockLoop?: WallClockReplayLoop;
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
   * 'full' (default): left-rail meta card + clocks docked under panes + floating time pill.
   * 'compact': landing-hero single-pane mode (clocks above/below the visible pane).
   * 'header': horizontal header strip above the boards (title · result · end · time · plies)
   *           with player+clock cells on each end. Used by the review page; lets the boards
   *           own the full content width with only the moves rail to their right.
   */
  metadataMode?: 'full' | 'compact' | 'header';
  /**
   * Which panes to render. 'all' (default) shows white | truth | black.
   * Provide a resolver to pick a single pane per sample — used by the
   * landing hero, which shows one player's POV instead of the review triptych.
   * Returning 'all' from the resolver shows all three.
   */
  panes?:
    | 'all'
    | { resolver: (sampleId: string, meta: GameMeta | undefined) => 'white' | 'black' | 'all' };
  /** When true, suppress the compact-mode game id pill (room slug). */
  hideGameIdPill?: boolean;
  /** When false, do not render captured-piece strips under replay boards. */
  showCaptures?: boolean;
  /** Split captured pieces above and below POV boards instead of one strip below. */
  captureLayout?: 'single' | 'split';
  /** Compact-mode clock placement. Defaults to the historical board-edge rows. */
  compactClockLayout?: 'board-edges' | 'stacked';
  /** End-result placement. Defaults to pane footer labels. */
  endStatusMode?: 'pane' | 'clock';
  /**
   * When set, enables the annotation tooling. Press `a` at any ply to open
   * the modal pre-filled with the move just played. Annotations persist via
   * POST /api/annotations (handled by the Vite dev plugin in development).
   */
  annotation?: AnnotationConfig;
  belief?: BeliefConfig;
  enginePanels?: EngineReviewPanels;
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
  const orientationForId = options.orientationForId;
  const wallClockLoop = options.wallClockLoop;
  const wallClockInitial = currentWallClockPosition();
  const initialReplaySampleId = wallClockInitial?.sampleId ?? initialSampleId;
  let wallClockPosition = wallClockInitial;
  const loopSamples = wallClockLoop ? undefined : options.loopSamples;
  const betweenGameDelayMs = options.betweenGameDelayMs ?? DEFAULT_BETWEEN_GAME_DELAY_MS;
  const autoplay = !wallClockLoop && (options.autoplay === true || loopSamples !== undefined);
  const urlForId = options.urlForId ?? defaultUrlForId;
  const loaderForId = options.loaderForId;
  const metadataByRoomId = options.metadataByRoomId;
  const metadataMode = options.metadataMode ?? 'full';
  const panesResolver = typeof options.panes === 'object' ? options.panes.resolver : null;
  const hideGameIdPill = options.hideGameIdPill === true;
  const showCaptures = options.showCaptures !== false;
  const captureLayout = options.captureLayout ?? 'single';
  const splitCaptures = showCaptures && captureLayout === 'split';
  const compactClockLayout = options.compactClockLayout ?? 'board-edges';
  const endStatusMode = options.endStatusMode ?? 'pane';
  const onPlyChange = options.onPlyChange;
  const initialMeta = metadataByRoomId?.[initialReplaySampleId];
  const initialOrientation = orientationForId?.(initialReplaySampleId, initialMeta);
  if (initialOrientation) boardOrientation = initialOrientation;

  function currentWallClockPosition(): WallClockReplayPosition | null {
    if (!wallClockLoop) return null;
    return resolveWallClockReplayPosition(
      wallClockLoop.samples,
      wallClockLoop.now ? wallClockLoop.now() : Date.now(),
      wallClockLoop,
    );
  }

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
  root.classList.toggle('replay-meta-header', metadataMode === 'header');

  const gameHeader = metadataMode === 'header' ? createGameHeaderStrip() : null;
  if (gameHeader) root.append(gameHeader.el);

  const layout = document.createElement('div');
  layout.className = 'replay-layout';

  // Base labels are recomputed from meta in applyMetadata() so we can fold
  // the player name into the board label ("Guest's view"). Default fallbacks
  // are used until meta arrives.
  let whiteBaseLabel = "White's view";
  let blackBaseLabel = "Black's view";

  const whitePane = createPane(whiteBaseLabel, 'white', showCaptures, captureLayout);
  const truthPane = createPane('Truth', 'truth', showCaptures, captureLayout);
  const blackPane = createPane(blackBaseLabel, 'black', showCaptures, captureLayout);
  layout.append(whitePane.el, truthPane.el, blackPane.el);
  // Apply the pane choice synchronously so the triptych doesn't flash before
  // loadGame() finishes its async fetch and calls applyMetadata().
  if (panesResolver) {
    const initialMeta = metadataByRoomId?.[initialReplaySampleId];
    const initialChoice = panesResolver(initialReplaySampleId, initialMeta);
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

  // 'header' mode renders metadata as a horizontal strip above the boards instead
  // of as a side-rail panel, so the boards can use the full content width.
  const gameMetaPanel =
    metadataByRoomId && metadataMode !== 'header'
      ? createGameMetaPanel(metadataMode === 'compact' ? 'compact' : 'full', { hideGameIdPill })
      : null;
  if (gameMetaPanel) root.append(gameMetaPanel.el);
  if (movesPanel) root.append(movesPanel.el);
  const clockPanel = createClockPanel();
  // In compact + single-POV mode (landing hero) the truth pane is CSS-hidden,
  // so clocks hosted on truth would also be hidden. Track the current host
  // pane so we can move the clock rows when the visible pane changes across
  // looped games.
  let compactClockHost: { boardEl: HTMLDivElement; clockSlot: HTMLDivElement } | null = null;
  let compactClockTopColor: Color | null = null;
  const compactClockTopName = document.createElement('div');
  compactClockTopName.className = 'replay-clock-stack-name replay-clock-stack-name-top';
  const compactClockBottomName = document.createElement('div');
  compactClockBottomName.className = 'replay-clock-stack-name replay-clock-stack-name-bottom';
  function relocateCompactClockRows(host: {
    boardEl: HTMLDivElement;
    clockSlot: HTMLDivElement;
  }): void {
    const clockSides = compactReplayClockSidesForOrientation(boardOrientation);
    if (compactClockHost === host && compactClockTopColor === clockSides.top) return;
    clockPanel.blackRow.remove();
    clockPanel.whiteRow.remove();
    const topRow = clockSides.top === 'white' ? clockPanel.whiteRow : clockPanel.blackRow;
    const bottomRow = clockSides.bottom === 'white' ? clockPanel.whiteRow : clockPanel.blackRow;
    topRow.classList.add('replay-clock-row-top');
    topRow.classList.remove('replay-clock-row-bottom');
    bottomRow.classList.add('replay-clock-row-bottom');
    bottomRow.classList.remove('replay-clock-row-top');
    if (compactClockLayout === 'stacked') {
      compactClockTopName.remove();
      compactClockBottomName.remove();
      updateCompactClockNames(clockSides);
      host.clockSlot.append(compactClockTopName, topRow, bottomRow, compactClockBottomName);
    } else {
      host.boardEl.before(topRow);
      host.clockSlot.append(bottomRow);
    }
    compactClockHost = host;
    compactClockTopColor = clockSides.top;
  }
  function updateCompactClockNames(
    clockSides = compactReplayClockSidesForOrientation(boardOrientation),
    resultByColor?: Partial<Record<Color, 'draw' | 'loss' | 'win'>>,
  ): void {
    renderCompactClockName(compactClockTopName, clockSides.top, resultByColor?.[clockSides.top]);
    renderCompactClockName(
      compactClockBottomName,
      clockSides.bottom,
      resultByColor?.[clockSides.bottom],
    );
  }
  function renderCompactClockName(
    target: HTMLDivElement,
    color: Color,
    result: 'draw' | 'loss' | 'win' | undefined,
  ): void {
    target.classList.toggle('result-win', result === 'win');
    target.classList.toggle('result-loss', result === 'loss');
    target.classList.toggle('result-draw', result === 'draw');
    const baseName =
      color === 'white' ? clockPanel.whiteLabel.textContent : clockPanel.blackLabel.textContent;
    if (!result) {
      target.textContent = baseName;
      return;
    }
    const resultChip = document.createElement('span');
    resultChip.className = 'replay-clock-stack-result';
    resultChip.textContent = result === 'win' ? 'won' : result === 'loss' ? 'lost' : 'draw';
    target.replaceChildren(document.createTextNode(baseName ?? ''), resultChip);
  }
  function paneForChoice(choice: 'white' | 'black' | 'all'): {
    boardEl: HTMLDivElement;
    clockSlot: HTMLDivElement;
  } {
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

    if (panesResolver) {
      // Single-POV layout: the only visible pane hosts the clocks (and
      // player names live inside the clock rows via setClockPanelNames).
      // The hidden panes don't need spacers since they contribute nothing
      // to layout.
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
  } else if (metadataMode === 'header' && gameHeader) {
    // Header strip hosts the clocks in the player cells; the floating
    // "Time" pill is suppressed entirely.
    gameHeader.whiteCell.append(clockPanel.whiteRow);
    gameHeader.blackCell.append(clockPanel.blackRow);
    if (showControls) {
      gameHeader.actions.append(createShareButton());
      flipBtn.classList.add('replay-game-header-action', 'replay-game-header-action-secondary');
      flipBtn.innerHTML = `${ICON_FLIP}<span class="replay-game-header-action-label">Flip</span>`;
      flipBtn.title = 'Flip all boards (f)';
      flipBtn.setAttribute('aria-label', 'Flip all boards');
      gameHeader.actions.append(flipBtn);
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

  let annotPanel: AnnotationPanelHandle | null = null;
  if (annotation) {
    annotPanel = createAnnotationPanel({
      onSave: handleAnnotSave,
    });
    toolsRow?.append(annotPanel.el);
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

  let activeSample = initialReplaySampleId;
  let events: GameEvent[] = [];
  let moveCount = 0;
  let currentPly = 0;
  let shouldApplyInitialPly = !wallClockLoop && Number.isFinite(options.initialPly);
  let playTimer: number | null = null;
  let loopTimer: number | null = null;
  let wallClockTimer: number | null = null;
  let wallClockLoadPromise: Promise<void> | null = null;
  let clockTickTimer: number | null = null;
  let finishedAck = false;
  let annotationsForGame: Annotation[] = [];
  let lastNotifiedPly: number | null = null;
  let renderedClockState: GameState | null = null;
  let renderedClockEvents: GameEvent[] | null = null;

  function render(): void {
    root.dataset.sampleId = activeSample;
    root.dataset.ply = String(currentPly);
    const sliced = sliceToPly(events, currentPly);
    const projection = replayGameEvents(sliced);
    const state = projection.state;
    const captures = showCaptures ? computeCaptures(sliced) : null;
    const finished = state.status.type === 'finished';
    renderClockState(state, sliced);
    clearClockEndGameState();

    setBoardFromState(truthCg, state);

    if (finished && reveal) {
      // Postgame reveal: collapse the POV panes to truth so the viewer sees
      // the full board they couldn't see during play.
      setBoardFromState(whiteCg, state);
      setBoardFromState(blackCg, state);
    } else {
      let whiteView = darkChessVariant.getPlayerView(state, 'white');
      let blackView = darkChessVariant.getPlayerView(state, 'black');
      if (
        finished &&
        state.status.type === 'finished' &&
        state.status.reason === 'king-captured' &&
        state.lastMove
      ) {
        // The loser saw their king die — the attacker becomes visible to them
        // on the king-capture square at that moment.
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
      setBoardFromView(whiteCg, whiteView, boardOrientation);
      setBoardFromView(blackCg, blackView, boardOrientation);
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
    if (captures) {
      if (splitCaptures) {
        renderSplitPaneCaptures(whitePane, captures, 'white');
        renderSplitPaneCaptures(blackPane, captures, 'black');
        renderPaneCaptures(truthPane.topCapturesEl, [], 'white');
      } else {
        renderPaneCaptures(whitePane.capturesEl, captures.white, 'black');
        renderPaneCaptures(blackPane.capturesEl, captures.black, 'white');
      }
      renderTruthCaptures(truthPane.capturesEl, captures);
    }

    if (showControls) {
      const annotMark = annotation && annotationsAtPly(currentPly).length > 0 ? ' ★' : '';
      plyLabel.textContent = `Ply ${currentPly} / ${moveCount}${gameOverSuffix(state)}${annotMark}`;
      firstBtn.disabled = currentPly === 0;
      prevBtn.disabled = currentPly === 0;
      nextBtn.disabled = currentPly >= moveCount;
      lastBtn.disabled = currentPly >= moveCount;
      movesPanel &&
        renderReplayMovesPanel(movesPanel, {
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
    if (annotPanel) annotPanel.el.hidden = !annotationPanelVisible;
    toolsToggleBar?.setPressed('belief', beliefPanelVisible);
    toolsToggleBar?.setPressed('annotation', annotationPanelVisible);
    const hasVisibleAnalysis = Boolean(
      (beliefPanel && beliefPanelVisible) || (annotPanel && annotationPanelVisible),
    );
    root.classList.toggle('analysis-tools-open', hasVisibleAnalysis);
    root.classList.toggle('analysis-tools-collapsed', !hasVisibleAnalysis);
    root.classList.toggle('analysis-belief-open', Boolean(beliefPanel && beliefPanelVisible));
    root.classList.toggle(
      'analysis-annotation-open',
      Boolean(annotPanel && annotationPanelVisible),
    );
    if (toolsRow) {
      toolsRow.classList.toggle('analysis-tools-collapsed', !hasVisibleAnalysis);
      toolsRow.classList.toggle('analysis-belief-open', Boolean(beliefPanel && beliefPanelVisible));
      toolsRow.classList.toggle(
        'analysis-annotation-open',
        Boolean(annotPanel && annotationPanelVisible),
      );
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
    if (!annotation) return;
    renderAnnotationPanel(annotPanel, {
      annotations: annotationsForGame,
      context: currentAnnotContext(),
      currentPly,
      onDeleted(a) {
        annotationsForGame = annotationsForGame.filter((x) => x.id !== a.id);
        render();
        annotation.onSaved?.();
      },
      onEdit(a, form) {
        stopPlay();
        clearLoopTimer();
        finishedAck = false;
        setCurrentPly(a.ply);
        // Enter edit mode BEFORE render() so the form's edit state is set
        // when renderAnnotationPanel's setContext call runs.
        form.loadForEdit(a);
        render();
      },
      onJump(ply) {
        stopPlay();
        clearLoopTimer();
        finishedAck = false;
        setCurrentPly(ply);
        render();
      },
    });
  }

  async function handleAnnotSave(
    formValues: AnnotFormValues,
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
      annotationsForGame = annotationsForGame.map((a) => (a.id === editing.id ? updated : a));
    } else {
      const ctx = currentAnnotContext();
      if (!ctx) return;
      const annot = buildAnnotationFromForm(ctx, formValues);
      await saveAnnotation(annot);
      annotationsForGame = [...annotationsForGame, annot];
    }
    annotPanel?.form.clearAfterSave();
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
        a.game_index === idx &&
        a.game_path === activeSample &&
        a.manifest_url === annotation.manifestUrl,
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
      loadGame(next).catch((err) =>
        console.warn('[replay loop] failed to load game, skipping:', next, err),
      );
    }, betweenGameDelayMs);
  }

  function clearLoopTimer(): void {
    if (loopTimer !== null) {
      window.clearTimeout(loopTimer);
      loopTimer = null;
    }
  }

  function startWallClockLoop(): void {
    if (!wallClockLoop || wallClockTimer !== null) return;
    syncWallClockLoop();
    wallClockTimer = window.setInterval(
      syncWallClockLoop,
      positiveMs(wallClockLoop.tickMs, DEFAULT_WALL_CLOCK_TICK_MS),
    );
  }

  function clearWallClockTimer(): void {
    if (wallClockTimer !== null) {
      window.clearInterval(wallClockTimer);
      wallClockTimer = null;
    }
  }

  function syncWallClockLoop(): void {
    const target = currentWallClockPosition();
    if (!target) return;
    wallClockPosition = target;

    if (target.sampleId !== activeSample) {
      if (wallClockLoadPromise) return;
      let loaded = false;
      wallClockLoadPromise = loadGame(target.sampleId, {
        initialPly: target.ply,
        startAutoplay: false,
      })
        .then(() => {
          loaded = true;
        })
        .catch((err) => console.warn('[replay wall-clock loop] failed to load game:', err))
        .finally(() => {
          wallClockLoadPromise = null;
          if (loaded) syncWallClockLoop();
        });
      return;
    }

    if (target.ply === currentPly) {
      renderWallClockClockOnly();
      return;
    }
    setCurrentPly(target.ply);
    render();
  }

  function renderClockState(state: GameState, slicedEvents: GameEvent[]): void {
    renderedClockState = state;
    renderedClockEvents = slicedEvents;
    const displayAt = replayClockDisplayAt(slicedEvents, state);
    renderClockPanel(
      clockPanel,
      state.clock,
      state,
      currentMeta(),
      displayAt ?? undefined,
      wallClockThinkingState(state),
    );
  }

  function renderWallClockClockOnly(): void {
    if (!wallClockLoop) return;
    if (!renderedClockState || !renderedClockEvents) return;
    renderClockState(renderedClockState, renderedClockEvents);
    clearClockEndGameState();
    if (renderedClockState.status.type === 'finished') applyEndGameState(renderedClockState);
  }

  function wallClockThinkingState(state: GameState): ReplayThinkingBudgetState | null {
    if (!wallClockLoop || !wallClockPosition || wallClockPosition.sampleId !== activeSample) {
      return null;
    }
    if (state.clock || state.status.type !== 'playing') return null;
    const budgetMs = thinkingBudgetMsFromMeta(currentMeta()?.timeControl);
    if (budgetMs === null) return null;

    const plyMs = positiveMs(wallClockLoop.plyMs, FALLBACK_PLAY_MS);
    const nextPly = currentPly + 1;
    const thinkMs = thinkingDurationForPly(nextPly) ?? plyMs;
    const elapsedMs = resolveWallClockThinkingElapsedMs(wallClockPosition.plyElapsedMs, thinkMs);
    return {
      activeColor: state.status.turn,
      budgetMs,
      elapsedMs,
    };
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
    const meta = currentMeta();
    if (state.status.type !== 'playing') return;
    const activeColor = state.status.turn;
    const clock = state.clock;
    const nextEvent = moveEventAtPly(nextPly);
    if (!nextEvent || nextEvent.type !== 'move-played') return;
    const startWall = performance.now();
    const tickElapsed = (): number => {
      const elapsedWall = performance.now() - startWall;
      return Math.min(elapsedWall / delay, 1);
    };

    if (clock && clock.runningSince !== null) {
      const startDisplay = clock.runningSince;
      const endDisplay =
        typeof nextEvent.at === 'number' && Number.isFinite(nextEvent.at)
          ? nextEvent.at
          : startDisplay + delay;
      const gap = Math.max(0, endDisplay - startDisplay);
      const tick = (): void => {
        const fraction = tickElapsed();
        const displayAt = startDisplay + gap * fraction;
        renderClockPanel(clockPanel, clock, state, meta, displayAt);
      };
      tick();
      clockTickTimer = window.setInterval(tick, 100);
      return;
    }

    const budgetMs = thinkingBudgetMsFromMeta(meta?.timeControl);
    const thinkMs = thinkingDurationForPly(nextPly) ?? delay;
    if (budgetMs === null || thinkMs <= 0) return;
    const tick = (): void => {
      const fraction = tickElapsed();
      const elapsedMs = Math.min(thinkMs * fraction, thinkMs);
      renderClockPanel(clockPanel, undefined, state, meta, undefined, {
        activeColor,
        budgetMs,
        elapsedMs,
      });
    };
    tick();
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
    return (
      thinkTimeDelayForPly(ply) ??
      recordedDelayForPly(ply) ??
      computeDelayForPly(ply) ??
      FALLBACK_PLAY_MS
    );
  }

  function thinkTimeDelayForPly(ply: number): number | null {
    const event = moveEventAtPly(ply);
    if (!event || event.type !== 'move-played') return null;
    const ext = event as MovePlayedExt;
    if (typeof ext.thinkTimeMs !== 'number' || ext.thinkTimeMs < 0) return null;
    const thinkMs = Math.max(0, ext.thinkTimeMs);
    if (thinkingBudgetMsFromMeta(currentMeta()?.timeControl) !== null) {
      return Math.max(MIN_THINKING_BUDGET_PLAY_MS, thinkMs);
    }
    return thinkMs;
  }

  function thinkingDurationForPly(ply: number): number | null {
    const event = moveEventAtPly(ply);
    if (!event || event.type !== 'move-played') return null;
    const ext = event as MovePlayedExt;
    if (typeof ext.thinkTimeMs === 'number' && ext.thinkTimeMs >= 0) {
      return ext.thinkTimeMs;
    }
    if (typeof ext.compute_ms === 'number' && ext.compute_ms >= 0) {
      return ext.compute_ms;
    }
    return null;
  }

  function recordedDelayForPly(ply: number): number | null {
    const event = moveEventAtPly(ply);
    if (!event || event.type !== 'move-played') return null;
    const previousAt = ply > 1 ? moveEventAtPly(ply - 1)?.at : replayStartAt();
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
        event.type === 'clock-started' ||
        event.type === 'draft-start-resolved' ||
        event.type === 'room-created'
      ) {
        startedAt = event.at;
      }
    }
    return startedAt;
  }

  function clampPlay(ms: number): number {
    return Math.min(MAX_PLAY_MS, Math.max(MIN_PLAY_MS, ms));
  }

  async function loadGame(
    sampleId: string,
    loadOptions: { initialPly?: number; startAutoplay?: boolean } = {},
  ): Promise<void> {
    stopPlay();
    clearLoopTimer();
    const nextEvents = loaderForId
      ? await loaderForId(sampleId)
      : await loadEvents(sampleId, urlForId);
    activeSample = sampleId;
    annotationsForGame = [];
    events = nextEvents;
    moveCount = events.filter((e) => e.type === 'move-played').length;
    beliefPanel?.setRows(belief?.rowsForSampleId(sampleId) ?? []);
    beliefPanel?.setTraceRows(belief?.traceRowsForSampleId?.(sampleId) ?? []);
    if (typeof loadOptions.initialPly === 'number') {
      currentPly = Math.min(Math.max(Math.floor(loadOptions.initialPly), 0), moveCount);
    } else if (shouldApplyInitialPly && typeof options.initialPly === 'number') {
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
    if (autoplay && loadOptions.startAutoplay !== false) startPlay();
  }

  function applyPerspective(): void {
    const tier1Color = annotation?.tier1ColorForSampleId(activeSample) ?? null;
    const resolvedOrientation = orientationForId?.(activeSample, currentMeta()) ?? tier1Color;
    if (resolvedOrientation) boardOrientation = resolvedOrientation;
    applyBoardOrientation();
    if (tier1Color === 'black') {
      layout.replaceChildren(blackPane.el, truthPane.el, whitePane.el);
    } else {
      layout.replaceChildren(whitePane.el, truthPane.el, blackPane.el);
    }
    if (metadataMode === 'compact') {
      const choice = panesResolver?.(activeSample, currentMeta()) ?? 'all';
      relocateCompactClockRows(paneForChoice(choice));
    }
  }

  // Attach click-to-pick on the truth board's inner cg-board element. cg-board
  // is the actual square-grid (full width of cg-wrap); the outer .replay-board
  // parent can be larger, which broke the prior coordinate math. Click events
  // bubble up from cg-board through pieces (which have pointer-events:none)
  // and squares to here, so a single listener on the parent works.
  if (annotation && annotPanel) {
    truthPane.boardEl.style.cursor = 'crosshair';
    truthPane.boardEl.addEventListener('click', (e) => {
      const sq = squareFromCgBoardClick(truthPane.boardEl, e, boardOrientation);
      if (sq) annotPanel?.form.appendPickedSquare(sq);
    });
  }

  function applyMetadata(): void {
    const meta = currentMeta();
    whitePane.nameEl.textContent = '';
    blackPane.nameEl.textContent = '';
    setClockPanelNames(clockPanel, meta);
    if (metadataMode === 'compact' && compactClockLayout === 'stacked') {
      updateCompactClockNames();
    }
    renderGameMetaPanel(gameMetaPanel, meta, activeSample);
    renderGameHeader(gameHeader, meta);
    whiteBaseLabel = playerViewLabel(meta?.whiteName, 'white');
    blackBaseLabel = playerViewLabel(meta?.blackName, 'black');
    whitePane.labelEl.textContent = whiteBaseLabel;
    blackPane.labelEl.textContent = blackBaseLabel;
    if (panesResolver) {
      const choice = panesResolver(activeSample, meta);
      layout.classList.remove(
        'replay-layout-single-white',
        'replay-layout-single-black',
        'replay-layout-all',
      );
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
      if (endStatusMode === 'clock') {
        applyClockEndGameState('white');
      } else {
        whitePane.statusEl.textContent = 'WINNER';
        blackPane.statusEl.textContent = 'LOST';
      }
    } else if (winner === 'black') {
      blackPane.el.classList.add('winner');
      whitePane.el.classList.add('loser');
      if (endStatusMode === 'clock') {
        applyClockEndGameState('black');
      } else {
        blackPane.statusEl.textContent = 'WINNER';
        whitePane.statusEl.textContent = 'LOST';
      }
    } else {
      // Draw — neither side gets winner/loser visual state.
      if (endStatusMode === 'clock') {
        applyClockEndGameState(null);
      } else {
        whitePane.statusEl.textContent = 'DRAW';
        blackPane.statusEl.textContent = 'DRAW';
      }
    }
    truthPane.el.classList.add('finished');
    truthPane.statusEl.textContent = endStatusMode === 'clock' ? '' : reasonLabel;
  }

  function clearClockEndGameState(): void {
    if (endStatusMode !== 'clock') return;
    clockPanel.whiteRow.classList.remove('result-win', 'result-loss', 'result-draw');
    clockPanel.blackRow.classList.remove('result-win', 'result-loss', 'result-draw');
    compactClockTopName.classList.remove('result-win', 'result-loss', 'result-draw');
    compactClockBottomName.classList.remove('result-win', 'result-loss', 'result-draw');
    updateCompactClockNames();
  }

  function applyClockEndGameState(winner: Color | null): void {
    if (winner === null) {
      clockPanel.whiteRow.classList.add('result-draw');
      clockPanel.blackRow.classList.add('result-draw');
      updateCompactClockNames(undefined, { black: 'draw', white: 'draw' });
      return;
    }
    const winnerRow = winner === 'white' ? clockPanel.whiteRow : clockPanel.blackRow;
    const loserRow = winner === 'white' ? clockPanel.blackRow : clockPanel.whiteRow;
    winnerRow.classList.add('result-win');
    loserRow.classList.add('result-loss');
    updateCompactClockNames(undefined, {
      [winner]: 'win',
      [winner === 'white' ? 'black' : 'white']: 'loss',
    });
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
      } else if (e.key === 'a' && annotation && annotPanel) {
        e.preventDefault();
        stopPlay();
        clearLoopTimer();
        annotPanel.form.focus();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        boardOrientation = boardOrientation === 'white' ? 'black' : 'white';
        applyBoardOrientation();
      }
    },
    { signal: abortController.signal },
  );
  abortController.signal.addEventListener(
    'abort',
    () => {
      stopPlay();
      clearLoopTimer();
      clearWallClockTimer();
    },
    { once: true },
  );

  // If the initial sample fails to load (e.g. a DB game with no events endpoint),
  // fall through to the next available loop sample rather than crashing the mount.
  try {
    await loadGame(initialReplaySampleId, {
      initialPly: wallClockInitial?.ply,
      startAutoplay: !wallClockLoop,
    });
  } catch (err) {
    const fallback =
      loopSamples?.find((id) => id !== initialReplaySampleId) ??
      wallClockLoop?.samples.find((sample) => sample.sampleId !== initialReplaySampleId)?.sampleId;
    if (fallback) {
      await loadGame(fallback);
    } else {
      throw err;
    }
  }
  startWallClockLoop();

  function applyBoardOrientation(): void {
    whiteCg.set({ orientation: boardOrientation });
    truthCg.set({ orientation: boardOrientation });
    blackCg.set({ orientation: boardOrientation });
  }
}

function renderSplitPaneCaptures(
  pane: ReplayPaneHandle,
  captures: Record<Color, PieceRole[]>,
  perspective: Color,
): void {
  const opponent = oppositeReplayColor(perspective);
  renderPaneCaptures(pane.topCapturesEl, captures[opponent], perspective);
  renderPaneCaptures(pane.capturesEl, captures[perspective], opponent);
}

function oppositeReplayColor(color: Color): Color {
  return color === 'white' ? 'black' : 'white';
}

function pickNextSample(pool: string[], current: string): string {
  if (pool.length <= 1) return pool[0] ?? current;
  const others = pool.filter((id) => id !== current);
  return others[Math.floor(Math.random() * others.length)] ?? pool[0];
}

const ICON_FLIP =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 5h7.5L8.5 3M13 11H5.5L7.5 13" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

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
  if (!resp.ok)
    throw new Error(`failed to load replay sample ${sampleId} at ${url}: ${resp.status}`);
  const text = await resp.text();
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as GameEvent);
}

function gameOverSuffix(state: GameState): string {
  if (state.status.type !== 'finished') return '';
  const winner = state.status.winner;
  if (!winner) return ` — drawn (${state.status.reason})`;
  return ` — ${winner} wins (${state.status.reason})`;
}
