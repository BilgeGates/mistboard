-- Engine session affinity / multi-replica serving — data model (Phase 0).
--
-- Two centralized tables that let an elastic fleet of engine-worker replicas
-- serve live PvE moves with sticky session affinity and a correct global
-- concurrency cap. Design: docs-private/engine/assign-and-pin-affinity-scope-2026-06-03.md
-- (private engine repo). Key invariant: belief is recomputable from the
-- transcript on any worker, so affinity here is a PERFORMANCE hint with a
-- cold-replay fallback — never load-bearing for correctness.
--
-- (1) live_engine_games — the seat cap as a Postgres row-count, correct across
--     replicas (replaces the per-instance in-memory EngineReservationStore).
--     One row per active engine game; capacity check is COUNT(*) per engine_id.
-- (2) engine_move_jobs — the move work-queue. Workers across all replicas claim
--     with FOR UPDATE SKIP LOCKED, preferring jobs tagged for them
--     (preferred_worker = whoever served this game's prior move → warm belief →
--     delta-feed) but taking any queued job otherwise (cold-replay).

CREATE TABLE IF NOT EXISTS live_engine_games (
  room_id        TEXT PRIMARY KEY,
  engine_id      TEXT NOT NULL,
  color          TEXT NOT NULL CHECK (color IN ('white', 'black')),
  -- Soft affinity hint: the worker that served this game's last move. Workers
  -- prefer their own tagged jobs; NULL until the first move completes.
  preferred_worker TEXT,
  reserved_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Liveness: the public server heartbeats active games; a reaper releases
  -- seats whose game went away without a clean release (crash / disconnect).
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS live_engine_games_engine_idx
  ON live_engine_games (engine_id);
CREATE INDEX IF NOT EXISTS live_engine_games_heartbeat_idx
  ON live_engine_games (last_heartbeat);

CREATE TABLE IF NOT EXISTS engine_move_jobs (
  id               BIGSERIAL PRIMARY KEY,
  room_id          TEXT NOT NULL,
  engine_id        TEXT NOT NULL,
  ply              INTEGER,
  -- The redacted EngineTurnRequest (the SAME payload sent over HTTP today; the
  -- queue is just the transport). Option to store an events ref instead if the
  -- transcript payload grows costly — see the scope doc.
  request          JSONB NOT NULL,
  -- Soft affinity hint copied from live_engine_games at enqueue time.
  preferred_worker TEXT,
  status           TEXT NOT NULL DEFAULT 'queued'
                     CHECK (status IN ('queued', 'claimed', 'done', 'failed')),
  attempts         INTEGER NOT NULL DEFAULT 0,
  claimed_by       TEXT,
  claimed_at       TIMESTAMPTZ,
  -- The EngineTurnResponse on success; `error` on failure. The enqueuing server
  -- awaits by id (short-poll / LISTEN-NOTIFY).
  result           JSONB,
  error            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Claim scan: queued jobs, oldest first, prefer-mine ordered in the query
-- (`ORDER BY (preferred_worker = :me) DESC, created_at`). Partial index keeps it
-- tiny (only the unclaimed backlog).
CREATE INDEX IF NOT EXISTS engine_move_jobs_claim_idx
  ON engine_move_jobs (created_at)
  WHERE status = 'queued';
-- Reaper scan: stale 'claimed' jobs (worker died mid-move) → requeue → failover
-- (the new owner cold-replays). Keyed for the `status='claimed' AND claimed_at <
-- threshold` sweep.
CREATE INDEX IF NOT EXISTS engine_move_jobs_stale_idx
  ON engine_move_jobs (claimed_at)
  WHERE status = 'claimed';
CREATE INDEX IF NOT EXISTS engine_move_jobs_room_idx
  ON engine_move_jobs (room_id);
