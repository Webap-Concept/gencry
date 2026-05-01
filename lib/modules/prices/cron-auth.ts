// lib/prices/cron-auth.ts
// Auth helper per gli endpoint cron. Vercel Cron invoca con
// `Authorization: Bearer ${CRON_SECRET}`. Permettiamo anche un trigger manuale
// dall'admin (con sessione valida) — quel controllo avviene a livello di
// route handler, qui validiamo solo il segreto.

const CRON_HEADER = "authorization";

export function isAuthorizedCron(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // In dev senza CRON_SECRET, rifiutiamo: meglio fail-closed.
    return false;
  }
  const header = req.headers.get(CRON_HEADER);
  if (!header) return false;
  return header === `Bearer ${expected}`;
}
