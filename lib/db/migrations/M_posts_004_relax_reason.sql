-- M_posts_004_relax_reason.sql
--
-- Rilassa il CHECK constraint su posts_reports.reason: passiamo da un
-- enum hardcoded ('spam','scam','abuse','other') a una stringa libera
-- validata a runtime contro la lista admin-editable salvata in
-- app_settings sotto la key `modules.posts.report_reasons`.
--
-- Motivazione: il superset di motivi di segnalazione cambia con il
-- dominio dell'app (un social crypto vuole 'market_manipulation' e
-- 'scam' di prima classe, un altro social no). Tenere l'elenco in
-- settings + JSON evita migration ogni volta che si aggiunge un motivo.
--
-- Le righe esistenti restano valide: i 4 vecchi valori sono mantenuti
-- nel seed dei DEFAULT_REPORT_REASONS lato applicazione.

BEGIN;

ALTER TABLE "posts_reports"
  DROP CONSTRAINT IF EXISTS "posts_reports_reason_chk";

ALTER TABLE "posts_reports"
  ADD CONSTRAINT "posts_reports_reason_chk"
  CHECK (length("reason") BETWEEN 1 AND 40);

COMMIT;
