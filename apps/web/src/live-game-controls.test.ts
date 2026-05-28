import type { PlayerView } from '@mistboard/game';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderGameControls } from './live-game-controls.js';
import type { LiveRefs } from './live-state.js';
import { liveState } from './live-state.js';

function makeView(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    id: 'controls-room',
    variant: 'dark-chess',
    board: {},
    visibleSquares: [],
    legalMoves: [],
    status: { type: 'playing', turn: 'white' },
    perspective: 'white',
    moveNumber: 2,
    ...overrides,
  };
}

function makeRefs(): Pick<LiveRefs, 'gameControlsSection' | 'gameControls'> {
  return {
    gameControlsSection: document.createElement('section'),
    gameControls: document.createElement('div'),
  };
}

afterEach(() => {
  liveState.roomMode = 'pvp';
  liveState.seat = 'spectator';
  liveState.solo = false;
  liveState.abortDeadline = null;
  liveState.forfeitDeadline = null;
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('renderGameControls', () => {
  it('shows resign for seated PvP players after the first-move abort window', () => {
    const refs = makeRefs();
    liveState.roomMode = 'pvp';
    liveState.seat = 'white';

    renderGameControls(refs, makeView(), vi.fn());

    expect(refs.gameControlsSection.hidden).toBe(false);
    expect(refs.gameControls.textContent).toBe('Resign');
  });

  it('shows resign for seated PvE players after the first-move abort window', () => {
    const refs = makeRefs();
    liveState.roomMode = 'pve';
    liveState.seat = 'white';

    renderGameControls(refs, makeView(), vi.fn());

    expect(refs.gameControlsSection.hidden).toBe(false);
    expect(refs.gameControls.textContent).toBe('Resign');
  });

  it('keeps PvE controls hidden for spectators', () => {
    const refs = makeRefs();
    liveState.roomMode = 'pve';
    liveState.seat = 'spectator';

    renderGameControls(refs, makeView(), vi.fn());

    expect(refs.gameControlsSection.hidden).toBe(true);
    expect(refs.gameControls.childElementCount).toBe(0);
  });

  it('shows abort instead of resign during the PvE first-move abort window', () => {
    const refs = makeRefs();
    liveState.roomMode = 'pve';
    liveState.seat = 'white';
    liveState.abortDeadline = Date.now() + 10_000;

    renderGameControls(refs, makeView({ moveNumber: 1 }), vi.fn());

    expect(refs.gameControlsSection.hidden).toBe(false);
    expect(refs.gameControls.querySelector('button')?.textContent).toBe('Abort');
    expect(refs.gameControls.textContent).not.toContain('Resign');
  });
});
