import "server-only";
// lib/admin/scaling-triggers/probes/dau-30d.ts
//
// Probe DAU rolling 30d. Proxy: distinct user_id da `sessions` con
// `last_seen_at > now - 30d`. lastSeenAt è throttled 5min, quindi un
// utente connesso conta solo se ha fatto almeno una request rilevante
// in finestra. Sotto-stima leggermente i veri "active" (un utente in
// lettura senza interazione potrebbe non aggiornare lastSeenAt) ma è
// la metrica più disponibile senza instrumentation aggiuntiva.
//
// Costo: 1 SELECT count(distinct user_id) con indice
// idx_sessions_active_last_seen. Trascurabile fino a ~milioni di rows.
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";

export default async function probeDau30d(): Promise<{
  value: number | null;
  unit: string;
  formatted?: string;
  error?: string;
}> {
  try {
    const rows = await db.execute<{ dau: number }>(sql`
      SELECT COUNT(DISTINCT user_id)::int AS dau
      FROM sessions
      WHERE last_seen_at > NOW() - INTERVAL '30 days'
        AND revoked_at IS NULL
    `);
    const list = Array.isArray(rows)
      ? (rows as Array<{ dau: number }>)
      : ((rows as { rows?: Array<{ dau: number }> }).rows ?? []);
    const dau = list[0]?.dau ?? 0;
    return {
      value: dau,
      unit: "DAU 30d",
      formatted: formatThousands(dau),
    };
  } catch (err) {
    return { value: null, unit: "DAU 30d", error: String(err) };
  }
}

function formatThousands(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}K`;
  return `${Math.round(n / 1000)}K`;
}
