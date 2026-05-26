import type { LiveRefs } from './live-state.js';
import { primaryNavItems, utilityNavItems } from './nav-items.js';
import { escapeHtml } from './web-utils.js';

export function createLiveLayout(
  target: HTMLDivElement,
  options: { debugRequested: boolean },
): LiveRefs {
  target.innerHTML = `
    ${buildNavHtml()}
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
        <section class="board-panel">
          <aside class="side-panel meta-panel" aria-label="Game controls">
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
              <h2>Draft960 Offer</h2>
              <div data-starts class="starts"></div>
            </section>
            <section data-selection-section class="panel-section">
              <h2>Selections</h2>
              <div data-selections class="selection-list"></div>
            </section>
          </aside>
          <div class="board-shell">
            <div data-board-status class="board-status">
              <div class="board-status__inner">
                <span data-board-status-spinner class="board-status__spinner" aria-hidden="true"></span>
                <p data-board-status-label class="board-status__label">Connecting</p>
              </div>
            </div>
            <div data-board class="board" aria-label="chess board"></div>
            <div data-captures class="captures-strip" aria-label="Pieces captured"></div>
            <div data-board-paused class="board-paused" hidden role="status" aria-live="polite">
              <div class="board-paused__badge">
                <strong data-board-paused-title>Game paused</strong>
                <span data-board-paused-body>Server is restarting — your game will resume shortly</span>
              </div>
            </div>
            <div data-draft-picker class="draft-picker" hidden></div>
            <div data-promotion class="promotion-picker" hidden></div>
          </div>
          <aside class="side-panel moves-panel" aria-label="Replay and move list">
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
        </section>
        <section data-dev-views-section class="debug-page" hidden>
          <div class="debug-header">
            <h2>Debug Views</h2>
          </div>
          <div data-dev-views class="debug-views"></div>
        </section>
      </section>
    </main>
  `;

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
  const captures = target.querySelector<HTMLDivElement>('[data-captures]');
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
    !captures ||
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
    captures,
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

function buildNavHtml(): string {
  return `
    <nav class="site-nav" aria-label="Primary">
      <a class="site-nav-brand" href="/">
        <img class="site-nav-logo" src="/logo.svg" alt="" width="28" height="28">
        <span>MISTBOARD</span>
      </a>
      <div class="site-nav-links">
        ${primaryNavItems()
          .map(
            (item) => `<a class="site-nav-link" href="${item.href}">${escapeHtml(item.label)}</a>`,
          )
          .join('')}
      </div>
      <div class="site-nav-utilities">
        ${utilityNavItems()
          .map(
            (item) => `<a class="site-nav-link" href="${item.href}">${escapeHtml(item.label)}</a>`,
          )
          .join('')}
        <div class="site-nav-auth" data-account-slot>
          <a class="site-nav-link site-nav-link-signin" href="/account?tab=login">Sign in</a>
          <a class="site-nav-link-primary" href="/account?tab=register">Register</a>
        </div>
      </div>
    </nav>
  `;
}
