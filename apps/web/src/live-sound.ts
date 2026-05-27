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
import { readEffectiveSoundVolume, soundSettingsChangedEvent } from './theme.js';
import { files, isColor } from './web-utils.js';

const SOUND_MASTER_GAIN = 5.5;

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
    maybePlayInitialOpponentMove(nextEvents, nextView);
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

  const ensureContext = (): AudioContext | null => {
    const AudioCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return null;
    ctx ??= new AudioCtor();
    return ctx;
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
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key.startsWith('mistboard.sound')) {
      volume = readEffectiveSoundVolume();
    }
  });

  const controller: SoundController = {
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
        gain.gain.exponentialRampToValueAtTime(
          tone.gain * volume * SOUND_MASTER_GAIN,
          now + tone.delay + 0.012,
        );
        gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.delay + tone.duration);
        osc.connect(gain).connect(audio.destination);
        osc.start(now + tone.delay);
        osc.stop(now + tone.delay + tone.duration + 0.03);
      }
    },
    playWhenUnlocked(kind) {
      if (unlocked) {
        controller.play(kind);
        return;
      }
      pendingKind = kind;
    },
  };
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
  if (status.type !== 'finished' || liveState.seat === 'spectator' || status.winner === null)
    return null;
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
