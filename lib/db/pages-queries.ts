import { db } from "@/lib/db/drizzle";
import { pages, pageTemplates, pageVersions, pageTranslations, appLocales, templateFields, type NewPage, type Page, type PageTranslation, type AppLocale, type PageTemplate, type TemplateField, type SystemPageKey, type RouteVisibility } from "@/lib/db/schema";
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";

export type { PageTranslation, AppLocale };

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

export async function getAllPages(): Promise<Page[]> {
  return db.select().from(pages).orderBy(asc(pages.sortOrder), asc(pages.slug));
}

// ---------------------------------------------------------------------------
// Navigable pages — usate da proxy.ts per la routing visibility
// ---------------------------------------------------------------------------

/**
 * Cache in-memory per `getNavigablePages` (TTL 60s).
 * Stesso pattern di route-registry-queries.ts: il proxy gira su ogni request,
 * non possiamo pagare un round-trip al DB ogni volta. La cache viene
 * invalidata dalla server action che salva una page (vedi
 * `app/(admin)/admin/content/pages/actions.ts`) tramite
 * `invalidateNavigablePagesCache()`.
 */
type NavigablePage = { pathname: string; visibility: RouteVisibility };
let _navCache: NavigablePage[] | null = null;
let _navCacheAt = 0;
const NAV_CACHE_TTL_MS = 60_000;

export function invalidateNavigablePagesCache() {
  _navCache = null;
  _navCacheAt = 0;
}

/**
 * Restituisce tutte le pages pubblicate sotto forma di {pathname, visibility},
 * pronte per il pattern matching del proxy. Una page con slug "" diventa "/",
 * uno slug "esplora" diventa "/esplora".
 *
 * NB: include sia user CMS pages (visibility='public' di default) sia system
 * pages "meta-only" — le seconde non vengono comunque navigate (i page handler
 * dedicati le servono direttamente, e il guard in [...slug]/page.tsx blocca il
 * render della system page CMS), ma non fanno male nella lista.
 */
export async function getNavigablePages(): Promise<NavigablePage[]> {
  if (_navCache !== null && Date.now() - _navCacheAt < NAV_CACHE_TTL_MS) {
    return _navCache;
  }
  const rows = await db
    .select({ slug: pages.slug, visibility: pages.visibility })
    .from(pages)
    .where(eq(pages.status, "published"));

  const list: NavigablePage[] = rows.map((r) => ({
    pathname: `/${r.slug}`,
    visibility: r.visibility,
  }));

  // Aggiunge gli slug locale-specifici (es. /en/page-name) con la stessa
  // visibility della pagina madre — necessario per il proxy ACL.
  const localeRows = await db
    .select({
      slug: pageTranslations.slug,
      locale: pageTranslations.locale,
      visibility: pages.visibility,
    })
    .from(pageTranslations)
    .innerJoin(pages, and(eq(pages.id, pageTranslations.pageId), eq(pages.status, "published")))
    .where(isNotNull(pageTranslations.slug));

  for (const r of localeRows) {
    if (r.slug) {
      list.push({ pathname: `/${r.locale}/${r.slug}`, visibility: r.visibility });
    }
  }

  _navCache = list;
  _navCacheAt = Date.now();
  return list;
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

/**
 * Recupera una pagina di sistema dalla `systemKey` invece che dallo `slug`.
 * Più robusto del lookup per slug perché la systemKey è stabile mentre lo
 * slug può essere rinominato dall'admin.
 */
export async function getPageBySystemKey(
  key: SystemPageKey,
): Promise<Page | undefined> {
  const [row] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.isSystem, true), eq(pages.systemKey, key)))
    .limit(1);
  return row;
}

/**
 * Versione cached di `getPageBySystemKey` — pensata per i call site ad alto
 * traffico come la 404 page, dove ogni request del bot/scanner farebbe
 * altrimenti una query DB. Il tag dinamico `page:system:${key}` permette
 * di invalidare selettivamente solo la system page modificata
 * (vedi `revalidateTag` in `upsertPageAction` / `deletePageAction`).
 *
 * 60s di TTL come fallback se l'invalidazione viene saltata (es. errore
 * nell'admin action): la pagina si auto-aggiorna comunque entro un minuto.
 */
export async function getCachedPageBySystemKey(
  key: SystemPageKey,
): Promise<Page | undefined> {
  const cached = unstable_cache(
    () => getPageBySystemKey(key),
    [`page-by-system-key`, key],
    { revalidate: 60, tags: [`page:system:${key}`] },
  );
  return cached();
}

export async function getPageById(id: number): Promise<Page | undefined> {
  const [row] = await db
    .select()
    .from(pages)
    .where(eq(pages.id, id))
    .limit(1);
  return row;
}

/** Carica pagina con template e campi custom — usato dal frontend.
 *
 * Se `locale` e' diverso dal DEFAULT_LOCALE e la pagina ha una traduzione,
 * sovrascrive title/content con i valori tradotti (overlay).
 *
 * Lookup per non-default locale:
 *   1. Cerca slug in page_translations WHERE locale=X AND slug=<slug> -> pageId
 *   2. Fallback: cerca pages.slug = <slug> (slug default funziona anche con prefix)
 */
export async function getPageWithTemplate(
  slug: string,
  locale: string = DEFAULT_LOCALE,
): Promise<(Page & { template: (PageTemplate & { fields: TemplateField[] }) | null; translation?: PageTranslation | null }) | undefined> {
  let page: Page | undefined;
  let translation: PageTranslation | null = null;

  if (locale !== DEFAULT_LOCALE) {
    const [byLocaleSlug] = await db
      .select()
      .from(pageTranslations)
      .where(and(eq(pageTranslations.locale, locale), eq(pageTranslations.slug, slug)))
      .limit(1);

    if (byLocaleSlug) {
      const [p] = await db.select().from(pages).where(eq(pages.id, byLocaleSlug.pageId)).limit(1);
      page = p;
      translation = byLocaleSlug;
    }
  }

  if (!page) {
    const [p] = await db.select().from(pages).where(eq(pages.slug, slug)).limit(1);
    page = p;

    if (page && locale !== DEFAULT_LOCALE && !translation) {
      const [t] = await db
        .select()
        .from(pageTranslations)
        .where(and(eq(pageTranslations.pageId, page.id), eq(pageTranslations.locale, locale)))
        .limit(1);
      translation = t ?? null;
    }
  }

  if (!page) return undefined;

  const overlaid: Page = translation
    ? {
        ...page,
        title: translation.title ?? page.title,
        content:
          translation.content !== null &&
          translation.content !== undefined &&
          translation.content.trim() !== ""
            ? translation.content
            : page.content,
      }
    : page;

  if (!overlaid.templateId) return { ...overlaid, template: null, translation };

  const [template] = await db
    .select()
    .from(pageTemplates)
    .where(eq(pageTemplates.id, overlaid.templateId))
    .limit(1);

  if (!template) return { ...overlaid, template: null, translation };

  const fields = await db
    .select()
    .from(templateFields)
    .where(eq(templateFields.templateId, template.id))
    .orderBy(asc(templateFields.sortOrder));

  return { ...overlaid, template: { ...template, fields }, translation };
}

/** Restituisce tutti gli URL alternativi di una pagina (per hreflang). */
export async function getPageLocaleUrls(
  pageId: number,
  defaultSlug: string,
  appDomain: string,
): Promise<{ locale: string; url: string }[]> {
  const base = appDomain.startsWith("http")
    ? appDomain.replace(/\/$/, "")
    : `https://${appDomain}`;

  const urls: { locale: string; url: string }[] = [
    { locale: DEFAULT_LOCALE, url: `${base}/${defaultSlug}` },
  ];

  const rows = await db
    .select({ locale: pageTranslations.locale, slug: pageTranslations.slug })
    .from(pageTranslations)
    .where(and(eq(pageTranslations.pageId, pageId), isNotNull(pageTranslations.slug)));

  for (const r of rows) {
    if (r.slug) {
      urls.push({ locale: r.locale, url: `${base}/${r.locale}/${r.slug}` });
    }
  }

  return urls;
}

/** Carica tutte le traduzioni di una pagina per il page editor admin. */
export async function getPageTranslationsForPage(pageId: number): Promise<PageTranslation[]> {
  return db
    .select()
    .from(pageTranslations)
    .where(eq(pageTranslations.pageId, pageId))
    .orderBy(asc(pageTranslations.locale));
}

/** Upsert o delete di una traduzione pagina per una locale non-default.
 * Se title/content/slug sono tutti vuoti -> elimina la riga.
 */
export async function upsertPageTranslation(data: {
  pageId: number;
  locale: string;
  title: string | null;
  content: string | null;
  slug: string | null;
}): Promise<void> {
  const hasData =
    (data.title && data.title.trim()) ||
    (data.content && data.content.trim()) ||
    (data.slug && data.slug.trim());

  if (!hasData) {
    await db
      .delete(pageTranslations)
      .where(and(eq(pageTranslations.pageId, data.pageId), eq(pageTranslations.locale, data.locale)));
    return;
  }

  await db
    .insert(pageTranslations)
    .values({
      pageId: data.pageId,
      locale: data.locale,
      slug: data.slug?.trim() || null,
      title: data.title?.trim() || null,
      content: data.content?.trim() || null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [pageTranslations.pageId, pageTranslations.locale],
      set: {
        slug: sql`excluded.slug`,
        title: sql`excluded.title`,
        content: sql`excluded.content`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
}

/** Carica tutte le locale abilitate dal DB (per i tab lingua nel page editor). */
export async function getEnabledLocales(): Promise<AppLocale[]> {
  return db
    .select()
    .from(appLocales)
    .where(eq(appLocales.enabled, true))
    .orderBy(asc(appLocales.sortOrder), asc(appLocales.code));
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
    cookie: "cookie-policy",
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
 * Snapshot completo (versione + testo) delle 3 pagine di sistema, usato
 * dai signup-flows per calcolare lo SHA-256 del testo policy che l'utente
 * ha "visto" al momento dell'accettazione (vedi consent-ledger.ts).
 *
 * Ritorna `null` per le pagine non presenti / senza systemKey valido così
 * il consumer può scegliere se loggare comunque (con policyTextHash null)
 * o saltare il consenso.
 */
export type ConsentPageSnapshot = {
  version: string;
  text: string;
};

export type ConsentPageSnapshots = {
  terms: ConsentPageSnapshot | null;
  privacy: ConsentPageSnapshot | null;
  marketing: ConsentPageSnapshot | null;
};

export async function getConsentSnapshots(): Promise<ConsentPageSnapshots> {
  const rows = await db
    .select({
      systemKey: pages.systemKey,
      contentVersion: pages.contentVersion,
      content: pages.content,
    })
    .from(pages)
    .where(eq(pages.isSystem, true));

  const byKey = new Map<string, ConsentPageSnapshot>();
  for (const r of rows) {
    if (!r.systemKey) continue;
    byKey.set(r.systemKey, { version: r.contentVersion, text: r.content });
  }

  return {
    terms: byKey.get("terms") ?? null,
    privacy: byKey.get("privacy") ?? null,
    marketing: byKey.get("marketing") ?? null,
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
    let bumpedSystemKey: SystemPageKey | null = null;
    if (rest.isSystem) {
      const existing = await db.select().from(pages).where(eq(pages.id, id)).limit(1);
      const current = existing[0];
      if (current && rest.content !== undefined && rest.content !== current.content) {
        nextVersion = computeNextContentVersion(current.contentVersion);
        bumpedSystemKey = (current.systemKey ?? rest.systemKey ?? null) as
          | SystemPageKey
          | null;

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
        visibility: rest.visibility ?? "public",
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

    // Hook re-consent: se la pagina aggiornata è terms/privacy/marketing
    // e c'è stato un bump di versione, enqueue le notifiche per gli utenti
    // con versione obsoleta (no-op se gdpr.policy.force_reconsent_on_change=off).
    if (
      nextVersion &&
      (bumpedSystemKey === "terms" ||
        bumpedSystemKey === "privacy" ||
        bumpedSystemKey === "marketing")
    ) {
      const { enqueuePolicyChangeNotifications } = await import(
        "@/lib/account/policy-reconsent"
      );
      await enqueuePolicyChangeNotifications(bumpedSystemKey, nextVersion);
    }

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
          visibility: data.visibility ?? "public",
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

/**
 * Aggiorna il `sortOrder` di un set di pagine in batch. Usato dalla
 * UI admin quando l'utente trascina le righe per riordinarle.
 * Non valida i parentId — il caller (server action) si occupa di
 * passare solo aggiornamenti coerenti (siblings dello stesso parent).
 */
export async function reorderPages(
  updates: { id: number; sortOrder: number }[],
): Promise<void> {
  if (updates.length === 0) return;
  const now = new Date();
  await Promise.all(
    updates.map((u) =>
      db
        .update(pages)
        .set({ sortOrder: u.sortOrder, updatedAt: now })
        .where(eq(pages.id, u.id)),
    ),
  );
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
