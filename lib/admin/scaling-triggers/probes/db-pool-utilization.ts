import "server-only";
// lib/admin/scaling-triggers/probes/db-pool-utilization.ts
//
// Probe utilizzazione pool DB. Legge `pg_stat_activity` per il count
// di connessioni attive sul cluster. Confronto vs `max=30` dichiarato
// in lib/db/drizzle.ts (drizzle pool, vedi project_rsc_prefetch_fanout_bug).
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
    // Numerator: total connections (active + idle nel pool drizzle),
    // così il watermark conta anche le idle "occupate" dal pool.
    return {
      value: total,
      unit: "connections",
      formatted: `${total}/${POOL_MAX_DECLARED} (${active} active)`,
    };
  } catch (err) {
    return { value: null, unit: "connections", error: String(err) };
  }
}
