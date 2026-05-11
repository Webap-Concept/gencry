-- Partial index on pages(system_key) WHERE is_system = true.
--
-- Defense in depth against the cache miss path: when the `seo` /
-- `page:system:not_found` `unstable_cache` tags get invalidated (admin
-- edits a system page), the next 404 hit goes back to the DB. Without
-- this index, the lookup is a sequential scan filtered by two booleans.
-- The table is small today, but in production we've seen the query
-- get killed by `statement_timeout` (Sentry 57014) during bursty 404
-- traffic — keeping the path indexed avoids re-introducing the issue
-- if the table grows or contention spikes.
--
-- Partial filter `WHERE is_system = true` keeps the index small: it
-- only stores rows that the `getPageBySystemKey` query actually scans.
--
-- CONCURRENTLY so the migration doesn't take an ACCESS EXCLUSIVE lock
-- on `pages` while it builds — important since the admin and the
-- frontend keep hitting this table.
CREATE INDEX CONCURRENTLY IF NOT EXISTS pages_system_key_idx
  ON pages (system_key)
  WHERE is_system = true;
