import { db } from "./drizzle";
import { redirects } from "./schema";
import { and, eq, or } from "drizzle-orm";

export type RedirectSource = "manual" | "auto_slug";

// ── In-memory redirect cache ───────────────────────────────────────────────
//
// The proxy calls `getRedirectByFromPath(pathname)` on every non-static,
// non-API, non-admin request — and the table is tiny (typically tens to
// low hundreds of rows even on large sites). Hitting the DB once per
// navigation is pure waste: hit ratio for an actual redirect on a given
// pathname is well under 1%, so 99%+ of those queries return nothing.
//
// Same pattern as `getNavigablePages`: load all active redirects once,
// index them by `from_path` in a Map for O(1) lookup, refresh after
// `CACHE_TTL_MS`. All redirect mutations (upsertRedirect, deleteRedirect,
// toggleRedirectActive, createAutoSlugRedirect) call `invalidateCache()`
// at the end so admin-initiated changes are immediately visible without
// waiting for the TTL.
//
// Multi-instance note: this lives in process memory, so a redirect saved
// from one Vercel instance is visible from another only after that
// instance's TTL expires. Acceptable trade-off for the read-path savings
// — a redirect change taking up to 60s to propagate across instances is
// the same staleness window we accept for the navigable-pages cache.

type CachedRedirect = {
  fromPath: string;
  toPath: string;
  statusCode: number;
  isActive: boolean;
};

let _cache: Map<string, CachedRedirect> | null = null;
let _cacheAt = 0;
const CACHE_TTL_MS = 60_000;

function invalidateCache(): void {
  _cache = null;
  _cacheAt = 0;
}

async function loadCache(): Promise<Map<string, CachedRedirect>> {
  const rows = await db
    .select({
      fromPath: redirects.fromPath,
      toPath: redirects.toPath,
      statusCode: redirects.statusCode,
      isActive: redirects.isActive,
    })
    .from(redirects)
    .where(eq(redirects.isActive, true));

  const map = new Map<string, CachedRedirect>();
  for (const r of rows) {
    map.set(r.fromPath, {
      fromPath: r.fromPath,
      toPath: r.toPath,
      statusCode: r.statusCode,
      isActive: r.isActive,
    });
  }
  return map;
}

export async function getRedirects(source?: RedirectSource) {
  if (source) {
    return db
      .select()
      .from(redirects)
      .where(eq(redirects.source, source))
      .orderBy(redirects.createdAt);
  }
  return db.select().from(redirects).orderBy(redirects.createdAt);
}

/**
 * Hot-path lookup called by the proxy on every navigable request. Reads
 * from an in-memory `Map<fromPath, redirect>` and returns the row or
 * null in O(1). The first call after a TTL expiry pays a single
 * `SELECT * FROM redirects WHERE is_active = true` round-trip; everything
 * else is served from memory.
 *
 * The cached entries already pre-filter `is_active = true`, so the
 * proxy's `redirect.isActive` check is effectively a no-op on cached
 * results — it stays as a safety net.
 */
export async function getRedirectByFromPath(fromPath: string) {
  if (_cache === null || Date.now() - _cacheAt >= CACHE_TTL_MS) {
    try {
      _cache = await loadCache();
      _cacheAt = Date.now();
    } catch {
      // DB unavailable — degrade silently. The proxy's catch around this
      // call already handles a null/undefined return safely.
      return null;
    }
  }
  return _cache.get(fromPath) ?? null;
}

export async function upsertRedirect(data: {
  id?: number;
  fromPath: string;
  toPath: string;
  statusCode?: 301 | 302 | 307 | 308;
  isActive?: boolean;
  source?: RedirectSource;
  pageId?: number | null;
  locale?: string | null;
}) {
  const { id, ...rest } = data;
  const payload = {
    fromPath: rest.fromPath,
    toPath: rest.toPath,
    statusCode: rest.statusCode ?? 301,
    isActive: rest.isActive ?? true,
    source: rest.source ?? "manual",
    pageId: rest.pageId ?? null,
    locale: rest.locale ?? null,
    updatedAt: new Date(),
  };

  if (id) {
    await db.update(redirects).set(payload).where(eq(redirects.id, id));
  } else {
    await db
      .insert(redirects)
      .values(payload)
      .onConflictDoUpdate({
        target: redirects.fromPath,
        // Per i redirect manuali non sovrascrivere un auto_slug esistente con
        // lo stesso fromPath. Per auto_slug sovrascrive sempre.
        set: payload,
      });
  }
  invalidateCache();
}

export async function deleteRedirect(id: number) {
  await db.delete(redirects).where(eq(redirects.id, id));
  invalidateCache();
}

export async function toggleRedirectActive(id: number, isActive: boolean) {
  await db
    .update(redirects)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(redirects.id, id));
  invalidateCache();
}

/**
 * Crea un redirect automatico quando lo slug di una pagina cambia.
 *
 * Logica chain-flattening: aggiorna tutti i redirect auto_slug esistenti che
 * puntavano al vecchio path, facendoli puntare al nuovo. Evita catene A→B→C.
 *
 * Se fromPath = toPath (rename circolare) → no-op.
 * Se il toPath era gia' un fromPath di un redirect precedente → rimuove quel
 * redirect (il vecchio URL torna ad essere canonico).
 */
export async function createAutoSlugRedirect(params: {
  pageId: number;
  locale: string | null;
  fromPath: string;
  toPath: string;
}) {
  const { pageId, locale, fromPath, toPath } = params;
  if (fromPath === toPath) return;

  // Rimuovi eventuali redirect che avevano toPath = fromPath (il nuovo toPath
  // e' il canonical, il vecchio fromPath non e' piu' "intermedio").
  const obsolete = await db
    .select({ id: redirects.id })
    .from(redirects)
    .where(and(eq(redirects.source, "auto_slug"), eq(redirects.fromPath, toPath)));
  for (const r of obsolete) {
    await db.delete(redirects).where(eq(redirects.id, r.id));
  }

  // Chain flattening: tutti gli auto_slug che puntavano all'old path ora
  // puntano al nuovo path (A→B diventa A→C quando B diventa C).
  await db
    .update(redirects)
    .set({ toPath, updatedAt: new Date() })
    .where(and(eq(redirects.source, "auto_slug"), eq(redirects.toPath, fromPath)));

  // Crea/aggiorna il redirect principale.
  await db
    .insert(redirects)
    .values({
      fromPath,
      toPath,
      statusCode: 301,
      isActive: true,
      source: "auto_slug",
      pageId,
      locale,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: redirects.fromPath,
      set: { toPath, source: "auto_slug", pageId, locale, updatedAt: new Date() },
    });
  invalidateCache();
}

/**
 * Force-invalidate the in-memory redirect cache. Exported for tests and
 * for any future caller that mutates redirects outside this module —
 * the four CRUD functions above already invalidate themselves.
 */
export function invalidateRedirectCache(): void {
  invalidateCache();
}
