-- 109_pvp_games_public.sql
-- Publish existing private human-vs-human games (no more private games).
--
-- Human PvP games used to persist as visibility='private' (bot/PvE games were
-- already 'public'), so they never showed up in the games DB, watch feed, or
-- the public /stats "public games" count. The tenant persistence layer now
-- writes 'public' for every finished game; this backfills the rows that landed
-- before that flip.
--
-- SCOPE: mode='pvp' only. That is exactly the human-vs-human set. It leaves
-- untouched every deliberately non-public row that is NOT a live PvP game:
--   * imported / historical corpora, which default to 'unlisted' (license
--     gate) and are mode='imported', never 'pvp';
--   * any 'link'/'unlisted' rows shared by URL rather than listed.
-- Fog variants are included: this only concerns the CONCLUDED row's
-- browsability. The live fog-spectate gate is a separate mechanism and is
-- unaffected by a row's stored visibility.
--
-- game_participants.visibility is flipped in lockstep, because the public feeds
-- (leaderboards, profile game lists) require BOTH games.visibility <> 'private'
-- AND game_participants.visibility <> 'private'; leaving the participants
-- private would keep the now-public game hidden and render its seats as
-- "Anonymous". Account seats surface their public handle; guest seats stay
-- labelled "Guest" (their stored display_name), so no identity is invented.

UPDATE games
SET visibility = 'public'
WHERE visibility = 'private'
  AND mode = 'pvp';

UPDATE game_participants
SET visibility = 'public'
WHERE visibility = 'private'
  AND game_id IN (SELECT room_id FROM games WHERE mode = 'pvp');
