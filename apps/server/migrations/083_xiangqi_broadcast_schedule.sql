-- Per-tour scheduled polling for xiangqi broadcasts. The in-server scheduler
-- polls each enabled tour's source_url on its interval, reusing the same
-- poller (policy, backoff, sync logs) as manual/CLI polls.
ALTER TABLE xiangqi_broadcast_tours
  ADD COLUMN poll_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN poll_interval_ms integer NOT NULL DEFAULT 30000;
