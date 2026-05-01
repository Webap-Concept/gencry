import { db } from "@/lib/db/drizzle";
import { pages, pageTemplates, pageVersions, templateFields, type NewPage, type Page, type PageTemplate, type TemplateField, type SystemPageKey } from "@/lib/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

export async function getAllPages(): Promise<Page[]> {
  return db.select().from(pages).orderBy(asc(pages.sortOrder), asc(pages.slug));
}

/** Restituisce le pagine root (senza parent) con le loro figlie dirette */
export async function getPagesTree(): Promise<(Page & { children: Page[] })[]> {
  const all = await db.select().from(pages).orderBy(asc(pages.sortOrder), asc(pages.slug));
  const roots = all.filter((p) => !p.parentId);
  return roots.map((root) => ({
    ...root,
    children: all.filter((p) => p.parentId === root.id),
  }));
}

export async function getPublishedPages(): Promise<Pick<Page, "slug" | "title">[]> {
  return db
    .select({ slug: pages.slug, title: pages.title })
    .from(pages)
    .where(eq(pages.status, "published"))
    .orderBy(asc(pages.slug));
}

export async function getPageBySlug(slug: string): Promise<Page | undefined> {
  const [row] = await db
    .select()
    .from(pages)
    .where(eq(pages.slug, slug))
    .limit(1);
  return row;
}

export async function getPageById(id: number): Promise<Page | undefined> {
  const [row] = await db
    .select()
    .from(pages)
    .where(eq(pages.id, id))
    .limit(1);
  return row;
}

/** Carica pagina con template e campi custom — usato dal frontend */
export async function getPageWithTemplate(
  slug: string,
): Promise<(Page & { template: (PageTemplate & { fields: TemplateField[] }) | null }) | undefined> {
  const [page] = await db.select().from(pages).where(eq(pages.slug, slug)).limit(1);
  if (!page) return undefined;

  if (!page.templateId) return { ...page, template: null };

  const [template] = await db
    .select()
    .from(pageTemplates)
    .where(eq(pageTemplates.id, page.templateId))
    .limit(1);

  if (!template) return { ...page, template: null };

  const fields = await db
    .select()
    .from(templateFields)
    .where(eq(templateFields.templateId, template.id))
    .orderBy(asc(templateFields.sortOrder));

  return { ...page, template: { ...template, fields } };
}

// ---------------------------------------------------------------------------
// Slug delle pagine di sistema — usato dal form di signup
// ---------------------------------------------------------------------------

/**
 * Restituisce uno slug per ogni systemKey presente nel DB.
 * Se una pagina di sistema non esiste ancora, fornisce un fallback sensato.
 *
 * Esempio di ritorno:
 *   { terms: "termini-e-condizioni", privacy: "privacy-policy", marketing: "marketing-comunicazioni" }
 */
export async function getSystemPageSlugs(): Promise<Record<string, string>> {
  const systemPages = await db
    .select({ systemKey: pages.systemKey, slug: pages.slug })
    .from(pages)
    .where(eq(pages.isSystem, true));

  const fallbacks: Record<string, string> = {
    terms: "termini-e-condizioni",
    privacy: "privacy-policy",
    marketing: "marketing-comunicazioni",
  };

  const fromDb = Object.fromEntries(
    systemPages
      .filter((p) => p.systemKey !== null)
      .map((p) => [p.systemKey!, p.slug]),
  );

  return { ...fallbacks, ...fromDb };
}

// ---------------------------------------------------------------------------
// Versioning del contenuto per pagine di sistema
// ---------------------------------------------------------------------------

/**
 * Calcola la nuova versione quando il contenuto di una pagina di sistema cambia.
 * Formato: "{numero}-{YYYY}-{MM}"  es. "1-2026-04", "2-2026-07"
 * - Se il mese/anno corrente è diverso dall'ultimo salvato → resetta a 1
 * - Altrimenti incrementa il numero progressivo
 */
export function computeNextContentVersion(currentVersion: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const currentYM = `${year}-${month}`;

  // Formato atteso: "N-YYYY-MM"
  const match = currentVersion.match(/^(\d+)-(\d{4})-(\d{2})$/);
  if (match) {
    const [, numStr, vYear, vMonth] = match;
    const savedYM = `${vYear}-${vMonth}`;
    if (savedYM === currentYM) {
      return `${Number(numStr) + 1}-${currentYM}`;
    }
  }
  // Mese diverso oppure formato non riconosciuto → inizia da 1 nel mese corrente
  return `1-${currentYM}`;
}

/**
 * Restituisce le versioni correnti delle 3 pagine di sistema.
 * Usato dall'action del form di registrazione al posto delle costanti hardcodate.
 */
export async function getConsentVersions(): Promise<{
  termsVersion: string;
  privacyVersion: string;
  marketingVersion: string;
}> {
  const systemPages = await db
    .select({ systemKey: pages.systemKey, contentVersion: pages.contentVersion })
    .from(pages)
    .where(eq(pages.isSystem, true));

  const byKey = Object.fromEntries(
    systemPages
      .filter((p) => p.systemKey !== null)
      .map((p) => [p.systemKey!, p.contentVersion]),
  );

  return {
    termsVersion: byKey["terms"] ?? "1-2026-04",
    privacyVersion: byKey["privacy"] ?? "1-2026-04",
    marketingVersion: byKey["marketing"] ?? "1-2026-04",
  };
}

/**
 * Crea o aggiorna una pagina.
 * - Se `data.id` è presente → UPDATE WHERE id (gestisce cambio slug senza duplicati).
 * - Se `data.id` è assente → INSERT ... ON CONFLICT (slug) DO UPDATE (crea nuova pagina).
 * - Se la pagina è di sistema (isSystem=true) e il contenuto è cambiato,
 *   calcola e aggiorna automaticamente contentVersion.
 * Ritorna sempre l'id della riga.
 */
export async function upsertPage(data: NewPage & { id?: number }): Promise<number> {
  if (data.id) {
    const { id, ...rest } = data;

    // Calcola nuova versione solo per pagine di sistema quando il contenuto cambia
    let nextVersion: string | undefined;
    if (rest.isSystem) {
      const existing = await db.select().from(pages).where(eq(pages.id, id)).limit(1);
      const current = existing[0];
      if (current && rest.content !== undefined && rest.content !== current.content) {
        nextVersion = computeNextContentVersion(current.contentVersion);

        // Snapshotta la VECCHIA versione in page_versions prima di sovrascriverla:
        // così gli utenti che l'avevano accettata possono ancora rileggerne il
        // testo originale da /settings/privacy. ON CONFLICT è no-op se per
        // qualche motivo lo snapshot esiste già (es. seed iniziale + edit).
        await db
          .insert(pageVersions)
          .values({
            pageId: id,
            contentVersion: current.contentVersion,
            title: current.title,
            content: current.content,
          })
          .onConflictDoNothing({
            target: [pageVersions.pageId, pageVersions.contentVersion],
          });
      }
    }

    await db
      .update(pages)
      .set({
        slug: rest.slug,
        title: rest.title,
        content: rest.content,
        status: rest.status,
        publishedAt: rest.publishedAt ?? null,
        expiresAt: rest.expiresAt ?? null,
        parentId: rest.parentId ?? null,
        templateId: rest.templateId ?? null,
        customFields: rest.customFields ?? "{}",
        pageType: rest.pageType ?? "page",
        sortOrder: rest.sortOrder ?? 0,
        ...(nextVersion ? { contentVersion: nextVersion } : {}),
        updatedAt: new Date(),
      })
      .where(eq(pages.id, id));
    return id;
  } else {
    const [row] = await db
      .insert(pages)
      .values(data)
      .onConflictDoUpdate({
        target: pages.slug,
        set: {
          title: data.title,
          content: data.content,
          status: data.status,
          publishedAt: data.publishedAt ?? null,
          expiresAt: data.expiresAt ?? null,
          parentId: data.parentId ?? null,
          templateId: data.templateId ?? null,
          customFields: data.customFields ?? "{}",
          pageType: data.pageType ?? "page",
          sortOrder: data.sortOrder ?? 0,
          updatedAt: new Date(),
        },
      })
      .returning({ id: pages.id });
    return row.id;
  }
}

/**
 * Raccoglie ricorsivamente tutti gli id discendenti di una pagina (figli, nipoti, …).
 */
async function collectDescendantIds(rootId: number): Promise<number[]> {
  const all = await db.select({ id: pages.id, parentId: pages.parentId }).from(pages);
  const ids: number[] = [];
  const queue = [rootId];
  while (queue.length) {
    const current = queue.shift()!;
    const children = all.filter((p) => p.parentId === current);
    for (const child of children) {
      ids.push(child.id);
      queue.push(child.id);
    }
  }
  return ids;
}

/**
 * Elimina una pagina e TUTTI i suoi discendenti (cascade applicativo).
 * Le pagine di sistema (isSystem=true) non possono essere eliminate.
 * Ritorna il numero totale di righe eliminate (inclusa la pagina radice).
 */
export async function deletePageCascade(slug: string): Promise<number> {
  const [root] = await db.select().from(pages).where(eq(pages.slug, slug)).limit(1);
  if (!root) return 0;

  if (root.isSystem) {
    throw new Error("SYSTEM_PAGE_PROTECTED");
  }

  const descendantIds = await collectDescendantIds(root.id);
  const allIds = [...descendantIds, root.id];

  await db.delete(pages).where(inArray(pages.id, allIds));
  return allIds.length;
}

export async function deletePage(slug: string): Promise<void> {
  await db.delete(pages).where(eq(pages.slug, slug));
}

/**
 * Conta i discendenti diretti e totali di una pagina dato il suo id.
 */
export async function countDescendants(pageId: number): Promise<{ direct: number; total: number }> {
  const all = await db.select({ id: pages.id, parentId: pages.parentId }).from(pages);
  const direct = all.filter((p) => p.parentId === pageId).length;
  const ids: number[] = [];
  const queue = [pageId];
  while (queue.length) {
    const current = queue.shift()!;
    const children = all.filter((p) => p.parentId === current);
    for (const child of children) {
      ids.push(child.id);
      queue.push(child.id);
    }
  }
  return { direct, total: ids.length };
}

/** Inverte lo status published <-> draft aggiornando publishedAt se necessario */
export async function togglePageStatus(id: number, currentStatus: string): Promise<void> {
  const newStatus = currentStatus === "published" ? "draft" : "published";
  const now = new Date();
  await db
    .update(pages)
    .set({
      status: newStatus as "draft" | "published",
      publishedAt: newStatus === "published" ? now : undefined,
      updatedAt: now,
    })
    .where(eq(pages.id, id));
}
