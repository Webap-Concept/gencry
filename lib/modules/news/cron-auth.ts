// lib/modules/news/cron-auth.ts
// Auth helper per gli endpoint cron del modulo News. Stesso pattern di
// lib/modules/posts/cron-auth.ts (non riutilizzato per isolamento modulare,
// vedi feedback_module_isolation).
//
// Trigger: pg_cron via pg_net → "Authorization: Bearer ${CRON_SECRET}".
// Per il trigger manuale admin (bottone "Run now") il route handler fa un
// fallback su sessione admin valida — qui validiamo solo il segreto.

const CRON_HEADER = "authorization";

export function isAuthorizedCron(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = req.headers.get(CRON_HEADER);
  if (!header) return false;
  return header === `Bearer ${expected}`;
}
