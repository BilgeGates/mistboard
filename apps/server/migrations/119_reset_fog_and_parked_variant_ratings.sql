-- 119_reset_fog_and_parked_variant_ratings.sql
--
-- Two cleanups on user_ratings, both data-only.
--
-- 1. Reset the Fog Chess ladder. Its entire contents were two dev accounts
--    (test2, brianhliou-dev) that played each other once on 2026-06-08, which
--    put a pair of provisional ratings on the only populated public ladder on
--    the site. Rows in user_ratings are created lazily on the first rated game
--    in a bucket (see 017), so deleting is the clean-slate reset: the ladder
--    starts empty and rebuilds from the next real rated game.
--
-- 2. Cut ratings for variants that are not playable in prod. Each of these
--    pools is behind a launch flag that is off, or has no launch flag at all,
--    so no new rows can accrue in prod. The existing rows are leftovers from
--    when the variant scope was wider, and they surface on profile rating
--    grids for games nobody can play.
--
-- Deliberately NOT touching:
--   * fog_draft960 stays in the allowlist and keeps its rows. It is the
--     Draft960 pregame option inside Fog of War, not a separate variant, and
--     Fog of War is live. It is included in the reset below only because it is
--     part of the same ladder.
--   * The user_ratings_variant_check allowlist (last set in 074) is left
--     alone. Narrowing it would make a rated game on a lab-enabled parked
--     variant violate the constraint mid-finish, and a constraint failure
--     there takes down the whole finish transaction rather than just skipping
--     the rating write.
--   * The games rows themselves. Those games still exist, still say rated,
--     and still carry their rating_before/rating_after. Unrating them is a
--     separate decision.

-- 1. Fog Chess ladder reset (both pools of the same variant).
DELETE FROM user_ratings
 WHERE variant IN ('fog', 'fog_draft960');

-- 2. Parked / disabled-in-prod pools.
--    Live pools as of this migration, for contrast: xiangqi, banqi
--    (Flip Xiangqi), jieqi (Reveal Xiangqi), fortress_xiangqi, dark_xiangqi
--    (Fog Xiangqi), fog + fog_draft960 (Fog Chess), jungle, jungle_flip.
DELETE FROM user_ratings
 WHERE variant IN (
   'dark_mini_xiangqi',
   'drop_mini_xiangqi',
   'crossroads_chess',
   'crossroads_chess_open',
   'reveal_chess',
   'dark_shogi',
   'dark_crazyhouse',
   'kriegspiel'
 );
