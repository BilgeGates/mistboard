import { describe, expect, it } from 'vitest';
import { tonesForSound } from './live-sound.js';

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
