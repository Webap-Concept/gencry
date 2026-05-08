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
  offset?: number;
  search?: string;
}): Promise<NotFoundLogRow[]> {
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  const trimmedSearch = opts?.search?.trim().toLowerCase();

  const conditions = [
    opts?.includeResolved ? undefined : isNull(notFoundLogs.resolvedAt),
    trimmedSearch
      ? sql`lower(${notFoundLogs.path}) LIKE ${`%${trimmedSearch}%`}`
      : undefined,
  ].filter(Boolean);

  const where =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : and(...(conditions as NonNullable<(typeof conditions)[number]>[]));

  return db
    .select()
    .from(notFoundLogs)
    .where(where)
    .orderBy(desc(notFoundLogs.lastHitAt))
    .limit(limit)
    .offset(offset);
}

/** Conta il totale di righe matched dal filtro corrente — necessario
 *  per paginare correttamente lato UI (totale pagine = ceil(total/perPage)). */
export async function countFilteredNotFoundLogs(opts?: {
  includeResolved?: boolean;
  search?: string;
}): Promise<number> {
  const trimmedSearch = opts?.search?.trim().toLowerCase();
  const conditions = [
    opts?.includeResolved ? undefined : isNull(notFoundLogs.resolvedAt),
    trimmedSearch
      ? sql`lower(${notFoundLogs.path}) LIKE ${`%${trimmedSearch}%`}`
      : undefined,
  ].filter(Boolean);

  const where =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : and(...(conditions as NonNullable<(typeof conditions)[number]>[]));

  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notFoundLogs)
    .where(where);
  return Number(rows[0]?.n ?? 0);
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

/**
 * Cancella in massa le righe `not_found_logs` che corrispondono a path
 * file-based di sistema o a probe noti di bot. Il filter di ingresso
 * (`lib/seo/log-not-found.ts`) ora le scarta a monte; questa funzione
 * pulisce il rumore già accumulato.
 *
 * Match: `path = prefix` OR `path LIKE 'prefix/%'` OR `path LIKE 'prefix%'`
 * (per probe come `/wp-login.php` che NON hanno slash dopo `/wp-`).
 */
export async function deleteSystemPathsNotFoundLogs(args: {
  exactOrUnderPrefixes: readonly string[];
  startsWithPrefixes: readonly string[];
}): Promise<number> {
  const exactOrUnder = args.exactOrUnderPrefixes;
  const startsWith = args.startsWithPrefixes;
  if (exactOrUnder.length === 0 && startsWith.length === 0) return 0;

  // Costruiamo una OR condition con `path = $1 OR path LIKE $2 OR ...`
  // tramite sql.join. NON usiamo `IN(${arr})` qui perché abbiamo bisogno
  // di operatori diversi (=, LIKE) sullo stesso array — un IN non basta.
  const conditions = sql.join(
    [
      ...exactOrUnder.flatMap((p) => [
        sql`${notFoundLogs.path} = ${p}`,
        sql`${notFoundLogs.path} LIKE ${p + "/%"}`,
      ]),
      ...startsWith.map(
        (p) => sql`${notFoundLogs.path} LIKE ${p + "%"}`,
      ),
    ],
    sql` OR `,
  );

  const res = await db
    .delete(notFoundLogs)
    .where(sql`(${conditions})`)
    .returning({ id: notFoundLogs.id });
  return res.length;
}
