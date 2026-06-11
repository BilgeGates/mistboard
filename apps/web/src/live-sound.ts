// Sound subsystem for the live game UI. Extracted from live-render.ts.
//
// Owns the audio context, volume tracking, and the policy that decides which
// sound (move, capture, captured, king-capture, castle, win, lose) to play
// for a given event sequence. Live-render and replay-of-live consume this
// via the exported `sound` instance + `maybePlaySnapshotSound` and
// `soundForOwnMove` helpers.

import {
  type Board,
  type Color,
  type GameEvent,
  type Move,
  type PlayerView,
  replayGameEvents,
  type Square,
} from '@mistboard/game';
import {
  liveState,
  type RoomMode,
  type Seat,
  type SoundController,
  type SoundKind,
} from './live-state.js';
import {
  readStoredSoundSet,
  type SoundSetId,
  soundFileFor,
  soundSetChangedEvent,
} from './sound-sets.js';
import { readEffectiveSoundVolume, soundSettingsChangedEvent } from './theme.js';
import { files, isColor } from './web-utils.js';

const SOUND_MASTER_GAIN = 7.5;

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

// Terminal sequencing, shared across game families. A king capture is its own
// fanfare for the winner (the submit-time arpeggio already played), so the win
// jingle is suppressed; for the loser it becomes a king-fall sting, then the
// defeat sound after a beat — capture-death should feel different from
// flag-fall. Pure; exported for tests and the family observers.
export function terminalSoundPlan(
  result: 'win' | 'lose' | 'draw',
  reason: string | null,
): Array<{ kind: SoundKind; delayMs: number }> {
  if (result === 'draw') return [{ kind: 'draw', delayMs: 0 }];
  const kingFell = reason === 'king-captured' || reason === 'general-captured';
  if (result === 'win') return kingFell ? [] : [{ kind: 'win', delayMs: 0 }];
  return kingFell
    ? [
        { kind: 'king-fall', delayMs: 0 },
        { kind: 'lose', delayMs: 550 },
      ]
    : [{ kind: 'lose', delayMs: 0 }];
}

export function playTerminalPlan(result: 'win' | 'lose' | 'draw', reason: string | null): void {
  for (const step of terminalSoundPlan(result, reason)) {
    if (step.delayMs > 0) {
      window.setTimeout(() => sound?.play(step.kind), step.delayMs);
    } else {
      sound?.play(step.kind);
    }
  }
}

// Low-time warning: once per game, when the seated player's clock first dips
// below the threshold during live play. Threshold scales with the time
// control (10% of initial), clamped to 10..30s. Keyed by game id so rematches
// re-arm and room remounts do not re-fire.
let lowTimeFiredGameId: string | null = null;

export function maybePlayLowTimeSound(
  gameId: string,
  remainingMs: number,
  initialMs: number | null,
): void {
  if (lowTimeFiredGameId === gameId) return;
  const threshold = Math.min(30_000, Math.max(10_000, (initialMs ?? 150_000) * 0.1));
  if (remainingMs <= 0 || remainingMs > threshold) return;
  lowTimeFiredGameId = gameId;
  sound?.play('low-time');
}

// Game start: the moment the room flips from "waiting for opponent" (no clock
// yet) to a running game while you hold a seat. The joiner triggered the flip
// themselves; this is for the creator who has been waiting.
function isGameStartTransition(previous: PlayerView | null, next: PlayerView | null): boolean {
  if (!previous || !next) return false;
  if (!isColor(liveState.seat)) return false;
  return !previous.clock && !!next.clock && next.status.type === 'playing';
}

export function maybePlaySnapshotSound(nextEvents: GameEvent[], nextView: PlayerView | null): void {
  if (lastSoundEventCount === null) {
    lastSoundEventCount = nextEvents.length;
    lastTerminalSound = terminalSoundKey(nextEvents, nextView);
    lastSoundView = nextView;
    maybePlayInitialOpponentMove(nextEvents, nextView);
    return;
  }

  const terminal = terminalSoundKey(nextEvents, nextView);
  if (terminal && terminal !== lastTerminalSound) {
    lastTerminalSound = terminal;
    const result = terminal.startsWith('win')
      ? 'win'
      : terminal.startsWith('draw')
        ? 'draw'
        : 'lose';
    const reason = nextView?.status.type === 'finished' ? nextView.status.reason : null;
    playTerminalPlan(result, reason);
    lastSoundEventCount = nextEvents.length;
    lastSoundView = nextView;
    return;
  }

  if (isGameStartTransition(lastSoundView, nextView)) {
    sound?.play('game-start');
  } else if (shouldUseRevealedEventSounds(nextView)) {
    playRevealedEventSound(nextEvents);
  } else {
    playSanitizedOpponentSound(lastSoundView, nextView);
  }

  lastSoundEventCount = nextEvents.length;
  lastSoundView = nextView;
}

// PvE with the engine on White can reach the room before the page has an
// unlocked AudioContext. Sound the single opening move with playWhenUnlocked so
// browser autoplay policy does not swallow it. Live fog snapshots intentionally
// filter opponent move events, so the hidden-opening case is inferred from the
// black-to-move player view rather than from canonical event history.
function maybePlayInitialOpponentMove(events: GameEvent[], view: PlayerView | null): void {
  const kind = initialOpponentMoveSoundForSnapshot(
    events,
    view,
    liveState.seat,
    liveState.roomMode,
  );
  if (kind) sound?.playWhenUnlocked(kind);
}

export function initialOpponentMoveSoundForSnapshot(
  events: GameEvent[],
  view: PlayerView | null,
  seat: Seat,
  roomMode: RoomMode,
): SoundKind | null {
  if (!isColor(seat) || !view) return null;
  if (view.status.type !== 'playing' || view.status.turn !== seat) return null;
  let moveIndex = -1;
  for (let index = 0; index < events.length; index += 1) {
    if (events[index]?.type !== 'move-played') continue;
    if (moveIndex >= 0) return null; // more than one move -> not a fresh opening
    moveIndex = index;
  }
  if (moveIndex < 0) {
    return isHiddenPveOpeningReply(view, seat, roomMode) ? 'move' : null;
  }

  const moveEvent = events[moveIndex]!;
  if (moveEvent.type !== 'move-played' || moveEvent.color === seat) return null;
  return soundForMove(events.slice(0, moveIndex), moveEvent);
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
  if (piece.role === 'pawn' && squareFileIndex(move.from) !== squareFileIndex(move.to))
    return 'capture';
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
  let activeSet: SoundSetId = readStoredSoundSet();

  const ensureContext = (): AudioContext | null => {
    const AudioCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return null;
    ctx ??= new AudioCtor();
    return ctx;
  };

  // Decoded file-set buffers, keyed by URL. A kind whose buffer hasn't
  // finished decoding falls back to the synthesized tones for that one play,
  // so switching sets never produces silence.
  const buffers = new Map<string, AudioBuffer | 'loading'>();

  const preloadActiveSet = (): void => {
    const audio = ensureContext();
    if (!audio || activeSet === 'mist') return;
    for (const kind of [
      'move',
      'capture',
      'captured',
      'castle',
      'king-capture',
      'win',
      'lose',
      'draw',
      'low-time',
      'game-start',
    ] as SoundKind[]) {
      const spec = soundFileFor(activeSet, kind);
      if (!spec || buffers.has(spec.file)) continue;
      buffers.set(spec.file, 'loading');
      void fetch(spec.file)
        .then((resp) =>
          resp.ok ? resp.arrayBuffer() : Promise.reject(new Error(`${resp.status}`)),
        )
        .then((data) => audio.decodeAudioData(data))
        .then((buffer) => buffers.set(spec.file, buffer))
        .catch(() => buffers.delete(spec.file));
    }
  };

  let pendingKind: SoundKind | null = null;

  const unlock = () => {
    const audio = ensureContext();
    if (!audio) return;
    unlocked = true;
    void audio.resume();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    if (pendingKind) {
      const kind = pendingKind;
      pendingKind = null;
      controller.play(kind);
    }
  };

  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  window.addEventListener(soundSettingsChangedEvent, () => {
    volume = readEffectiveSoundVolume();
  });
  window.addEventListener(soundSetChangedEvent, () => {
    activeSet = readStoredSoundSet();
    preloadActiveSet();
  });
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key.startsWith('mistboard.sound')) {
      volume = readEffectiveSoundVolume();
      activeSet = readStoredSoundSet();
      preloadActiveSet();
    }
  });

  const playTones = (audio: AudioContext, kind: SoundKind): void => {
    const now = audio.currentTime;
    for (const tone of tonesForSound(kind)) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = tone.type;
      osc.frequency.setValueAtTime(tone.frequency, now + tone.delay);
      gain.gain.setValueAtTime(0.0001, now + tone.delay);
      gain.gain.exponentialRampToValueAtTime(
        tone.gain * volume * SOUND_MASTER_GAIN,
        now + tone.delay + 0.012,
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.delay + tone.duration);
      osc.connect(gain).connect(audio.destination);
      osc.start(now + tone.delay);
      osc.stop(now + tone.delay + tone.duration + 0.03);
    }
  };

  const controller: SoundController = {
    play(kind) {
      const audio = ensureContext();
      if (!audio || !unlocked) return;
      if (volume <= 0) return;
      void audio.resume();
      const spec = soundFileFor(activeSet, kind);
      const buffer = spec ? buffers.get(spec.file) : undefined;
      if (spec && buffer && buffer !== 'loading') {
        const source = audio.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = spec.rate ?? 1;
        const gain = audio.createGain();
        gain.gain.value = volume * (spec.gain ?? 1);
        source.connect(gain).connect(audio.destination);
        source.start();
        return;
      }
      if (spec && buffer === undefined) preloadActiveSet();
      playTones(audio, kind);
    },
    playWhenUnlocked(kind) {
      if (unlocked) {
        controller.play(kind);
        return;
      }
      pendingKind = kind;
    },
  };

  // If the document already has sticky user activation — e.g. we SPA-navigated
  // into the room from a "Play" click in the same document — the AudioContext is
  // allowed to resume now. Unlock immediately so the engine's opening move is
  // audible without requiring a fresh in-room gesture. On a cold document load
  // (pasted URL / refresh) hasBeenActive is false, so we stay locked and the
  // first move stays deferred until the visitor interacts — the only behavior
  // browser autoplay policy permits there.
  if (navigator.userActivation?.hasBeenActive) {
    unlock();
  }

  preloadActiveSet();

  return controller;
}

export type SoundTone = {
  delay: number;
  duration: number;
  frequency: number;
  gain: number;
  type: OscillatorType;
};

export function tonesForSound(kind: SoundKind): SoundTone[] {
  if (kind === 'capture')
    return [{ delay: 0, duration: 0.11, frequency: 180, gain: 0.075, type: 'triangle' }];
  if (kind === 'captured')
    return [{ delay: 0, duration: 0.085, frequency: 130, gain: 0.04, type: 'sine' }];
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
      { delay: 0, duration: 0.11, frequency: 392, gain: 0.045, type: 'sine' },
      { delay: 0.1, duration: 0.15, frequency: 493.88, gain: 0.045, type: 'sine' },
      { delay: 0.22, duration: 0.24, frequency: 659.25, gain: 0.042, type: 'sine' },
    ];
  }
  if (kind === 'lose') {
    return [
      { delay: 0, duration: 0.14, frequency: 246.94, gain: 0.038, type: 'triangle' },
      { delay: 0.13, duration: 0.22, frequency: 196, gain: 0.034, type: 'triangle' },
    ];
  }
  if (kind === 'king-fall') {
    // The king-capture arpeggio inverted: a descending minor fall.
    return [
      { delay: 0, duration: 0.12, frequency: 659.25, gain: 0.06, type: 'triangle' },
      { delay: 0.08, duration: 0.13, frequency: 523.25, gain: 0.06, type: 'triangle' },
      { delay: 0.17, duration: 0.16, frequency: 392, gain: 0.06, type: 'triangle' },
      { delay: 0.27, duration: 0.26, frequency: 261.63, gain: 0.066, type: 'triangle' },
    ];
  }
  if (kind === 'cannon-capture') {
    // A short crack over a low boom: the slam-the-board cannon capture.
    return [
      { delay: 0, duration: 0.05, frequency: 220, gain: 0.07, type: 'square' },
      { delay: 0.02, duration: 0.24, frequency: 68, gain: 0.1, type: 'sine' },
    ];
  }
  if (kind === 'draw') {
    return [
      { delay: 0, duration: 0.14, frequency: 329.63, gain: 0.04, type: 'sine' },
      { delay: 0.14, duration: 0.2, frequency: 329.63, gain: 0.036, type: 'sine' },
    ];
  }
  if (kind === 'low-time') {
    return [
      { delay: 0, duration: 0.05, frequency: 880, gain: 0.05, type: 'square' },
      { delay: 0.09, duration: 0.05, frequency: 880, gain: 0.05, type: 'square' },
    ];
  }
  if (kind === 'game-start') {
    return [
      { delay: 0, duration: 0.1, frequency: 392, gain: 0.045, type: 'sine' },
      { delay: 0.09, duration: 0.16, frequency: 523.25, gain: 0.045, type: 'sine' },
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

export function soundForMove(
  beforeEvents: GameEvent[],
  event: Extract<GameEvent, { type: 'move-played' }>,
): SoundKind {
  const before = replayGameEvents(beforeEvents).state;
  if (isCastleMoveOnBoard(before.board, event.move, event.color)) return 'castle';
  const captured = before.board[event.move.to];
  if (!captured) return 'move';
  if (captured.color === event.color) return 'move';
  if (liveState.seat !== 'spectator' && captured.color === liveState.seat) return 'captured';
  if (captured.role === 'king') return 'king-capture';
  return 'capture';
}

function playSanitizedOpponentSound(
  previousView: PlayerView | null,
  nextView: PlayerView | null,
): void {
  if (!isColor(liveState.seat) || !previousView || !nextView) return;
  if (previousView.status.type !== 'playing') return;
  if (previousView.status.turn === liveState.seat) return;
  if (nextView.status.type === 'playing' && nextView.status.turn !== liveState.seat) return;

  const kind =
    ownPieceCount(nextView, liveState.seat) < ownPieceCount(previousView, liveState.seat)
      ? 'captured'
      : 'move';
  if (
    shouldDeferHiddenPveOpeningSound(previousView, nextView, liveState.seat, liveState.roomMode)
  ) {
    sound?.playWhenUnlocked(kind);
    return;
  }
  sound?.play(kind);
}

export function shouldDeferHiddenPveOpeningSound(
  previousView: PlayerView | null,
  nextView: PlayerView | null,
  seat: Seat,
  roomMode: RoomMode,
): boolean {
  if (roomMode !== 'pve' || seat !== 'black') return false;
  if (!previousView || !nextView) return false;
  if (previousView.variant !== 'dark-chess' || nextView.variant !== 'dark-chess') return false;
  if (previousView.moveNumber !== 1 || nextView.moveNumber !== 1) return false;
  if (previousView.status.type !== 'playing' || nextView.status.type !== 'playing') return false;
  return previousView.status.turn === 'white' && nextView.status.turn === 'black';
}

function isHiddenPveOpeningReply(view: PlayerView, seat: Seat, roomMode: RoomMode): boolean {
  if (roomMode !== 'pve' || seat !== 'black') return false;
  if (view.variant !== 'dark-chess') return false;
  if (view.status.type !== 'playing') return false;
  return view.status.turn === 'black' && view.moveNumber === 1;
}

function isCastleMoveInView(view: PlayerView, move: Move, color: Color): boolean {
  return isCastleMoveOnBoard(view.board, move, color);
}

function isCastleMoveOnBoard(board: Board, move: Move, color: Color): boolean {
  const piece = board[move.from];
  if (!piece || piece.role !== 'king' || piece.color !== color) return false;
  const target = board[move.to];
  if (target?.role === 'rook' && target.color === color) return true;
  return (
    rankOf(move.from) === rankOf(move.to) &&
    Math.abs(squareFileIndex(move.to) - squareFileIndex(move.from)) > 1 &&
    (move.to[0] === 'c' || move.to[0] === 'g')
  );
}

function terminalSoundKey(nextEvents: GameEvent[], nextView: PlayerView | null): string | null {
  const status = nextView?.status ?? replayGameEvents(nextEvents).state.status;
  if (status.type !== 'finished' || liveState.seat === 'spectator') return null;
  if (status.winner === null) return `draw:${nextEvents.length}`;
  return status.winner === liveState.seat
    ? `win:${nextEvents.length}`
    : `lose:${nextEvents.length}`;
}

function squareFileIndex(square: Square): number {
  return files.indexOf(square[0] as (typeof files)[number]);
}

function rankOf(square: Square): string {
  return square[1] ?? '';
}
