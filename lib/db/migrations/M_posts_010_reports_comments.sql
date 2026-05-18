-- =============================================================================
-- Module: Posts — 010 reports su commenti (polimorfismo)
-- =============================================================================
-- Estende `posts_reports` per supportare report anche sui commenti, NON solo
-- sui post. Approccio polimorfico (1 sola tabella) invece di una tabella
-- gemella per:
--   - 1 sola admin queue + 1 set di status transitions
--   - 1 sola Server Action reportContent({type, id, ...})
--   - counter aggregati banali (no UNION)
--
-- Discriminator implicito: si valorizza ESATTAMENTE 1 tra `post_id` e
-- `comment_id`, garantito da CHECK constraint `num_nonnulls = 1`.
--
-- Backfill: tutte le righe esistenti hanno post_id valorizzato + comment_id
-- non esiste come colonna ancora → il drop NOT NULL su post_id non viola
-- nessuna riga e il default NULL per comment_id soddisfa la XOR.
--
-- Idempotente (IF NOT EXISTS / IF EXISTS). Da incollare nel SQL Editor.
-- =============================================================================

-- ── 1) Aggiungi `comment_id` nullable con FK + ON DELETE CASCADE ──────────
ALTER TABLE "posts_reports"
  ADD COLUMN IF NOT EXISTS "comment_id" uuid
    REFERENCES "posts_comments"("id") ON DELETE CASCADE;

-- ── 2) Relax `post_id` a NULL-ammesso (il discriminator XOR lo gestirà) ───
ALTER TABLE "posts_reports"
  ALTER COLUMN "post_id" DROP NOT NULL;

-- ── 3) CHECK constraint XOR: esattamente 1 tra post_id e comment_id ───────
-- num_nonnulls è una built-in Postgres che conta gli argomenti non-NULL.
-- = 1 garantisce mutually exclusive + non-empty.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'posts_reports_target_xor_chk'
      AND conrelid = 'posts_reports'::regclass
  ) THEN
    ALTER TABLE "posts_reports"
      ADD CONSTRAINT "posts_reports_target_xor_chk"
      CHECK (num_nonnulls("post_id", "comment_id") = 1);
  END IF;
END$$;

-- ── 4) Indice per la queue admin dei comment reports (parziale) ───────────
-- Lo specchio di idx_posts_reports_post esistente, ma per comment_id.
CREATE INDEX IF NOT EXISTS "idx_posts_reports_comment"
  ON "posts_reports" ("comment_id", "created_at" DESC)
  WHERE "comment_id" IS NOT NULL;

-- ── 5) Anti-doppione: gli unique parziali (reporter_id × post_id e
--      reporter_id × comment_id) sono creati da M_posts_011 perché su DB
--      con dati pre-esistenti potrebbero esserci duplicati che vanno
--      deduplicati prima di mettere il vincolo. Lascio il riferimento qui
--      per scoperta: vedi M_posts_011_reports_dedup_unique.sql.
