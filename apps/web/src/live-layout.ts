import type { LiveRefs } from './live-state.js';
import './review/review-shell.css';
import './live-review.css';
import { buildNav } from './site-shell.js';

export function setLiveLayoutGameSpec(target: HTMLElement, gameSpecId: string | null): void {
  // The chess stack (fog chess / Draft960) has no tenant route class; give it
  // one so it can carry uniboard tokens (aspect / capture-strip chrome) like
  // every other variant.
  target.classList.toggle(
    'live-route--chess',
    gameSpecId === null || gameSpecId === 'dark-chess' || gameSpecId === 'dark-draft960',
  );
  target.classList.toggle(
    'live-route--xiangqi',
    gameSpecId === 'dark-xiangqi' || gameSpecId === 'xiangqi',
  );
  target.classList.toggle(
    'live-route--mini-xiangqi',
    gameSpecId === 'mini-xiangqi' ||
      gameSpecId === 'dark-mini-xiangqi' ||
      gameSpecId === 'drop-mini-xiangqi',
  );
  target.classList.toggle('live-route--drop-mini-xiangqi', gameSpecId === 'drop-mini-xiangqi');
  target.classList.toggle('live-route--fortress-xiangqi', gameSpecId === 'fortress-xiangqi');
  target.classList.toggle('live-route--crossroads-chess', gameSpecId === 'crossroads-chess');
  target.classList.toggle('live-route--jieqi', gameSpecId === 'jieqi');
  target.classList.toggle('live-route--banqi', gameSpecId === 'banqi');
  target.classList.toggle('live-route--reveal-chess', gameSpecId === 'reveal-chess');
  target.classList.toggle('live-route--shogi', gameSpecId === 'dark-shogi');
  target.classList.toggle('live-route--crazyhouse', gameSpecId === 'dark-crazyhouse');
  target.classList.toggle('live-route--kriegspiel', gameSpecId === 'kriegspiel');
  target.classList.toggle('live-route--jungle', gameSpecId === 'jungle');
  target.classList.toggle('live-route--jungle-flip', gameSpecId === 'jungle-flip');
}

// Static room chrome only. Live game decisions stay in live-render.ts.
export function createLiveLayout(
  target: HTMLDivElement,
  options: { debugRequested: boolean },
): LiveRefs {
  target.innerHTML = `
    <main class="shell${options.debugRequested ? ' debug-shell' : ''}">
      ${
        options.debugRequested
          ? `
      <section class="topbar">
        <div>
          <h1>Fog Debug</h1>
          <p data-room-meta>Connecting</p>
        </div>
      </section>`
          : '<p data-room-meta hidden></p>'
      }

      <section class="play-grid">
        <div class="review-shell__cluster live-review__cluster">
          <aside class="side-panel meta-panel review-shell__rail review-shell__left" aria-label="Game controls">
            <section class="panel-section">
              <h2>About</h2>
              <div data-game-info class="game-info"></div>
            </section>
            <section class="panel-section">
              <div data-room-actions class="room-actions"></div>
            </section>
            <section data-action-section class="panel-section" hidden>
              <div data-action-status class="action-status"></div>
            </section>
            <section data-game-controls-section class="panel-section" hidden>
              <div data-game-controls class="game-controls"></div>
            </section>
            <section data-offer-section class="panel-section">
              <h2>Dark Draft960 Offer</h2>
              <div data-starts class="starts"></div>
            </section>
            <section data-selection-section class="panel-section">
              <h2>Selections</h2>
              <div data-selections class="selection-list"></div>
            </section>
          </aside>
          <div class="review-shell__center">
          <div class="board-shell">
            <div data-captures-top class="captures-strip captures-strip-top" aria-label="Pieces captured by the top side"></div>
            <div class="board-stage">
              <div data-board-status class="board-status">
                <div class="board-status__inner">
                  <span data-board-status-spinner class="board-status__spinner" aria-hidden="true"></span>
                  <p data-board-status-label class="board-status__label">Connecting</p>
                </div>
              </div>
              <div data-board class="board" aria-label="chess board"></div>
              <div data-board-paused class="board-paused" hidden role="status" aria-live="polite">
                <div class="board-paused__badge">
                  <strong data-board-paused-title>Game paused</strong>
                  <span data-board-paused-body>Server is restarting — your game will resume shortly</span>
                </div>
              </div>
              <div data-draft-picker class="draft-picker" hidden></div>
              <div data-promotion class="promotion-picker" hidden></div>
            </div>
            <div data-captures class="captures-strip captures-strip-bottom" aria-label="Pieces captured by the bottom side"></div>
          </div>
          </div>
          <aside class="side-panel moves-panel review-shell__rail review-shell__right" aria-label="Replay and move list">
            <section class="panel-section game-console">
              <div data-clock-top class="clocks clock-slot"></div>
              <div class="replay-console">
                <h2>Replay</h2>
                <div class="replay-controls">
                  <button type="button" data-replay="first" title="First position">|&lt;</button>
                  <button type="button" data-replay="prev" title="Previous event">&lt;</button>
                  <button type="button" data-replay="next" title="Next event">&gt;</button>
                  <button type="button" data-replay="latest" title="Latest position">&gt;|</button>
                </div>
                <p data-replay-meta class="replay-meta">Live</p>
                <ol data-move-list class="move-list"></ol>
              </div>
              <div data-clock-bottom class="clocks clock-slot"></div>
              <p data-clocks-note class="clocks-pregame-note" hidden></p>
            </section>
          </aside>
        </div>
        <section data-dev-views-section class="debug-page" hidden>
          <div class="debug-header">
            <h2>Debug Views</h2>
          </div>
          <div data-dev-views class="debug-views"></div>
        </section>
      </section>
    </main>
  `;

  // The room rides the shared site nav (brand + Watch/Leaderboard + Learn +
  // account), prepended as an element so its dropdown and mobile toggle wire
  // up; account-nav.ts hydrates it via its body MutationObserver like every
  // other page. Previously this was a hand-rolled static string that drifted
  // (no Learn menu, no mobile toggle) — converging keeps one nav source.
  target.prepend(buildNav());

  const roomMeta = target.querySelector<HTMLParagraphElement>('[data-room-meta]');
  const gameInfo = target.querySelector<HTMLDivElement>('[data-game-info]');
  const board = target.querySelector<HTMLDivElement>('[data-board]');
  const boardPaused = target.querySelector<HTMLDivElement>('[data-board-paused]');
  const boardStatus = target.querySelector<HTMLDivElement>('[data-board-status]');
  const actionSection = target.querySelector<HTMLElement>('[data-action-section]');
  const actionStatus = target.querySelector<HTMLDivElement>('[data-action-status]');
  const clockTop = target.querySelector<HTMLDivElement>('[data-clock-top]');
  const clockBottom = target.querySelector<HTMLDivElement>('[data-clock-bottom]');
  const clockNote = target.querySelector<HTMLParagraphElement>('[data-clocks-note]');
  const capturesTop = target.querySelector<HTMLDivElement>('[data-captures-top]');
  const capturesBottom = target.querySelector<HTMLDivElement>('[data-captures]');
  const roomActions = target.querySelector<HTMLDivElement>('[data-room-actions]');
  const devViewsSection = target.querySelector<HTMLElement>('[data-dev-views-section]');
  const devViewsPanel = target.querySelector<HTMLDivElement>('[data-dev-views]');
  const offerSection = target.querySelector<HTMLElement>('[data-offer-section]');
  const draftPicker = target.querySelector<HTMLDivElement>('[data-draft-picker]');
  const promotion = target.querySelector<HTMLDivElement>('[data-promotion]');
  const selectionSection = target.querySelector<HTMLElement>('[data-selection-section]');
  const starts = target.querySelector<HTMLDivElement>('[data-starts]');
  const selectionList = target.querySelector<HTMLDivElement>('[data-selections]');
  const replayMeta = target.querySelector<HTMLParagraphElement>('[data-replay-meta]');
  const replayControls = target.querySelectorAll<HTMLButtonElement>('[data-replay]');
  const moveList = target.querySelector<HTMLOListElement>('[data-move-list]');
  const gameControls = target.querySelector<HTMLDivElement>('[data-game-controls]');
  const gameControlsSection = target.querySelector<HTMLElement>('[data-game-controls-section]');

  if (
    !roomMeta ||
    !gameInfo ||
    !board ||
    !boardPaused ||
    !boardStatus ||
    !actionSection ||
    !actionStatus ||
    !capturesTop ||
    !capturesBottom ||
    !clockTop ||
    !clockBottom ||
    !clockNote ||
    !roomActions ||
    !devViewsSection ||
    !devViewsPanel ||
    !offerSection ||
    !draftPicker ||
    !promotion ||
    !selectionSection ||
    !starts ||
    !selectionList ||
    !replayMeta ||
    !moveList ||
    !gameControls ||
    !gameControlsSection
  ) {
    throw new Error('missing app region');
  }

  return {
    board,
    boardPaused,
    boardStatus,
    clockBottom,
    clockNote,
    clockTop,
    draftPicker,
    actionSection,
    actionStatus,
    capturesBottom,
    capturesTop,
    devViews: devViewsPanel,
    devViewsSection,
    gameInfo,
    moveList,
    offerSection,
    promotion,
    replayControls,
    replayMeta,
    roomActions,
    selectionSection,
    roomMeta,
    selectionList,
    starts,
    gameControls,
    gameControlsSection,
  };
}
