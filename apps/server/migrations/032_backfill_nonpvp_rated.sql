-- 032_backfill_nonpvp_rated.sql
-- Migration 015 added games.rated with DEFAULT true, which backfilled EVERY
-- pre-existing game — including PvE and EvE games — to rated=true. That is why
-- old PvE games (e.g. the May-2026 rows) still render "Rated" on profiles even
-- though they were played against an engine.
--
-- The authoritative gate (room-manager buildGameSummary) only treats a game as
-- rated when mode='pvp' AND both seats resolved to real user accounts. Any
-- engine or guest seat forces casual. New games already record this correctly;
-- this migration repairs the legacy source of truth to match.
--
-- Safe by construction: Elo is only ever applied for mode='pvp' AND rated AND
-- both participants are users (persistence-games.ts), so these mislabeled rows
-- never affected the rating store. This only corrects the displayed flag.

UPDATE games
SET rated = false
WHERE rated = true
  AND (
    -- Anything other than a head-to-head human game is casual.
    mode <> 'pvp'
    -- A nominal pvp game with any non-user seat (guest/engine) is also casual.
    OR room_id IN (
      SELECT game_id
      FROM game_participants
      GROUP BY game_id
      HAVING bool_or(subject_type <> 'user')
    )
  );
