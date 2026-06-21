import { getPool } from './persistence-db.js';
import type { GameMode, GameTermination, GameVisibility } from './persistence-game-lifecycle.js';
import type { GameParticipantColor, GameResult, ProfileGameRecord } from './persistence-games.js';
import { attachGameParticipants } from './persistence-games.js';

export type BotOwnerType = 'system' | 'user';

export type BotProfile = {
  id: string;
  displayName: string;
  bio: string;
  ownerType: BotOwnerType;
  ownerUserId: string | null;
  activeEngineId: string;
  defaultGameSpecId: string;
  supportedGameSpecIds: string[];
  play: {
    mode: 'pve';
    gameSpecId: string;
    engineId: string;
    timeControl: {
      initialMs: number;
      incrementMs: number;
    };
    preferredColor: 'random';
  };
  visibility: Extract<GameVisibility, 'private' | 'unlisted' | 'public'>;
  createdAt: Date;
  updatedAt: Date;
};

export type BotModeRecord = {
  games: number;
  wins: number;
  losses: number;
  draws: number;
};

export type BotDirectoryEntry = BotProfile & {
  gamesTotal: number;
  record: BotModeRecord;
};

export type BotProfilePage = BotDirectoryEntry & {
  games: ProfileGameRecord[];
};

type BotProfileRow = {
  id: string;
  display_name: string;
  bio: string;
  owner_type: BotOwnerType;
  owner_user_id: string | null;
  active_engine_id: string;
  default_game_spec_id: string;
  supported_game_spec_ids: string[];
  play_initial_ms: number;
  play_increment_ms: number;
  visibility: BotProfile['visibility'];
  created_at: Date;
  updated_at: Date;
};

type BotDirectoryRow = BotProfileRow & {
  games_total: string;
  wins: string;
  losses: string;
  draws: string;
};

const BOT_GAMES_PAGE = 15;

export async function listPublicBots(): Promise<BotDirectoryEntry[]> {
  const { rows } = await getPool().query<BotDirectoryRow>(
    `SELECT bot_profiles.*,
            COUNT(games.room_id)::text AS games_total,
            COUNT(*) FILTER (
              WHERE games.result = 'draw'
            )::text AS draws,
            COUNT(*) FILTER (
              WHERE games.room_id IS NOT NULL
                AND (
                  (game_participants.color = 'white' AND games.result = 'white-wins')
                  OR (game_participants.color = 'black' AND games.result = 'black-wins')
                  OR (game_participants.color = 'red' AND games.result = 'red-wins')
                )
            )::text AS wins,
            COUNT(*) FILTER (
              WHERE games.room_id IS NOT NULL
                AND games.result <> 'draw'
                AND NOT (
                  (game_participants.color = 'white' AND games.result = 'white-wins')
                  OR (game_participants.color = 'black' AND games.result = 'black-wins')
                  OR (game_participants.color = 'red' AND games.result = 'red-wins')
                )
            )::text AS losses
       FROM bot_profiles
       LEFT JOIN game_participants
         ON game_participants.subject_type = 'bot'
        AND game_participants.subject_id = bot_profiles.id
        AND game_participants.visibility = 'public'
       LEFT JOIN games
         ON games.room_id = game_participants.game_id
        AND games.status = 'completed'
        AND games.visibility = 'public'
      WHERE bot_profiles.visibility = 'public'
      GROUP BY bot_profiles.id
      ORDER BY bot_profiles.display_name`,
  );
  return rows.map((row) => ({
    ...botFromRow(row),
    gamesTotal: Number(row.games_total),
    record: recordFromRow(row),
  }));
}

export async function getPublicBotProfile(botId: string): Promise<BotProfilePage | null> {
  const { rows } = await getPool().query<BotDirectoryRow>(
    `SELECT bot_profiles.*,
            COUNT(games.room_id)::text AS games_total,
            COUNT(*) FILTER (
              WHERE games.result = 'draw'
            )::text AS draws,
            COUNT(*) FILTER (
              WHERE games.room_id IS NOT NULL
                AND (
                  (game_participants.color = 'white' AND games.result = 'white-wins')
                  OR (game_participants.color = 'black' AND games.result = 'black-wins')
                  OR (game_participants.color = 'red' AND games.result = 'red-wins')
                )
            )::text AS wins,
            COUNT(*) FILTER (
              WHERE games.room_id IS NOT NULL
                AND games.result <> 'draw'
                AND NOT (
                  (game_participants.color = 'white' AND games.result = 'white-wins')
                  OR (game_participants.color = 'black' AND games.result = 'black-wins')
                  OR (game_participants.color = 'red' AND games.result = 'red-wins')
                )
            )::text AS losses
       FROM bot_profiles
       LEFT JOIN game_participants
         ON game_participants.subject_type = 'bot'
        AND game_participants.subject_id = bot_profiles.id
        AND game_participants.visibility = 'public'
       LEFT JOIN games
         ON games.room_id = game_participants.game_id
        AND games.status = 'completed'
        AND games.visibility = 'public'
      WHERE bot_profiles.id = $1
        AND bot_profiles.visibility = 'public'
      GROUP BY bot_profiles.id
      LIMIT 1`,
    [botId],
  );
  const row = rows[0];
  if (!row) return null;

  const games = await queryBotGames(botId, BOT_GAMES_PAGE);
  return {
    ...botFromRow(row),
    gamesTotal: Number(row.games_total),
    record: recordFromRow(row),
    games,
  };
}

async function queryBotGames(botId: string, limit: number): Promise<ProfileGameRecord[]> {
  const { rows } = await getPool().query<{
    room_id: string;
    player_color: GameParticipantColor;
    variant: string;
    mode: GameMode;
    result: GameResult;
    termination: GameTermination;
    ply_count: number;
    started_at: Date;
    ended_at: Date;
    white_name: string | null;
    black_name: string | null;
    corpus_id: string | null;
    rated: boolean;
    visibility: GameVisibility;
    initial_ms: number | null;
    increment_ms: number | null;
  }>(
    `SELECT games.room_id,
            game_participants.color AS player_color,
            games.variant,
            games.mode,
            games.result,
            games.termination,
            games.ply_count,
            games.started_at,
            games.ended_at,
            games.white_name,
            games.black_name,
            games.corpus_id,
            COALESCE(games.rated, false) AS rated,
            games.visibility,
            games.initial_ms,
            games.increment_ms
       FROM game_participants
       JOIN games ON games.room_id = game_participants.game_id
      WHERE game_participants.subject_type = 'bot'
        AND game_participants.subject_id = $1
        AND games.status = 'completed'
        AND games.visibility = 'public'
        AND game_participants.visibility = 'public'
      ORDER BY games.ended_at DESC, games.room_id DESC
      LIMIT $2`,
    [botId, Math.max(1, Math.min(limit, 50))],
  );
  return attachGameParticipants(
    rows.map((row) => ({
      roomId: row.room_id,
      playerColor: row.player_color,
      variant: row.variant,
      mode: row.mode,
      result: row.result,
      termination: row.termination,
      plyCount: row.ply_count,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      whiteName: row.white_name,
      blackName: row.black_name,
      corpusId: row.corpus_id,
      rated: row.rated,
      visibility: row.visibility,
      participants: [],
      initialMs: row.initial_ms,
      incrementMs: row.increment_ms,
    })),
  );
}

function botFromRow(row: BotProfileRow): BotProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    bio: row.bio,
    ownerType: row.owner_type,
    ownerUserId: row.owner_user_id,
    activeEngineId: row.active_engine_id,
    defaultGameSpecId: row.default_game_spec_id,
    supportedGameSpecIds: row.supported_game_spec_ids,
    play: {
      mode: 'pve',
      gameSpecId: row.default_game_spec_id,
      engineId: row.active_engine_id,
      timeControl: {
        initialMs: row.play_initial_ms,
        incrementMs: row.play_increment_ms,
      },
      preferredColor: 'random',
    },
    visibility: row.visibility,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function recordFromRow(row: BotDirectoryRow): BotModeRecord {
  return {
    games: Number(row.games_total),
    wins: Number(row.wins),
    losses: Number(row.losses),
    draws: Number(row.draws),
  };
}
