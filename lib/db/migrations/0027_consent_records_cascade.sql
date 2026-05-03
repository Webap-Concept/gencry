-- Migration 0027: consent_records FK SET NULL → CASCADE + remove DELETE trigger
--
-- Hotfix per la migration 0026: la combinazione "ON DELETE SET NULL" + trigger
-- BEFORE UPDATE rendeva impossibile eliminare un utente da `users`. Quando
-- Postgres tentava il SET NULL automatico sulla cascade FK, il trigger di
-- immutabilità lo rifiutava con "consent_records is append-only".
--
-- Decisione di design: passiamo a ON DELETE CASCADE. Quando l'utente è
-- eliminato (right-to-be-forgotten), i suoi consent_records vengono cancellati
-- con lui. Rinunciamo all'audit trail orfano (user_id NULL) perché:
--   - senza identificatore non c'è valore probatorio individuale
--   - la dimostrabilità del consenso (GDPR Art. 7(1)) è garantita FINCHÉ
--     l'utente esiste; quando l'utente è cancellato (Art. 17) preferiamo zero
--     residui a un audit anonimo dal valore zero
--   - lo schema è enormemente più semplice (no trigger fix complesso, no cron
--     retention, no setting dedicato) e meno bug-prone
--
-- Conseguenze:
--   - DROP del trigger BEFORE DELETE (i DELETE sono ora permessi e necessari
--     per la cascade FK)
--   - Resta il trigger BEFORE UPDATE che continua a garantire l'immutabilità
--     del CONTENUTO della riga (un consenso registrato non si modifica)
--   - Il setting `gdpr.consent_log.retention_after_deletion_days` resta
--     persisted ma diventa inutile: lo lasciamo per non rompere il form admin,
--     verrà eventualmente rimosso in una pulizia successiva.

-- 1. Sostituisci la constraint FK: SET NULL → CASCADE
ALTER TABLE "consent_records"
  DROP CONSTRAINT IF EXISTS "consent_records_user_id_fkey";

ALTER TABLE "consent_records"
  ADD CONSTRAINT "consent_records_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

-- 2. Rimuovi il trigger BEFORE DELETE (DELETE è ora permesso, serve per la
--    cascade FK e per pulizie manuali in dev/staging).
DROP TRIGGER IF EXISTS "consent_records_immutable_delete" ON "consent_records";

-- 3. Il trigger BEFORE UPDATE resta — il CONTENUTO di un consenso registrato
--    è ancora append-only. La query in lib/account/gdpr-stats.ts cerca
--    `tgname LIKE '%immutable%'` e continua a trovare
--    consent_records_immutable_update, quindi la dashboard /admin/compliance/gdpr
--    mostra ancora "Immutability trigger active".
