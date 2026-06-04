import type { PlayerView } from '@mistboard/game';
import { afterEach, describe, expect, it } from 'vitest';
import { liveState } from './live-state.js';
import { actionBody, actionTitle, actionTone, connectionNoticeMode } from './live-status.js';

function playingView(): PlayerView {
  return {
    id: 'test-room',
    variant: 'dark-chess',
    board: {},
    visibleSquares: [],
    legalMoves: [],
    status: { type: 'playing', turn: 'white' },
    perspective: 'white',
    moveNumber: 1,
  };
}

afterEach(() => {
  liveState.connectionState = 'connecting';
  liveState.connectionNoticeTier = 'none';
  liveState.seat = 'spectator';
});

const noDraft = { hasVisibleDraftData: false };

describe('connectionNoticeMode — staged reconnect', () => {
  it('is silent (none) when connected', () => {
    liveState.connectionState = 'connected';
    liveState.connectionNoticeTier = 'none';
    expect(connectionNoticeMode()).toBe('none');
  });

  it('stays silent during the grace window of a reconnect', () => {
    // Socket just dropped: state flips to reconnecting but the tier timers have
    // not fired yet. A sub-second blip must surface nothing.
    liveState.connectionState = 'reconnecting';
    liveState.connectionNoticeTier = 'none';
    expect(connectionNoticeMode()).toBe('none');
  });

  it('shows the dot tier once the grace window passes', () => {
    liveState.connectionState = 'reconnecting';
    liveState.connectionNoticeTier = 'dot';
    expect(connectionNoticeMode()).toBe('dot');
  });

  it('escalates to banner once retries keep failing', () => {
    liveState.connectionState = 'reconnecting';
    liveState.connectionNoticeTier = 'banner';
    expect(connectionNoticeMode()).toBe('banner');
  });

  it('always banners for terminal/pre-board states regardless of tier', () => {
    liveState.connectionNoticeTier = 'none';
    for (const state of ['connecting', 'displaced', 'rejected'] as const) {
      liveState.connectionState = state;
      expect(connectionNoticeMode()).toBe('banner');
    }
  });
});

describe('action notice text follows the tier, not the raw socket state', () => {
  it('reports the game state (not "Reconnecting") during the grace window', () => {
    liveState.seat = 'white';
    liveState.connectionState = 'reconnecting';
    liveState.connectionNoticeTier = 'none';
    const view = playingView();
    expect(actionTitle(view)).toBe('Your move');
    expect(actionTone(view)).not.toBe('danger');
  });

  it('still reports the game state at the dot tier', () => {
    liveState.seat = 'white';
    liveState.connectionState = 'reconnecting';
    liveState.connectionNoticeTier = 'dot';
    expect(actionTitle(playingView())).toBe('Your move');
  });

  it('switches to the reconnect notice only at the banner tier', () => {
    liveState.seat = 'white';
    liveState.connectionState = 'reconnecting';
    liveState.connectionNoticeTier = 'banner';
    const view = playingView();
    expect(actionTitle(view)).toBe('Reconnecting');
    expect(actionTone(view)).toBe('pending');
    expect(actionBody(view, noDraft)).toBe('Trying to restore your room state and seat.');
  });

  it('uses the danger tone for a disconnected banner', () => {
    liveState.seat = 'white';
    liveState.connectionState = 'disconnected';
    liveState.connectionNoticeTier = 'banner';
    expect(actionTone(playingView())).toBe('danger');
  });
});
