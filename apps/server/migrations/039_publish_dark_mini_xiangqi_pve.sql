-- 039_publish_dark_mini_xiangqi_pve.sql
-- DMX PvE was initially recorded as private while the variant was still hidden.
-- The watch channel is now public, so completed human-vs-engine DMX games should
-- use the same public visibility policy as chess PvE.

UPDATE games
SET visibility = 'public'
WHERE variant = 'dark-mini-xiangqi'
  AND mode = 'pve'
  AND status = 'completed'
  AND visibility = 'private';

UPDATE game_participants
SET visibility = 'public'
WHERE game_id IN (
    SELECT room_id
    FROM games
    WHERE variant = 'dark-mini-xiangqi'
      AND mode = 'pve'
      AND status = 'completed'
      AND visibility = 'public'
  )
  AND visibility = 'private';
