import type { Color, GameEndReason, PlayerView } from '@mistboard/game';
import type { ConnectionNoticeTier, InfoTone, Seat } from './live-state.js';
import { liveState } from './live-state.js';
import { isColor } from './web-utils.js';

// Staged visibility for a connection problem. A mid-game socket drop usually
// recovers in well under a second, so 'disconnected'/'reconnecting' only earn the
// full notice once the live-socket timers have escalated them; until then the
// player's own presence dot carries the signal (or, in the grace window, nothing
// shows at all). Terminal/pre-board states ('connecting' on first load,
// 'displaced', 'rejected') always warrant the full notice.
export function connectionNoticeMode(): ConnectionNoticeTier {
  const state = liveState.connectionState;
  if (state === 'connected') return 'none';
  if (state === 'displaced' || state === 'rejected' || state === 'connecting') return 'banner';
  return liveState.connectionNoticeTier;
}

export function actionTone(view: PlayerView | null): InfoTone {
  if (connectionNoticeMode() === 'banner') {
    return liveState.connectionState === 'connecting' ||
      liveState.connectionState === 'reconnecting'
      ? 'pending'
      : 'danger';
  }
  if (!view) return 'pending';
  if (view.status.type === 'finished') {
    const seat = liveState.seat;
    if (seat === 'white' || seat === 'black') {
      if (view.status.winner === null) return 'default';
      return view.status.winner === seat ? 'success' : 'danger';
    }
    return 'default';
  }
  if (liveState.seat === 'spectator') return 'default';
  if (view.status.type === 'playing' && view.status.turn === pveEngineSeat()) return 'pending';
  if (view.status.type === 'playing' && view.status.turn === liveState.seat) return 'success';
  return 'default';
}

export function actionTitle(view: PlayerView | null): string {
  if (connectionNoticeMode() === 'banner') {
    if (liveState.connectionState === 'rejected') return 'Access rejected';
    if (liveState.connectionState === 'displaced') return 'Session moved';
    if (liveState.connectionState === 'connecting') return 'Connecting';
    return 'Reconnecting';
  }
  if (!view) return 'Connecting';
  if (view.status.type === 'finished') return finishedTitle(view.status.winner);
  if (view.status.type === 'aborted') return 'Game aborted';
  if (liveState.seat === 'spectator') return 'Watching';
  if (view.status.type === 'pregame') {
    if (liveState.roomMode === 'pvp' && isColor(liveState.seat)) {
      const theirSeat: Color = liveState.seat === 'white' ? 'black' : 'white';
      if (liveState.connectedSeats[theirSeat]) return 'Opponent connected';
    }
    return liveState.roomMode === 'pvp' ? 'Waiting for opponent' : 'Preparing game';
  }
  if (view.status.type === 'playing' && view.status.turn === pveEngineSeat())
    return 'Engine thinking';
  if (view.status.type === 'playing' && view.status.turn === liveState.seat) return 'Your move';
  return 'Opponent move';
}

export function actionBody(
  view: PlayerView | null,
  options: { hasVisibleDraftData: boolean },
): string {
  if (connectionNoticeMode() === 'banner') {
    if (liveState.connectionState === 'rejected') return rejectedBody();
    if (liveState.connectionState === 'displaced')
      return 'A newer tab is now controlling this seat.';
    if (liveState.connectionState === 'disconnected')
      return 'The socket closed. Mistboard will retry automatically.';
    if (liveState.connectionState === 'reconnecting')
      return 'Trying to restore your room state and seat.';
    return 'Opening the room and loading the current server state.';
  }
  if (!view) return 'Opening the room and loading the current server state.';
  if (view.status.type === 'finished') {
    return finishedBody(view.status.winner, view.status.reason);
  }
  if (view.status.type === 'aborted') {
    return 'This game was aborted before either side committed to it. No result was recorded.';
  }
  if (liveState.seat === 'spectator') return spectatorBody(view);
  if (view.status.type === 'pregame') {
    if (liveState.roomMode === 'pvp' && isColor(liveState.seat)) {
      const theirSeat: Color = liveState.seat === 'white' ? 'black' : 'white';
      if (liveState.connectedSeats[theirSeat]) {
        return options.hasVisibleDraftData
          ? 'Choose your starting position from the options on the board.'
          : 'Both players connected. Game starting.';
      }
      return 'Share the invite link below to invite your opponent.';
    }
    return 'Share the room link when you are ready.';
  }
  if (view.status.type === 'playing' && view.status.turn === pveEngineSeat()) {
    return 'The engine is on its own clock. Your clock resumes after its move.';
  }
  if (view.status.type === 'playing' && view.status.turn === liveState.seat) {
    return 'Move one of your visible pieces on the board.';
  }
  return `${capitalize(view.status.turn)} is on move.`;
}

export function boardStatusLabel(): string {
  if (liveState.connectionState === 'rejected') return 'Access rejected';
  if (liveState.connectionState === 'displaced') return 'Session moved';
  if (liveState.connectionState === 'disconnected' || liveState.connectionState === 'reconnecting')
    return 'Reconnecting';
  return liveState.clientId ? 'Waiting for board' : 'Connecting';
}

export function boardStatusTone(): 'pending' | 'danger' {
  if (liveState.connectionState === 'rejected') return 'danger';
  if (liveState.connectionState === 'displaced') return 'danger';
  if (liveState.connectionState === 'disconnected') return 'danger';
  return 'pending';
}

export function modeLabel(): string {
  if (liveState.solo) return 'Solo dev';
  if (liveState.roomMode === 'pve') return 'Play engine';
  if (liveState.roomMode === 'pvp') return 'Friend challenge';
  if (liveState.roomMode === 'eve') return 'Engine game';
  return capitalize(liveState.roomMode);
}

export function seatLabel(value: Seat): string {
  if (liveState.solo) return 'Solo dev';
  if (value === 'spectator') return 'Spectator';
  return capitalize(value);
}

function pveEngineSeat(): Color | null {
  if (liveState.roomMode !== 'pve') return null;
  if (!isColor(liveState.seat)) return null;
  return liveState.seat === 'white' ? 'black' : 'white';
}

function spectatorBody(view: PlayerView): string {
  if (view.status.type === 'finished') return 'Open Review game to see the full board.';
  if (liveState.clientCount < 3 && liveState.roomMode === 'pvp')
    return 'Waiting for both player seats to be filled.';
  return 'Spectators receive a public Fog view while the game is live.';
}

function resultTitle(winner: Color | null): string {
  if (winner === 'white') return 'White wins';
  if (winner === 'black') return 'Black wins';
  return 'Draw';
}

function finishedTitle(winner: Color | null): string {
  const seat = liveState.seat;
  if (seat === 'white' || seat === 'black') {
    if (winner === null) return 'Draw';
    return winner === seat ? 'You won' : 'You lost';
  }
  return resultTitle(winner);
}

function finishedBody(winner: Color | null, reason: GameEndReason): string {
  const reasonPhrase = reasonPhraseLabel(reason);
  const seat = liveState.seat;
  if (seat === 'white' || seat === 'black') {
    if (winner === null) return `${capitalize(reasonPhrase)}.`;
    const youWon = winner === seat;
    if (reason === 'resignation') return youWon ? 'Opponent resigned.' : 'You resigned.';
    if (reason === 'timeout') return youWon ? 'Opponent ran out of time.' : 'You ran out of time.';
    if (reason === 'abandonment' && liveState.roomMode === 'pve') {
      return youWon ? 'The engine forfeited.' : 'You forfeited.';
    }
    return `${youWon ? 'You won' : 'Opponent won'} by ${reasonPhrase}.`;
  }
  if (winner === null) return `${capitalize(reasonPhrase)}.`;
  return `${capitalize(winner)} wins by ${reasonPhrase}.`;
}

function reasonPhraseLabel(reason: GameEndReason): string {
  if (reason === 'king-captured') return 'king capture';
  if (reason === 'draw') return 'draw';
  return reason;
}

function rejectedBody(): string {
  if (liveState.closeReason === 'private room')
    return 'This game is in progress. Mistboard never shares live game state with anyone but the seated players. The full replay will be here once the game finishes.';
  if (liveState.closeReason === 'rated requires account')
    return 'This is a rated game. Rated games count toward the dark chess ladder, so both players need an account. Sign in or create one, then reopen the invite to take your seat.';
  if (liveState.closeReason === 'origin not allowed')
    return 'This browser origin is not allowed to open the room.';
  if (liveState.closeReason === 'rate limit')
    return 'The room connection was closed after too many messages.';
  return 'The server rejected this room connection.';
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
