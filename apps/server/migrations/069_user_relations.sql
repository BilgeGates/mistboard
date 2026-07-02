-- 069_user_relations.sql
-- Social kernel: directed follow/block edges between accounts (lichess
-- relation model). One row per directed pair, so an actor holds at most one
-- relation toward a target: blocking upserts over a prior follow. Lists are
-- self-only surfaces; there is no follower notification and no public
-- followers list, so the edge itself stays private to the actor.

CREATE TABLE IF NOT EXISTS user_relations (
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relation TEXT NOT NULL CHECK (relation IN ('follow', 'block')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, target_id),
  CHECK (actor_id <> target_id)
);

-- Reverse-direction lookups: "who follows/blocks this user" powers the
-- blocked-by check on follow and, later, the inbox send gate.
CREATE INDEX IF NOT EXISTS user_relations_target_idx
  ON user_relations (target_id, relation);
