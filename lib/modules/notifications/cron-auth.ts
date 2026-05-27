// lib/modules/notifications/cron-auth.ts
// Auth helper per gli endpoint cron del modulo Notifications. Stesso
// pattern dei cron Posts/Prices — non riusiamo quelli per evitare
// dipendenze cross-modulo (regola feedback_module_isolation).

const CRON_HEADER = "authorization";

export function isAuthorizedCron(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = req.headers.get(CRON_HEADER);
  if (!header) return false;
  return header === `Bearer ${expected}`;
}
