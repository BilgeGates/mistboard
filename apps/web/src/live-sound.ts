// Sound subsystem for the live game UI. Extracted from live-render.ts.
//
// Owns the audio context, volume tracking, and the policy that decides which
// sound (move, capture, captured, king-capture, castle, win, lose) to play
// for a given event sequence. Live-render and replay-of-live consume this
// via the exported `sound` instance + `maybePlaySnapshotSound` and
// `soundForOwnMove` helpers.

import { replayGameEvents, type Board, type Color, type GameEvent, type Move, type PlayerView, type Square } from '@mistboard/game';
import { liveState, type SoundController, type SoundKind } from './live-state.js';
import { readEffectiveSoundVolume, soundSettingsChangedEvent } from './theme.js';
import { isColor, files } from './web-utils.js';

const SOUND_MASTER_GAIN = 4;

let sound: SoundController | null = null;
let lastSoundEventCount: number | null = null;
let lastTerminalSound: string | null = null;
let lastSoundView: PlayerView | null = null;

export function initLiveSound(): void {
  if (sound) return;
  sound = createSoundController();
}

// Reset sound-state observers between live-room mounts so a re-entered room
// doesn't re-fire a "win" sound on the first snapshot.
export function resetLiveSoundState(): void {
  lastSoundEventCount = null;
  lastTerminalSound = null;
  lastSoundView = null;
}

export function playSound(kind: SoundKind): void {
  sound?.play(kind);
}

export function maybePlaySnapshotSound(nextEvents: GameEvent[], nextView: PlayerView | null): void {
  if (lastSoundEventCount === null) {
    lastSoundEventCount = nextEvents.length;
    lastTerminalSound = terminalSoundKey(nextEvents, nextView);
    lastSoundView = nextView;
    return;
  }

  const terminal = terminalSoundKey(nextEvents, nextView);
  if (terminal && terminal !== lastTerminalSound) {
    lastTerminalSound = terminal;
    sound?.play(terminal.startsWith('win') ? 'win' : 'lose');
    lastSoundEventCount = nextEvents.length;
    lastSoundView = nextView;
    return;
  }

  if (shouldUseRevealedEventSounds(nextView)) {
    playRevealedEventSound(nextEvents);
  } else {
    playSanitizedOpponentSound(lastSoundView, nextView);
  }

  lastSoundEventCount = nextEvents.length;
  lastSoundView = nextView;
}

export function soundForOwnMove(view: PlayerView | null, move: Move): SoundKind {
  if (!view) return 'move';
  const piece = view.board[move.from];
  if (!piece) return 'move';
  if (isCastleMoveInView(view, move, piece.color)) return 'castle';

  const target = view.board[move.to];
  if (target && target.color !== piece.color) {
    return target.role === 'king' ? 'king-capture' : 'capture';
  }
  if (piece.role === 'pawn' && squareFileIndex(move.from) !== squareFileIndex(move.to)) return 'capture';
  return 'move';
}

// Exposed for live-render's replay-of-live keyboard handler — it needs the
// same own-piece-count diff logic to pick 'captured' vs 'move' on a step.
export function ownPieceCount(view: PlayerView, color: Color): number {
  return Object.values(view.board).filter((piece) => piece?.color === color).length;
}

function createSoundController(): SoundController {
  let ctx: AudioContext | null = null;
  let unlocked = false;
  let volume = readEffectiveSoundVolume();

  const ensureContext = (): AudioContext | null => {
    const AudioCtor = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!AudioCtor) return null;
    ctx ??= new AudioCtor();
    return ctx;
  };

  const unlock = () => {
    const audio = ensureContext();
    if (!audio) return;
    unlocked = true;
    void audio.resume();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };

  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  window.addEventListener(soundSettingsChangedEvent, () => {
    volume = readEffectiveSoundVolume();
  });
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key.startsWith('mistboard.sound')) {
      volume = readEffectiveSoundVolume();
    }
  });

  return {
    play(kind) {
      const audio = ensureContext();
      if (!audio || !unlocked) return;
      if (volume <= 0) return;
      void audio.resume();
      const now = audio.currentTime;
      for (const tone of tonesForSound(kind)) {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = tone.type;
        osc.frequency.setValueAtTime(tone.frequency, now + tone.delay);
        gain.gain.setValueAtTime(0.0001, now + tone.delay);
        gain.gain.exponentialRampToValueAtTime(tone.gain * volume * SOUND_MASTER_GAIN, now + tone.delay + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.delay + tone.duration);
        osc.connect(gain).connect(audio.destination);
        osc.start(now + tone.delay);
        osc.stop(now + tone.delay + tone.duration + 0.03);
      }
    },
  };
}

function tonesForSound(kind: SoundKind): Array<{
  delay: number;
  duration: number;
  frequency: number;
  gain: number;
  type: OscillatorType;
}> {
  if (kind === 'capture') return [{ delay: 0, duration: 0.11, frequency: 180, gain: 0.075, type: 'triangle' }];
  if (kind === 'captured') return [{ delay: 0, duration: 0.085, frequency: 130, gain: 0.04, type: 'sine' }];
  if (kind === 'king-capture') {
    return [
      { delay: 0, duration: 0.1, frequency: 523.25, gain: 0.065, type: 'triangle' },
      { delay: 0.07, duration: 0.12, frequency: 659.25, gain: 0.065, type: 'triangle' },
      { delay: 0.15, duration: 0.14, frequency: 783.99, gain: 0.065, type: 'triangle' },
      { delay: 0.24, duration: 0.28, frequency: 1046.5, gain: 0.075, type: 'triangle' },
    ];
  }
  if (kind === 'castle') {
    return [
      { delay: 0, duration: 0.1, frequency: 260, gain: 0.055, type: 'square' },
      { delay: 0.08, duration: 0.12, frequency: 390, gain: 0.05, type: 'square' },
    ];
  }
  if (kind === 'win') {
    return [
      { delay: 0, duration: 0.12, frequency: 440, gain: 0.06, type: 'sine' },
      { delay: 0.1, duration: 0.16, frequency: 660, gain: 0.06, type: 'sine' },
      { delay: 0.22, duration: 0.2, frequency: 880, gain: 0.055, type: 'sine' },
    ];
  }
  if (kind === 'lose') {
    return [
      { delay: 0, duration: 0.16, frequency: 220, gain: 0.06, type: 'triangle' },
      { delay: 0.14, duration: 0.24, frequency: 146.8, gain: 0.055, type: 'triangle' },
    ];
  }
  return [{ delay: 0, duration: 0.09, frequency: 320, gain: 0.055, type: 'sine' }];
}

function shouldUseRevealedEventSounds(nextView: PlayerView | null): boolean {
  return liveState.roomMode === 'eve' || nextView?.status.type === 'finished';
}

function playRevealedEventSound(nextEvents: GameEvent[]): void {
  if (nextEvents.length <= (lastSoundEventCount ?? 0)) return;

  let latestMoveIndex = -1;
  for (let index = nextEvents.length - 1; index >= (lastSoundEventCount ?? 0); index -= 1) {
    if (nextEvents[index]?.type === 'move-played') {
      latestMoveIndex = index;
      break;
    }
  }
  if (latestMoveIndex >= 0) {
    const moveEvent = nextEvents[latestMoveIndex]!;
    if (moveEvent.type === 'move-played') {
      sound?.play(soundForMove(nextEvents.slice(0, latestMoveIndex), moveEvent));
    }
  }
}

export function soundForMove(beforeEvents: GameEvent[], event: Extract<GameEvent, { type: 'move-played' }>): SoundKind {
  const before = replayGameEvents(beforeEvents).state;
  if (isCastleMoveOnBoard(before.board, event.move, event.color)) return 'castle';
  const captured = before.board[event.move.to];
  if (!captured) return 'move';
  if (captured.color === event.color) return 'move';
  if (liveState.seat !== 'spectator' && captured.color === liveState.seat) return 'captured';
  if (captured.role === 'king') return 'king-capture';
  return 'capture';
}

function playSanitizedOpponentSound(previousView: PlayerView | null, nextView: PlayerView | null): void {
  if (!isColor(liveState.seat) || !previousView || !nextView) return;
  if (previousView.status.type !== 'playing') return;
  if (previousView.status.turn === liveState.seat) return;
  if (nextView.status.type === 'playing' && nextView.status.turn !== liveState.seat) return;

  sound?.play(ownPieceCount(nextView, liveState.seat) < ownPieceCount(previousView, liveState.seat) ? 'captured' : 'move');
}

function isCastleMoveInView(view: PlayerView, move: Move, color: Color): boolean {
  return isCastleMoveOnBoard(view.board, move, color);
}

function isCastleMoveOnBoard(board: Board, move: Move, color: Color): boolean {
  const piece = board[move.from];
  if (!piece || piece.role !== 'king' || piece.color !== color) return false;
  const target = board[move.to];
  if (target?.role === 'rook' && target.color === color) return true;
  return rankOf(move.from) === rankOf(move.to)
    && Math.abs(squareFileIndex(move.to) - squareFileIndex(move.from)) > 1
    && (move.to[0] === 'c' || move.to[0] === 'g');
}

function terminalSoundKey(nextEvents: GameEvent[], nextView: PlayerView | null): string | null {
  const status = nextView?.status ?? replayGameEvents(nextEvents).state.status;
  if (status.type !== 'finished' || liveState.seat === 'spectator' || status.winner === null) return null;
  return status.winner === liveState.seat ? `win:${nextEvents.length}` : `lose:${nextEvents.length}`;
}

function squareFileIndex(square: Square): number {
  return files.indexOf(square[0] as typeof files[number]);
}

function rankOf(square: Square): string {
  return square[1] ?? '';
}
