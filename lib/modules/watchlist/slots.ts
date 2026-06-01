// lib/modules/watchlist/slots.ts
//
// Read-side degli slot watchlist: cap effettivo (free + comprati con GCC).
// `server-only`: importato SOLO dalla page RSC /watchlist (mai dal client né
// dal manifest → vedi perk-grant.ts per la scrittura lato hook).
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";

/**
 * Cap watchlist effettivo dell'utente = slot free (app_settings) + slot extra
 * acquistati con GCC. Single source of truth: la function PL/pgSQL
 * get_user_watchlist_cap (vedi M_watchlist_002). Fallback 5.
 */
export async function getUserWatchlistCap(userId: string): Promise<number> {
  try {
    const res = await db.execute(
      sql`SELECT get_user_watchlist_cap(${userId}::uuid) AS cap`,
    );
    const rows = res as unknown as Array<{ cap: number | string }>;
    const raw = rows?.[0]?.cap;
    const cap = typeof raw === "string" ? parseInt(raw, 10) : raw;
    return typeof cap === "number" && Number.isFinite(cap) && cap > 0 ? cap : 5;
  } catch {
    return 5;
  }
}
