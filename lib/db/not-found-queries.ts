import { db } from "./drizzle";
import { notFoundLogs } from "./schema";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

/**
 * UPSERT su `path`: se il path esiste, incrementa hit_count e aggiorna
 * last_hit_at / last_referrer / last_user_agent. Riapre anche eventuali
 * row "resolved" (resolved_at = NULL) perché un nuovo hit dopo che era
 * stato considerato risolto è informazione utile per l'admin.
 */
export async function recordNotFoundHit(input: {
  path: string;
  referrer?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const path = input.path.slice(0, 500);
  const referrer = input.referrer ? input.referrer.slice(0, 500) : null;
  const userAgent = input.userAgent ? input.userAgent.slice(0, 500) : null;

  await db
    .insert(notFoundLogs)
    .values({
      path,
      lastReferrer: referrer,
      lastUserAgent: userAgent,
    })
    .onConflictDoUpdate({
      target: notFoundLogs.path,
      set: {
        hitCount: sql`${notFoundLogs.hitCount} + 1`,
        lastHitAt: new Date(),
        lastReferrer: referrer,
        lastUserAgent: userAgent,
        resolvedAt: null,
      },
    });
}

export type NotFoundLogRow = typeof notFoundLogs.$inferSelect;

export async function listNotFoundLogs(opts?: {
  includeResolved?: boolean;
  limit?: number;
}): Promise<NotFoundLogRow[]> {
  const limit = opts?.limit ?? 200;
  const where = opts?.includeResolved
    ? undefined
    : isNull(notFoundLogs.resolvedAt);

  return db
    .select()
    .from(notFoundLogs)
    .where(where)
    .orderBy(desc(notFoundLogs.lastHitAt))
    .limit(limit);
}

export async function countNotFoundLogs(): Promise<{
  unresolved: number;
  resolved: number;
}> {
  const rows = await db
    .select({
      resolved: sql<number>`count(*) filter (where ${notFoundLogs.resolvedAt} is not null)`,
      unresolved: sql<number>`count(*) filter (where ${notFoundLogs.resolvedAt} is null)`,
    })
    .from(notFoundLogs);
  const r = rows[0];
  return {
    unresolved: Number(r?.unresolved ?? 0),
    resolved: Number(r?.resolved ?? 0),
  };
}

export async function markNotFoundResolved(id: number): Promise<void> {
  await db
    .update(notFoundLogs)
    .set({ resolvedAt: new Date() })
    .where(and(eq(notFoundLogs.id, id), isNull(notFoundLogs.resolvedAt)));
}

export async function markNotFoundUnresolved(id: number): Promise<void> {
  await db
    .update(notFoundLogs)
    .set({ resolvedAt: null })
    .where(eq(notFoundLogs.id, id));
}

export async function deleteNotFoundLog(id: number): Promise<void> {
  await db.delete(notFoundLogs).where(eq(notFoundLogs.id, id));
}

export async function deleteAllResolvedNotFoundLogs(): Promise<number> {
  const res = await db
    .delete(notFoundLogs)
    .where(sql`${notFoundLogs.resolvedAt} is not null`)
    .returning({ id: notFoundLogs.id });
  return res.length;
}
