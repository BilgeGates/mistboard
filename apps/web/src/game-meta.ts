import {
  displayParticipantName,
  type FeaturedGame,
  type GameParticipant,
  participantForColor,
  sourceLabel,
} from './game-display.js';
import type { GameMeta } from './replay.js';

export function gameMetaForGame(game: FeaturedGame): GameMeta {
  return {
    whiteName: withRatingDelta(
      displayParticipantName(game, 'white'),
      participantForColor(game, 'white'),
    ),
    blackName: withRatingDelta(
      displayParticipantName(game, 'black'),
      participantForColor(game, 'black'),
    ),
    gameUrl: reviewUrlForGame(game),
    modeLabel: sourceLabel(game.mode),
    result: game.result,
    timeControl: game.timeControl,
    termination: game.termination,
    plyCount: game.plyCount,
  };
}

export function reviewUrlForGame(game: FeaturedGame): string | null {
  if (game.corpusId === 'replay-samples') return null;
  return `/game/${encodeURIComponent(game.roomId)}`;
}

// Append the post-game rating change to a player's name on the game page, e.g.
// "alice · 1662 (+162)". Only for rated games (both ratings present); casual
// games and engines have no ratingBefore/After, so the name is returned as-is.
function withRatingDelta(name: string, participant: GameParticipant | null): string {
  if (!participant || participant.ratingBefore == null || participant.ratingAfter == null) {
    return name;
  }
  const delta = participant.ratingAfter - participant.ratingBefore;
  const sign = delta >= 0 ? '+' : '';
  return `${name} · ${participant.ratingAfter} (${sign}${delta})`;
}
