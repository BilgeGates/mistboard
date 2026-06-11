// Sound-set registry: which audio source plays each SoundKind.
//
// 'mist' is the default — Mistboard's own WebAudio-synthesized tones in
// live-sound.ts, zero assets. The file sets are lichess's AGPL sets
// (public/sound/<set>/, see CREDITS.md there); they cover the universal
// vocabulary, while the fog-native kinds keep per-kind tweaks (rate/gain)
// so 'captured' stays darker than 'capture' even when both use the same
// source file. A kind with no file entry falls back to the synthesized
// tones, so partial sets degrade to Mist rather than silence.
//
// The policy layer (live-sound.ts) never sees any of this: it picks a
// SoundKind from the player's view; the controller resolves kind -> source.

import type { SoundKind } from './live-state.js';

export type SoundSetId = 'mist' | 'futuristic' | 'nes' | 'piano' | 'sfx';

export const SOUND_SETS: ReadonlyArray<{ id: SoundSetId; label: string }> = [
  { id: 'mist', label: 'Mist (synthesized)' },
  { id: 'futuristic', label: 'Futuristic' },
  { id: 'nes', label: 'NES' },
  { id: 'piano', label: 'Piano' },
  { id: 'sfx', label: 'SFX' },
];

export const DEFAULT_SOUND_SET: SoundSetId = 'mist';

const SOUND_SET_STORAGE_KEY = 'mistboard.soundSet';

export type SoundFileSpec = {
  file: string;
  // Playback-rate tweak: <1 darkens/pitches down. Lets one source file serve
  // two asymmetric kinds (capture vs captured).
  rate?: number;
  gain?: number;
};

// One mapping for all file sets — every set ships the same eight files.
const FILE_BY_KIND: Partial<Record<SoundKind, SoundFileSpec>> = {
  move: { file: 'Move.mp3' },
  capture: { file: 'Capture.mp3' },
  // Losing a piece is the alarm bell of dark chess: same source as capture,
  // pitched down and slightly quieter so it reads as "done to you".
  captured: { file: 'Capture.mp3', rate: 0.72, gain: 0.85 },
  castle: { file: 'Move.mp3' },
  'king-capture': { file: 'Explosion.mp3' },
  win: { file: 'Victory.mp3' },
  lose: { file: 'Defeat.mp3' },
  draw: { file: 'Draw.mp3' },
  'low-time': { file: 'LowTime.mp3' },
  'game-start': { file: 'GenericNotify.mp3' },
};

export function soundFileFor(set: SoundSetId, kind: SoundKind): SoundFileSpec | null {
  if (set === 'mist') return null;
  const spec = FILE_BY_KIND[kind];
  return spec ? { ...spec, file: `/sound/${set}/${spec.file}` } : null;
}

export function readStoredSoundSet(): SoundSetId {
  try {
    const value = window.localStorage.getItem(SOUND_SET_STORAGE_KEY);
    if (value && SOUND_SETS.some((set) => set.id === value)) return value as SoundSetId;
  } catch {
    // storage unavailable -> default
  }
  return DEFAULT_SOUND_SET;
}

export function storeSoundSet(set: SoundSetId): void {
  try {
    window.localStorage.setItem(SOUND_SET_STORAGE_KEY, set);
  } catch {
    // storage unavailable -> ignore
  }
  window.dispatchEvent(new Event(soundSetChangedEvent));
}

export const soundSetChangedEvent = 'mistboard:sound-set-changed';
