import { db } from "./drizzle";
import { redirects } from "./schema";
import { and, eq, or } from "drizzle-orm";

export type RedirectSource = "manual" | "auto_slug";

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

export async function getRedirectByFromPath(fromPath: string) {
  const rows = await db
    .select()
    .from(redirects)
    .where(eq(redirects.fromPath, fromPath))
    .limit(1);
  return rows[0] ?? null;
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
}

export async function deleteRedirect(id: number) {
  await db.delete(redirects).where(eq(redirects.id, id));
}

export async function toggleRedirectActive(id: number, isActive: boolean) {
  await db
    .update(redirects)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(redirects.id, id));
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
}
