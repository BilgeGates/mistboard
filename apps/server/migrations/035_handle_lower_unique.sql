-- 035_handle_lower_unique.sql
-- Make the username (handle) uniqueness invariant explicit and case-insensitive.
--
-- Single-username model: handles are always stored lowercase, but the original
-- constraint was a case-sensitive UNIQUE(handle), which only agreed with the
-- lower(handle) lookups because every write path force-lowercases. Enforce the
-- real invariant in the DB so a future mixed-case insert cannot create a
-- case-colliding duplicate (e.g. "Brian" vs "brian") that would make lookups
-- ambiguous and enable impersonation.
--
-- Add the stronger case-insensitive unique index first, then drop the weaker
-- case-sensitive constraint it subsumes (any pair violating UNIQUE(handle) also
-- violates UNIQUE(lower(handle))).

CREATE UNIQUE INDEX IF NOT EXISTS users_handle_lower_idx ON users (lower(handle));

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_handle_key;
