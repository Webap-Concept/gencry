import { runPolicyChangeNotificationsCron } from "@/lib/account/policy-reconsent";
import { isAuthorizedCron } from "@/lib/modules/prices/cron-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron worker per le notifiche di aggiornamento policy. Triggered da
 * Supabase pg_cron via HTTP GET con header
 * `Authorization: Bearer ${CRON_SECRET}`.
 *
 * Comportamento:
 *   - no-op se gdpr.policy.force_reconsent_on_change != 'true'
 *   - altrimenti seleziona fino a 50 utenti distinti con righe pending
 *     entro retry budget (max 3 tentativi), invia 1 mail per utente con
 *     tutte le sue policy aggiornate, marca le righe `sent` (o `failed` /
 *     `pending` con attempt_count++ in caso di errore Resend).
 *
 * Schedule consigliata: ogni `gdpr.policy.notifications_cron_minutes` (60
 * di default — l'aggiornamento di una policy non è urgente, batch orari
 * tengono basso il consumo di Resend e di funzioni serverless).
 *
 * pg_cron schedule example:
 *   SELECT cron.schedule(
 *     'policy-change-notifications',
 *     '0 * * * *',
 *     $$ SELECT net.http_get(
 *          url := 'https://<app>/api/cron/account/policy-change-notifications',
 *          headers := jsonb_build_object('Authorization', 'Bearer ' || '<CRON_SECRET>')
 *        ); $$
 *   );
 */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runPolicyChangeNotificationsCron();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[cron/policy-change-notifications] failed:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
