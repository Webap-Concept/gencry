-- Migration: 0043_vercel_analytics_optional.sql
-- Vercel Analytics non è obbligatorio: l'admin può scegliere di NON usarlo
-- (es. usa GA4, Plausible self-hosted o niente). Toglierlo dal flag system
-- gli permette di eliminarlo dal registry.
--
-- Effetto a runtime: app/layout.tsx ora carica <Analytics /> solo se il
-- servizio "vercel_analytics" esiste ed è enabled nel registry. Cancellare
-- la riga = nessuno script Vercel iniettato (la dichiarazione del cookie
-- nel banner pubblico sparisce di conseguenza).
--
-- Eseguire nel SQL Editor di Supabase. Idempotente.

UPDATE cookie_services
   SET is_system = false
 WHERE id = 'vercel_analytics';
