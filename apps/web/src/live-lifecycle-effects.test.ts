import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createLiveLifecycleEffects,
  type LiveLifecycleSnapshot,
  lifecycleEffectForTransition,
} from './live-lifecycle-effects.js';

function snapshot(overrides: Partial<LiveLifecycleSnapshot> = {}): LiveLifecycleSnapshot {
  return {
    gameId: 'game-1',
    status: 'playing',
    moveNumber: 1,
    ready: true,
    seated: true,
    isLive: true,
    seat: 'red',
    winner: null,
    ...overrides,
  };
}

describe('live lifecycle transition policy', () => {
  it('starts an opening game once it is ready for a seated player', () => {
    expect(lifecycleEffectForTransition(null, snapshot())).toBe('start');
    expect(
      lifecycleEffectForTransition(snapshot({ ready: false }), snapshot({ ready: true })),
    ).toBe('start');
  });

  it('does not treat a midgame join, spectator view, or replay scrub as a start', () => {
    expect(lifecycleEffectForTransition(null, snapshot({ moveNumber: 3 }))).toBeNull();
    expect(lifecycleEffectForTransition(null, snapshot({ seated: false }))).toBeNull();
    expect(lifecycleEffectForTransition(null, snapshot({ isLive: false }))).toBeNull();
  });

  it('classifies participant and spectator finishes without reading the board', () => {
    const playing = snapshot({ moveNumber: 8 });
    expect(
      lifecycleEffectForTransition(
        playing,
        snapshot({
          status: 'finished',
          moveNumber: 8,
          winner: 'red',
        }),
      ),
    ).toBe('finish-win');
    expect(
      lifecycleEffectForTransition(
        playing,
        snapshot({
          status: 'finished',
          moveNumber: 8,
          winner: 'black',
        }),
      ),
    ).toBe('finish-loss');
    expect(
      lifecycleEffectForTransition(
        playing,
        snapshot({
          status: 'finished',
          moveNumber: 8,
          winner: null,
        }),
      ),
    ).toBe('finish-draw');
    expect(
      lifecycleEffectForTransition(
        snapshot({ moveNumber: 8, seated: false, seat: null }),
        snapshot({
          status: 'finished',
          moveNumber: 8,
          seated: false,
          seat: null,
          winner: 'red',
        }),
      ),
    ).toBe('finish');
  });

  it('does not replay a finish when mounting an already-finished game', () => {
    expect(
      lifecycleEffectForTransition(
        null,
        snapshot({ status: 'finished', moveNumber: 12, winner: 'red' }),
      ),
    ).toBeNull();
  });
});

describe('live lifecycle effect observer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires each game transition once across repeated renders and reconnects', () => {
    vi.useFakeTimers();
    const target = document.createElement('div');
    const effects = createLiveLifecycleEffects(target);

    expect(effects.update(snapshot({ ready: false }))).toBeNull();
    expect(effects.update(snapshot())).toBe('start');
    expect(target.classList.contains('live-lifecycle--start')).toBe(true);
    expect(effects.update(snapshot())).toBeNull();

    // A brief disconnect can make the room look unready again. Reconnection
    // must not replay the opening pulse for the same game.
    expect(effects.update(snapshot({ ready: false }))).toBeNull();
    expect(effects.update(snapshot())).toBeNull();

    expect(effects.update(snapshot({ status: 'finished', moveNumber: 9, winner: 'red' }))).toBe(
      'finish-win',
    );
    expect(target.classList.contains('live-lifecycle--finish-win')).toBe(true);
    expect(
      effects.update(snapshot({ status: 'finished', moveNumber: 9, winner: 'red' })),
    ).toBeNull();

    vi.runAllTimers();
    expect(target.dataset.liveLifecycleEffect).toBeUndefined();
    effects.destroy();
  });

  it('re-arms for a rematch with a new game id', () => {
    vi.useFakeTimers();
    const target = document.createElement('div');
    const effects = createLiveLifecycleEffects(target);

    expect(effects.update(snapshot())).toBe('start');
    expect(effects.update(snapshot({ status: 'finished', moveNumber: 5, winner: null }))).toBe(
      'finish-draw',
    );
    expect(effects.update(snapshot({ gameId: 'game-2' }))).toBe('start');
    effects.destroy();
  });
});
