import { describe, expect, it } from 'vitest';
import type { LiveRefs } from '../live-state.js';
import {
  createTenantRoomChrome,
  type TenantChromeContext,
  type TenantWebView,
  type WebVariantTenant,
} from './room-chrome.js';

// Direct pins for the chrome branches the per-tenant suites do not reach:
// the scrubbed-replay notice, the PvP invite window (and its PvE/engine
// non-trigger), and the variant-detail meta suffix. The bulk of the chrome
// (clocks, countdowns, confirm dialogs, room actions) stays pinned through
// the DMX room suite, the web reference tenant.

type Color = 'white' | 'red';

const tenant: WebVariantTenant<Color> = {
  displayName: 'Testboard',
  colors: ['white', 'red'],
  isColor: (value): value is Color => value === 'white' || value === 'red',
  oppositeColor: (color) => (color === 'white' ? 'red' : 'white'),
  enabled: () => true,
  reviewUrl: (roomId) => `/testboard/game/${roomId}`,
  reasonPhrase: (reason) => reason,
  disabledTitle: 'Testboard disabled',
  disabledBody: 'Renderer off.',
  rejectedBody: 'Room not active.',
  spectatorBody: 'Watching.',
  selectInstruction: 'Pick a piece.',
};

type CtxOverrides = Partial<{
  view: TenantWebView<Color> | null;
  seat: unknown;
  connectionState: string;
  connectedSeats: Partial<Record<Color, boolean>>;
  isReplayLive: boolean;
  variantDetail: string | null;
}>;

function chromeHarness(overrides: CtxOverrides = {}) {
  const ctx: TenantChromeContext<Color> = {
    view: () => overrides.view ?? playingView(),
    seat: () => overrides.seat ?? 'white',
    connectionState: () => overrides.connectionState ?? 'connected',
    clock: () => null,
    timeControl: () => null,
    connectedSeats: () => overrides.connectedSeats ?? { white: true, red: true },
    abortDeadline: () => null,
    forfeitDeadline: () => null,
    roomMode: () => 'pvp',
    room: () => 'test_room',
    debugRequested: () => false,
    isReplayLive: () => overrides.isReplayLive ?? true,
    orientation: () => 'white',
    playAgainRequestBody: () => ({}),
    rematchControls: () => null,
    ...(overrides.variantDetail !== undefined
      ? { variantDetail: () => overrides.variantDetail ?? null }
      : {}),
  };
  const refs = refsFixture();
  const chrome = createTenantRoomChrome(tenant, ctx);
  chrome.setRenderTarget(refs, { reconnectNow: () => {}, sendSocket: () => true });
  return { chrome, refs };
}

function playingView(overrides: Partial<TenantWebView<Color>> = {}): TenantWebView<Color> {
  return {
    id: 'test_room',
    status: { type: 'playing', turn: 'white' },
    moveNumber: 1,
    ...overrides,
  };
}

describe('tenant room chrome action status', () => {
  it('hides the notice during normal connected play', () => {
    const { chrome, refs } = chromeHarness();
    chrome.renderActionStatus();
    expect(refs.actionSection.hidden).toBe(true);
  });

  it('shows a replay notice while scrubbed off live', () => {
    const { chrome, refs } = chromeHarness({ isReplayLive: false });
    chrome.renderActionStatus();
    expect(refs.actionSection.hidden).toBe(false);
    expect(refs.actionStatus.textContent).toContain('Viewing replay');
    expect(refs.actionStatus.textContent).toContain('Return to latest before making a move.');
  });

  it('shows invite guidance while the opponent seat is empty pre-game', () => {
    const { chrome, refs } = chromeHarness({ connectedSeats: { white: true, red: false } });
    chrome.renderActionStatus();
    expect(refs.actionSection.hidden).toBe(false);
    expect(refs.actionStatus.textContent).toContain('Invite opponent');
    expect(refs.actionStatus.textContent).toContain('Copy the invite link');
  });

  it('does not read a connected engine seat as a missing opponent', () => {
    // The server reports engine seats as connected, so a PvE room plays
    // normally (notice hidden) instead of asking for an invite.
    const { chrome, refs } = chromeHarness({ connectedSeats: { white: true, red: true } });
    chrome.renderActionStatus();
    expect(refs.actionSection.hidden).toBe(true);
  });

  it('stops asking for an invite once the first full move is complete', () => {
    const { chrome, refs } = chromeHarness({
      view: playingView({ moveNumber: 2 }),
      connectedSeats: { white: true, red: false },
    });
    chrome.renderActionStatus();
    expect(refs.actionSection.hidden).toBe(true);
  });
});

describe('tenant room chrome meta and invite emphasis', () => {
  it('appends the variant detail to the Variant row', () => {
    const { chrome, refs } = chromeHarness({ variantDetail: '5+5' });
    chrome.renderMeta();
    expect(refs.gameInfo.textContent).toContain('Testboard · 5+5');
  });

  it('keeps the bare variant name without a detail hook', () => {
    const { chrome, refs } = chromeHarness();
    chrome.renderMeta();
    expect(refs.gameInfo.textContent).toContain('Testboard');
    expect(refs.gameInfo.textContent).not.toContain('·');
  });

  it('marks copy-invite primary only while waiting for the opponent', () => {
    const waiting = chromeHarness({ connectedSeats: { white: true, red: false } });
    waiting.chrome.renderRoomActions();
    const waitingCopy = waiting.refs.roomActions.querySelector('button');
    expect(waitingCopy?.textContent).toBe('Copy invite');
    expect(waitingCopy?.className).toBe('primary');

    const playing = chromeHarness();
    playing.chrome.renderRoomActions();
    const playingCopy = playing.refs.roomActions.querySelector('button');
    expect(playingCopy?.textContent).toBe('Copy invite');
    expect(playingCopy?.className).toBe('');
  });
});

function refsFixture(): LiveRefs {
  const root = document.createElement('div');
  root.innerHTML = '<button data-replay="first"></button><button data-replay="next"></button>';
  return {
    actionSection: el('section'),
    actionStatus: el('div'),
    board: el('div'),
    boardPaused: el('div'),
    boardStatus: el('div'),
    capturesBottom: el('div'),
    capturesTop: el('div'),
    clockBottom: el('div'),
    clockNote: el('p'),
    clockTop: el('div'),
    devViews: el('div'),
    devViewsSection: el('section'),
    draftPicker: el('div'),
    gameControls: el('div'),
    gameControlsSection: el('section'),
    gameInfo: el('div'),
    moveList: el('ol'),
    offerSection: el('section'),
    promotion: el('div'),
    replayControls: root.querySelectorAll<HTMLButtonElement>('[data-replay]'),
    replayMeta: el('p'),
    roomActions: el('div'),
    roomMeta: el('p'),
    selectionList: el('div'),
    selectionSection: el('section'),
    starts: el('div'),
  };
}

function el<K extends keyof HTMLElementTagNameMap>(tagName: K): HTMLElementTagNameMap[K] {
  return document.createElement(tagName);
}
