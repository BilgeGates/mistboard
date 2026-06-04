import { createClock, type PlayerView } from '@mistboard/game';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderClocks } from './live-clocks.js';
import { liveState } from './live-state.js';

type Refs = { clockTop: HTMLDivElement; clockBottom: HTMLDivElement; clockNote: HTMLDivElement };

function makeRefs(): Refs {
  return {
    clockTop: document.createElement('div'),
    clockBottom: document.createElement('div'),
    clockNote: document.createElement('div'),
  };
}

function playingView(): PlayerView {
  return {
    id: 'r',
    variant: 'dark-chess',
    board: {},
    visibleSquares: [],
    legalMoves: [],
    status: { type: 'playing', turn: 'white' },
    perspective: 'white',
    moveNumber: 1,
    clock: createClock(0),
  };
}

// perspective 'white' → clockTop renders black's row, clockBottom renders white's.
function dot(slot: HTMLElement): HTMLElement | null {
  return slot.querySelector('.presence-dot');
}

beforeEach(() => {
  liveState.connectionState = 'connected';
  liveState.connectionNoticeTier = 'none';
  liveState.connectedSeats = { white: true, black: true };
});

afterEach(() => {
  liveState.connectionState = 'connecting';
  liveState.connectionNoticeTier = 'none';
  liveState.seat = 'spectator';
  liveState.roomMode = 'pvp';
  liveState.connectedSeats = { white: false, black: false };
});

describe('presence dots — PvP', () => {
  it('shows both players green when connected', () => {
    liveState.roomMode = 'pvp';
    liveState.seat = 'white';
    const refs = makeRefs();
    renderClocks(refs, playingView());
    expect(dot(refs.clockBottom)?.classList.contains('is-online')).toBe(true); // you
    expect(dot(refs.clockTop)?.classList.contains('is-online')).toBe(true); // opponent
  });

  it('greys the opponent from server presence, your own from local socket', () => {
    liveState.roomMode = 'pvp';
    liveState.seat = 'white';
    liveState.connectedSeats = { white: true, black: false }; // opponent dropped server-side
    const refs = makeRefs();
    renderClocks(refs, playingView());
    expect(dot(refs.clockTop)?.classList.contains('is-offline')).toBe(true); // opponent grey
    expect(dot(refs.clockBottom)?.classList.contains('is-online')).toBe(true); // you still green
  });

  it('greys your own dot while reconnecting, independent of stale connectedSeats', () => {
    liveState.roomMode = 'pvp';
    liveState.seat = 'white';
    liveState.connectedSeats = { white: true, black: true }; // stale: server thinks you're up
    liveState.connectionState = 'reconnecting';
    liveState.connectionNoticeTier = 'dot';
    const refs = makeRefs();
    renderClocks(refs, playingView());
    const own = dot(refs.clockBottom);
    expect(own?.classList.contains('is-offline')).toBe(true);
    expect(own?.title).toBe('Reconnecting');
  });
});

describe('presence dots — PvE', () => {
  it('shows your own dot green but never gives the engine one', () => {
    liveState.roomMode = 'pve';
    liveState.seat = 'white';
    const refs = makeRefs();
    renderClocks(refs, playingView());
    expect(dot(refs.clockBottom)?.classList.contains('is-online')).toBe(true); // you
    expect(dot(refs.clockTop)).toBeNull(); // engine: no socket, no dot
  });

  it('greys your own dot on reconnect; engine stays dot-less', () => {
    liveState.roomMode = 'pve';
    liveState.seat = 'white';
    liveState.connectionState = 'reconnecting';
    liveState.connectionNoticeTier = 'banner';
    const refs = makeRefs();
    renderClocks(refs, playingView());
    expect(dot(refs.clockBottom)?.classList.contains('is-offline')).toBe(true); // you
    expect(dot(refs.clockTop)).toBeNull(); // engine still dot-less
  });
});

describe('presence dots — EvE (spectating)', () => {
  it('renders no dots for either engine', () => {
    liveState.roomMode = 'eve';
    liveState.seat = 'spectator';
    const refs = makeRefs();
    renderClocks(refs, playingView());
    expect(dot(refs.clockTop)).toBeNull();
    expect(dot(refs.clockBottom)).toBeNull();
  });
});
