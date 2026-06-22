-- 054_misty_active_engine_v1_5.sql
-- Bot profiles keep a stable public identity while the backing first-party
-- engine version advances.

UPDATE bot_profiles
   SET active_engine_id = 'python-v2-v1.5',
       updated_at = now()
 WHERE id = 'misty-dark-chess'
   AND active_engine_id <> 'python-v2-v1.5';
