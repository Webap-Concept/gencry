// lib/modules/posts/cron-auth.ts
// Auth helper per gli endpoint cron del modulo Posts. pg_cron via pg_net
// chiama con `Authorization: Bearer ${CRON_SECRET}`. Permettiamo anche
// un trigger manuale dall'admin (con sessione valida) — quel controllo
// avviene a livello di route handler, qui validiamo solo il segreto.
//
// Stesso pattern di `lib/modules/prices/cron-auth.ts` — non riusiamo
// quello per non incorrere in dipendenze cross-modulo (regola
// feedback_module_isolation).

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
