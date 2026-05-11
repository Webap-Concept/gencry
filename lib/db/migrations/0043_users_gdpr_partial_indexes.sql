-- 0043_users_gdpr_partial_indexes.sql
--
-- Partial indexes feeding the GDPR dashboard stats query
-- (lib/account/gdpr-stats.ts). All seven COUNT(*) FILTER aggregates in
-- that query share the predicate `deleted_at IS NULL` (alive users) and
-- two of them additionally filter on `accepted_*_version`. Without
-- indexes, every dashboard load triggers a full seq scan of the users
-- table — fine at 10K rows, painful at 100K+, blocking at 1M+.
--
-- Partial indexes only store the rows that satisfy the predicate, so
-- footprint stays minimal (alive users only; deletion is rare). All
-- three are IF NOT EXISTS so re-applying the migration is safe.
--
-- After applying this, the planner uses an index-only scan for the
-- alive-user counts and an index scan for the drift counts.

CREATE INDEX IF NOT EXISTS idx_users_alive
  ON users(id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_terms_drift
  ON users(accepted_terms_version)
  WHERE deleted_at IS NULL AND accepted_terms_version IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_privacy_drift
  ON users(accepted_privacy_version)
  WHERE deleted_at IS NULL AND accepted_privacy_version IS NOT NULL;
