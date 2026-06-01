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
    timeControl: game.timeControl ?? clockTimeControlFromGame(game),
    termination: game.termination,
    plyCount: game.plyCount,
  };
}

// Clocked games (PvP/PvE) store their time control in initialMs/incrementMs, not
// the legacy `timeControl` blob (null for them). Rebuild a time-control object so
// the clock label renders and maybeDeriveThinkingBudget treats the game as
// clocked rather than synthesizing a phantom per-move budget from think times.
function clockTimeControlFromGame(game: FeaturedGame): Record<string, unknown> | null {
  if (typeof game.initialMs !== 'number') return null;
  return { initialMs: game.initialMs, incrementMs: game.incrementMs ?? 0 };
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
