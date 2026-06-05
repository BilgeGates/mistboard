import { beforeEach, describe, expect, it } from 'vitest';
import { liveState, takeRematchCancel } from './live-state.js';
import { rematchControls } from './rematch-controls.js';

function labels(block: HTMLElement): string[] {
  return [...block.querySelectorAll('button')].map((b) => b.textContent ?? '');
}
function noteText(block: HTMLElement): string | null {
  return block.querySelector('.room-rematch-note')?.textContent ?? null;
}
const noop = () => true;

describe('rematchControls', () => {
  beforeEach(() => {
    liveState.rematch = { offers: {}, finalizedRoomId: null };
    takeRematchCancel(); // clear any leaked intent
  });

  it('idle: a single Rematch button, no note', () => {
    const block = rematchControls('white', 'black', noop);
    expect(labels(block)).toEqual(['Rematch']);
    expect(noteText(block)).toBeNull();
  });

  it('after I offer: waiting note + cancel', () => {
    liveState.rematch = { offers: { white: true }, finalizedRoomId: null };
    const block = rematchControls('white', 'black', noop);
    expect(noteText(block)).toBe('Waiting for opponent…');
    expect(labels(block)).toEqual(['Cancel rematch']);
  });

  it('opponent offered: labels the offer, decline + accept side by side in one row', () => {
    liveState.rematch = { offers: { black: true }, finalizedRoomId: null };
    const block = rematchControls('white', 'black', noop);
    expect(noteText(block)).toBe('Your opponent wants a rematch');
    expect(labels(block)).toEqual(['Decline', 'Accept']);
    expect(block.querySelectorAll('.room-rematch-buttons button')).toHaveLength(2);
  });

  it('opponent declined: a clear cue above the Rematch button', () => {
    liveState.rematch = { offers: {}, finalizedRoomId: null, declined: true };
    const block = rematchControls('white', 'black', noop);
    expect(noteText(block)).toBe('Your opponent declined the rematch.');
    expect(labels(block)).toEqual(['Rematch']);
  });

  it('both offered: the starting affordance', () => {
    liveState.rematch = { offers: { white: true, black: true }, finalizedRoomId: null };
    const block = rematchControls('white', 'black', noop);
    expect(labels(block)).toEqual(['Starting rematch…']);
  });

  it('works for red/black seats (Dark Mini Xiangqi)', () => {
    liveState.rematch = { offers: { red: true }, finalizedRoomId: null };
    // I'm black; red (opponent) has offered.
    const block = rematchControls('black', 'red', noop);
    expect(noteText(block)).toBe('Your opponent wants a rematch');
    expect(labels(block)).toEqual(['Decline', 'Accept']);
  });

  it('cancel records intent (so the next state frame is not misread as a decline)', () => {
    liveState.rematch = { offers: { white: true }, finalizedRoomId: null };
    const sent: unknown[] = [];
    const block = rematchControls('white', 'black', (p) => {
      sent.push(p);
      return true;
    });
    block.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(sent).toEqual([{ type: 'rematch:cancel' }]);
    expect(takeRematchCancel()).toBe(true);
  });
});
