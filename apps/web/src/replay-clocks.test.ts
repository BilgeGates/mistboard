import type { ClockState, GameEvent, GameState } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import {
  createClockPanel,
  renderClockPanel,
  replayClockDisplayAt,
  setClockPanelNames,
} from './replay-clocks.js';
import type { GameMeta } from './replay-meta.js';

function playingState(turn: 'white' | 'black' = 'white'): GameState {
  return { status: { turn, type: 'playing' } } as GameState;
}

describe('replayClockDisplayAt', () => {
  it('uses the last event timestamp before falling back to the running clock', () => {
    const events = [{ at: 100 }, { at: 250 }] as GameEvent[];
    const state = { clock: { runningSince: 75 } } as GameState;

    expect(replayClockDisplayAt(events, state)).toBe(250);
    expect(replayClockDisplayAt([], state)).toBe(75);
  });
});

describe('renderClockPanel', () => {
  const meta: GameMeta = {
    blackName: 'Engine',
    modeLabel: 'Fog of War',
    plyCount: 8,
    result: 'white-wins',
    termination: 'king-captured',
    timeControl: { kind: 'per-move', milliseconds: 5_000 },
    whiteName: 'Guest',
  };

  it('renders clockless thinking progress from replay metadata', () => {
    const panel = createClockPanel();
    setClockPanelNames(panel, meta);

    renderClockPanel(panel, undefined, playingState('white'), meta, undefined, {
      activeColor: 'white',
      budgetMs: 5_000,
      elapsedMs: 250,
    });

    expect(panel.el.hidden).toBe(false);
    expect(panel.label.textContent).toBe('Time 0:05 / move');
    expect(panel.whiteLabel.textContent).toBe('Guest');
    expect(panel.blackLabel.textContent).toBe('Engine');
    expect(panel.whiteTime.textContent).toBe('0.3s / 5s');
    expect(panel.blackTime.textContent).toBe('5s');
    expect(panel.whiteRow.classList.contains('active')).toBe(true);
    expect(panel.whiteRow.classList.contains('is-thinking')).toBe(true);
    expect(panel.whiteRow.style.getPropertyValue('--replay-thinking-progress')).toBe('0.05');
  });

  it('keeps sub-tenth clockless labels aligned with later elapsed labels', () => {
    const panel = createClockPanel();

    renderClockPanel(panel, undefined, playingState('white'), meta, undefined, {
      activeColor: 'white',
      budgetMs: 5_000,
      elapsedMs: 50,
    });

    expect(panel.whiteTime.textContent).toBe('0.0s / 5s');
  });

  it('renders real clock time using display overrides', () => {
    const panel = createClockPanel();
    const clock: ClockState = {
      activeColor: 'black',
      incrementMs: 1_000,
      initialMs: 180_000,
      remainingMs: { black: 120_000, white: 60_000 },
      runningSince: 1_000,
    };

    renderClockPanel(panel, clock, playingState('black'), undefined, 11_000);

    expect(panel.label.textContent).toBe('Time 3:00+1');
    expect(panel.whiteTime.textContent).toBe('1:00.0');
    expect(panel.blackTime.textContent).toBe('1:50.0');
    expect(panel.blackRow.classList.contains('active')).toBe(true);
    expect(panel.blackToMove.getAttribute('aria-hidden')).toBe('false');
  });
});
