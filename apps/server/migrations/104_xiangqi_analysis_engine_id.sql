-- 104_xiangqi_analysis_engine_id.sql
-- Repair the orphaned xiangqi analysis cache (#169).
--
-- Xiangqi whole-game analyses were cached under the PvE bot id
-- (XIANGQI_DEFAULT_ENGINE_ID) instead of a dedicated versioned analysis id like
-- every sibling variant. The 2026-07-10 ladder expansion (commit 7204c3d6)
-- renamed that default from 'pikafish-xiangqi-strong' to
-- 'pikafish-xiangqi-level-5', silently orphaning every row cached under the old
-- id: GETs 204'd and each request re-burned a whole-game engine pass.
--
-- Both id eras were produced by an EQUIVALENT analysis config, so both map onto
-- the new dedicated id ('pikafish-xiangqi-analysis@1'): the analysis path runs
-- `go depth 12` against the same mainline Pikafish binary + official NNUE net,
-- and the tier's nodes/movetime/skill knobs never applied to analysis (the
-- Skill Level option only ever reached the bot-move path, and Pikafish rejected
-- it as unsupported anyway). evaluateXiangqiPosition's output config is
-- unchanged since the analysis route shipped (2026-07-05).
--
-- The PK is (room_id, engine_id, depth). A room analysed under the old id and
-- re-analysed after the rename holds rows under BOTH ids, so blindly rewriting
-- both would collide. The results are deterministic and equivalent, so first
-- keep one winner per (room_id, depth) among the affected ids (prefer a row
-- already on the new id, then the newest), then rewrite the survivors.

WITH ranked AS (
  SELECT
    room_id,
    engine_id,
    depth,
    row_number() OVER (
      PARTITION BY room_id, depth
      ORDER BY
        (engine_id = 'pikafish-xiangqi-analysis@1') DESC,
        created_at DESC,
        engine_id DESC
    ) AS rn
  FROM game_analysis
  WHERE engine_id IN (
    'pikafish-xiangqi-strong',
    'pikafish-xiangqi-level-5',
    'pikafish-xiangqi-analysis@1'
  )
)
DELETE FROM game_analysis ga
USING ranked r
WHERE ga.room_id = r.room_id
  AND ga.engine_id = r.engine_id
  AND ga.depth = r.depth
  AND r.rn > 1;

UPDATE game_analysis
SET engine_id = 'pikafish-xiangqi-analysis@1'
WHERE engine_id IN ('pikafish-xiangqi-strong', 'pikafish-xiangqi-level-5');
