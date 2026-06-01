-- M_watchlist_002_extra_slots.sql
--
-- Slot watchlist EXTRA acquistati con GCC (perk 'watchlist_slot' del modulo
-- rewards). Tabella di proprietà del modulo WATCHLIST: al riscatto del perk il
-- modulo rewards chiama l'hook afterPerkRedeemed → il manifest watchlist
-- incrementa qui (isolamento: nessuno SQL cross-modulo).
--
-- get_user_watchlist_cap ora ritorna: cap_free (app_settings) + extra_slots.
-- Il trigger di enforcement usa già quella function → rispetta gli slot comprati.
--
-- Da incollare nel Supabase SQL Editor dopo M_watchlist_001.

CREATE TABLE IF NOT EXISTS "watchlist_extra_slots" (
  "user_id"     uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "extra_slots" integer NOT NULL DEFAULT 0
                  CONSTRAINT watchlist_extra_slots_nonneg CHECK (extra_slots >= 0),
  "updated_at"  timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION get_user_watchlist_cap(uid uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_free_cap int;
  v_extra    int;
BEGIN
  SELECT NULLIF(value, '')::int INTO v_free_cap
  FROM app_settings
  WHERE key = 'modules.watchlist.max_per_user_free';

  SELECT extra_slots INTO v_extra
  FROM watchlist_extra_slots
  WHERE user_id = uid;

  RETURN COALESCE(v_free_cap, 5) + COALESCE(v_extra, 0);
END;
$$;
