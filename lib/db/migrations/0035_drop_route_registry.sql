-- 0035_drop_route_registry.sql
-- Drop della tabella route_registry: dopo la migration 0034 il proxy
-- legge la visibility delle route da `pages`, e l'admin gestisce le
-- routes via /admin/content/pages tab Sistema. La tabella è stata
-- lasciata in DB un ciclo di deploy come safety net per un eventuale
-- rollback rapido — chiudiamo qui.
--
-- Eseguire SOLO dopo aver verificato in produzione che proxy.ts
-- funziona correttamente leggendo da `pages` (auth-gate sulle route
-- private, pass-through sulle public).

DROP TABLE IF EXISTS route_registry CASCADE;
