import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SoundKind } from './live-state.js';
import { SOUND_SETS, soundFileFor } from './sound-sets.js';

const ALL_KINDS: SoundKind[] = [
  'move',
  'capture',
  'captured',
  'cannon-capture',
  'castle',
  'king-capture',
  'king-fall',
  'win',
  'lose',
  'draw',
  'low-time',
  'game-start',
];

describe('sound set registry', () => {
  it('every mapped file exists on disk for every file set', () => {
    for (const set of SOUND_SETS) {
      if (set.id === 'mist') continue;
      for (const kind of ALL_KINDS) {
        const spec = soundFileFor(set.id, kind);
        if (!spec) continue; // unmapped kinds fall back to synth by design
        const path = resolve(__dirname, '..', 'public', spec.file.replace(/^\//, ''));
        expect(existsSync(path), `${set.id}/${kind} -> ${spec.file} missing on disk`).toBe(true);
      }
    }
  });

  it('mist resolves no files (pure synth)', () => {
    for (const kind of ALL_KINDS) {
      expect(soundFileFor('mist', kind)).toBeNull();
    }
  });
});
