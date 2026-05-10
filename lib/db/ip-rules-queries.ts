// lib/db/ip-rules-queries.ts
//
// CRUD per la dashboard admin /admin/security/ip-rules. Mai chiamato dal
// hot-path delle request normali — quello passa per `lib/auth/ip-rules.ts`
// (cache + match in memoria). Qui solo lettura/scrittura raw + ordinamenti
// e filtri tipici della UI.

import "server-only";

import { db } from "@/lib/db/drizzle";
import { ipRules, type IpRule } from "@/lib/db/schema";
import { and, asc, desc, eq, isNull, lte, or, sql } from "drizzle-orm";

export type { IpRule };

export type IpRuleScopeFilter = "all" | "auth" | "admin" | "edge";
export type IpRuleStateFilter = "active" | "expired" | "all";

export interface ListIpRulesOpts {
  /** Filtra per scope nella UI; `all` = nessun filtro. */
  scope?: IpRuleScopeFilter;
  /** Mostra solo regole attive, scadute, o entrambe. Default 'active'. */
  state?: IpRuleStateFilter;
}

/**
 * Lista regole per la dashboard. Ordinamento: attive prima (NULL expiresAt
 * o futuro), poi le più recenti per createdAt.
 */
export async function listIpRules(opts: ListIpRulesOpts = {}): Promise<IpRule[]> {
  const conditions = [];
  if (opts.scope && opts.scope !== "all") {
    // 'edge' nella UI corrisponde al valore DB 'all' (placeholder layer 2).
    const dbScope = opts.scope === "edge" ? "all" : opts.scope;
    conditions.push(eq(ipRules.scope, dbScope));
  }
  const state = opts.state ?? "active";
  if (state === "active") {
    conditions.push(
      or(
        isNull(ipRules.expiresAt),
        sql`${ipRules.expiresAt} > NOW()`,
      )!,
    );
  } else if (state === "expired") {
    conditions.push(sql`${ipRules.expiresAt} <= NOW()`);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return db
    .select()
    .from(ipRules)
    .where(where)
    .orderBy(
      // Attive prima: NULL → 0, future → 0, scadute → 1
      sql`CASE WHEN ${ipRules.expiresAt} IS NULL OR ${ipRules.expiresAt} > NOW() THEN 0 ELSE 1 END`,
      desc(ipRules.createdAt),
      asc(ipRules.id),
    );
}

export type NewIpRuleInput = {
  ip: string;
  action: "allow" | "deny";
  scope: "auth" | "admin" | "all";
  reason: string | null;
  expiresAt: Date | null;
  createdBy: string | null;
};

export async function insertIpRule(input: NewIpRuleInput): Promise<IpRule> {
  const [row] = await db
    .insert(ipRules)
    .values({
      ip: input.ip,
      action: input.action,
      scope: input.scope,
      reason: input.reason,
      expiresAt: input.expiresAt,
      createdBy: input.createdBy,
    })
    .returning();
  return row;
}

export async function deleteIpRuleById(id: number): Promise<IpRule | null> {
  const [row] = await db.delete(ipRules).where(eq(ipRules.id, id)).returning();
  return row ?? null;
}

export async function updateIpRuleExpiry(
  id: number,
  expiresAt: Date | null,
): Promise<IpRule | null> {
  const [row] = await db
    .update(ipRules)
    .set({ expiresAt })
    .where(eq(ipRules.id, id))
    .returning();
  return row ?? null;
}

/** Cron cleanup: cancella regole scadute da più di N giorni (default 30). */
export async function deleteExpiredIpRules(retentionDays = 30): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const rows = await db
    .delete(ipRules)
    .where(
      and(
        sql`${ipRules.expiresAt} IS NOT NULL`,
        lte(ipRules.expiresAt, cutoff),
      ),
    )
    .returning({ id: ipRules.id });
  return rows.length;
}

/**
 * Aggiorna in batch i contatori hit dalle chiavi Redis. Chiamato dal cron
 * flush; il caller passa una mappa ruleId → delta da sommare.
 */
export async function flushHitCounters(
  hits: Map<number, number>,
): Promise<void> {
  if (hits.size === 0) return;
  // Una UPDATE per riga è semplice e robusto; se diventa un problema (>>100/h)
  // si può ottimizzare con una CTE + VALUES, ma realisticamente il volume
  // resta basso.
  const now = new Date();
  for (const [id, delta] of hits) {
    if (delta <= 0) continue;
    await db
      .update(ipRules)
      .set({
        hitCount: sql`${ipRules.hitCount} + ${delta}`,
        lastHitAt: now,
      })
      .where(eq(ipRules.id, id));
  }
}
