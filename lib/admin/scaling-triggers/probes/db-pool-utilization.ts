import "server-only";
// lib/admin/scaling-triggers/probes/db-pool-utilization.ts
//
// Probe utilizzazione pool DB. Misura ACTIVE connections (query in
// esecuzione *ora*) come segnale di workload — NON `total` perché il
// pool drizzle mantiene fino a max=30 connessioni warm idle e quel
// numero non riflette saturazione (vedi project_rsc_prefetch_fanout_bug).
//
// `total` è esposto solo come info nel `formatted`. Se total cresce
// regolarmente vicino al cap senza active corrispondente, è un segnale
// di idle leak (connessioni mai rilasciate) — diagnosticabile a vista
// nel widget. Non lo allarmiamo automaticamente perché il caso
// pratico è raro.
//
// Limit: pg_stat_activity vede TUTTE le connessioni al DB (incluse
// quelle di altri client se condividi il database). Per ambienti
// dedicati (Supabase project privato) la misura è proxy preciso del
// pool drizzle. In ambiente condiviso (multi-tenant) sovrastima.
//
// Costo: 1 SELECT count(*) su pg_stat_activity. Trascurabile (<1ms).
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";

const POOL_MAX_DECLARED = 30;

export default async function probeDbPoolUtilization(): Promise<{
  value: number | null;
  unit: string;
  formatted?: string;
  error?: string;
}> {
  try {
    const rows = await db.execute<{ active: number; total: number }>(sql`
      SELECT
        COUNT(*) FILTER (WHERE state = 'active')::int AS active,
        COUNT(*)::int AS total
      FROM pg_stat_activity
      WHERE datname = current_database()
    `);
    const list = Array.isArray(rows)
      ? (rows as Array<{ active: number; total: number }>)
      : ((rows as { rows?: Array<{ active: number; total: number }> }).rows ?? []);
    const active = list[0]?.active ?? 0;
    const total = list[0]?.total ?? 0;
    return {
      value: active,
      unit: "active conn",
      formatted: `${active} active / ${total} pooled (max ${POOL_MAX_DECLARED})`,
    };
  } catch (err) {
    return { value: null, unit: "active conn", error: String(err) };
  }
}
