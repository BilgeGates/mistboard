import type { GameEvent, PlayerView } from '@mistboard/game';
import { describe, expect, it } from 'vitest';
import {
  initialOpponentMoveSoundForSnapshot,
  shouldDeferHiddenPveOpeningSound,
  tonesForSound,
} from './live-sound.js';

function makeView(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    id: 'sound-test',
    variant: 'dark-chess',
    board: {},
    visibleSquares: [],
    legalMoves: [],
    status: { type: 'playing', turn: 'white' },
    perspective: 'white',
    moveNumber: 1,
    ...overrides,
  };
}

function finishAt(kind: Parameters<typeof tonesForSound>[0]): number {
  return Math.max(...tonesForSound(kind).map((tone) => tone.delay + tone.duration));
}

function maxGain(kind: Parameters<typeof tonesForSound>[0]): number {
  return Math.max(...tonesForSound(kind).map((tone) => tone.gain));
}

describe('finish sound tone plans', () => {
  it('keeps the win tone short and ascending', () => {
    const tones = tonesForSound('win');
    expect(finishAt('win')).toBeLessThanOrEqual(0.5);
    expect(tones.map((tone) => tone.frequency)).toEqual([392, 493.88, 659.25]);
    expect(tones.every((tone) => tone.type === 'sine')).toBe(true);
  });

  it('keeps the loss tone softer and descending', () => {
    const tones = tonesForSound('lose');
    expect(finishAt('lose')).toBeLessThanOrEqual(0.4);
    expect(maxGain('lose')).toBeLessThan(maxGain('win'));
    expect(tones.map((tone) => tone.frequency)).toEqual([246.94, 196]);
  });
});

describe('opening opponent sound policy', () => {
  it('infers the hidden PvE white opening from black-to-move first snapshot', () => {
    const events: GameEvent[] = [
      { type: 'room-created', at: 1, roomId: 'sound-test', variant: 'dark-chess', offer: [] },
      {
        type: 'seat-assigned',
        at: 2,
        roomId: 'sound-test',
        clientId: 'builtin-random-legal',
        seat: 'white',
      },
      { type: 'seat-assigned', at: 3, roomId: 'sound-test', clientId: 'human', seat: 'black' },
    ];
    const view = makeView({ status: { type: 'playing', turn: 'black' }, perspective: 'black' });

    expect(initialOpponentMoveSoundForSnapshot(events, view, 'black', 'pve')).toBe('move');
  });

  it('does not infer an opening sound before the engine has moved', () => {
    const view = makeView({ status: { type: 'playing', turn: 'white' }, perspective: 'black' });

    expect(initialOpponentMoveSoundForSnapshot([], view, 'black', 'pve')).toBeNull();
  });

  it('defers the hidden PvE opening delta until audio unlock', () => {
    const previousView = makeView({
      status: { type: 'playing', turn: 'white' },
      perspective: 'black',
    });
    const nextView = makeView({
      status: { type: 'playing', turn: 'black' },
      perspective: 'black',
    });

    expect(shouldDeferHiddenPveOpeningSound(previousView, nextView, 'black', 'pve')).toBe(true);
  });

  it('does not defer ordinary later opponent moves', () => {
    const previousView = makeView({
      moveNumber: 2,
      status: { type: 'playing', turn: 'white' },
      perspective: 'black',
    });
    const nextView = makeView({
      moveNumber: 2,
      status: { type: 'playing', turn: 'black' },
      perspective: 'black',
    });

    expect(shouldDeferHiddenPveOpeningSound(previousView, nextView, 'black', 'pve')).toBe(false);
  });
});
