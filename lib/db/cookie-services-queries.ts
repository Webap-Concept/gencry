import { db } from "@/lib/db/drizzle";
import {
  cookieCategories,
  cookieServices,
  cookieServiceTranslations,
  siteSnippets,
  type CookieCategory,
  type CookieService,
  type CookieServiceTranslation,
} from "@/lib/db/schema";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { unstable_cache, updateTag } from "next/cache";

/**
 * Vista pubblica del registry: servizio con nome+description già risolti
 * per il locale richiesto, con fallback chain `locale → DEFAULT_LOCALE → id`.
 */
export type CookieServiceLocalized = CookieService & {
  name: string;
  description: string;
};

export type CookieRegistry = {
  categories: CookieCategory[];
  services: CookieService[];
  translations: CookieServiceTranslation[];
};

// ── Cache ──────────────────────────────────────────────────────────────────
//
// Il banner pubblico legge il registry su ogni request del root layout.
// La versione precedente usava un map in-memory (let _cache; ad hoc
// TTL): funzionava finché tutte le query andavano a buon fine, ma se
// il DB sotto burst restituiva un'eccezione (statement_timeout 57014,
// connection drop) l'errore si propagava al render e prendeva giù
// l'intero layout pubblico — Sentry ha mostrato proprio quel pattern.
//
// Ora usiamo `unstable_cache` (coerente cross-instance su Vercel,
// invalidazione via `revalidateTag` dagli admin actions) + un wrapper
// try/catch che ritorna un registry vuoto quando il DB fallisce. Il
// banner mostrerà "no services" invece di crashare; le mutate admin
// continuano a chiamare `invalidateCookieRegistryCache()` per
// propagazione immediata (revalidateTag + reset della cache locale).
const CACHE_TTL_SECONDS = 600;
const COOKIE_REGISTRY_TAG = "cookie-registry";

const EMPTY_REGISTRY: CookieRegistry = {
  categories: [],
  services: [],
  translations: [],
};

const _fetchCookieRegistry = unstable_cache(
  async (): Promise<CookieRegistry> => {
    const [categories, services, translations] = await Promise.all([
      db
        .select()
        .from(cookieCategories)
        .orderBy(asc(cookieCategories.sortOrder)),
      db
        .select()
        .from(cookieServices)
        .orderBy(
          asc(cookieServices.categoryId),
          asc(cookieServices.sortOrder),
        ),
      db.select().from(cookieServiceTranslations),
    ]);
    return { categories, services, translations };
  },
  ["cookie-registry"],
  { revalidate: CACHE_TTL_SECONDS, tags: [COOKIE_REGISTRY_TAG] },
);

export function invalidateCookieRegistryCache(): void {
  // Next 16: inside a Server Action `updateTag(tag)` is the single-arg
  // API with read-your-own-writes semantics (see
  // project_nextjs16_cache_apis memory). Same effect as the old
  // in-memory reset: the next call after a mutate sees fresh data.
  updateTag(COOKIE_REGISTRY_TAG);
}

/** Lettura aggregata cached del registry completo. */
export async function getCookieRegistry(): Promise<CookieRegistry> {
  try {
    return await _fetchCookieRegistry();
  } catch (err) {
    console.warn(
      "[getCookieRegistry] lookup failed, returning empty registry",
      err,
    );
    return EMPTY_REGISTRY;
  }
}

/**
 * Vista localizzata per il banner pubblico: ritorna SOLO i servizi
 * `enabled=true`, raggruppati per categoria, con name/description già
 * risolti nel locale richiesto (fallback DEFAULT_LOCALE → id).
 */
export async function getEnabledCookieServicesLocalized(
  locale: string,
): Promise<Record<string, CookieServiceLocalized[]>> {
  const { services, translations } = await getCookieRegistry();

  const trMap = new Map<string, CookieServiceTranslation>();
  for (const t of translations) trMap.set(`${t.serviceId}:${t.locale}`, t);

  function resolveTr(serviceId: string): { name: string; description: string } {
    const wanted = trMap.get(`${serviceId}:${locale}`);
    if (wanted) return { name: wanted.name, description: wanted.description };
    if (locale !== DEFAULT_LOCALE) {
      const fallback = trMap.get(`${serviceId}:${DEFAULT_LOCALE}`);
      if (fallback) return { name: fallback.name, description: fallback.description };
    }
    // Fallback finale: ID come name, description vuota.
    return { name: serviceId, description: "" };
  }

  const grouped: Record<string, CookieServiceLocalized[]> = {};
  for (const s of services) {
    if (!s.enabled) continue;
    const tr = resolveTr(s.id);
    (grouped[s.categoryId] ??= []).push({ ...s, ...tr });
  }
  return grouped;
}

// ── CRUD helpers (chiamati dalle server actions admin) ─────────────────────

export async function setCookieServiceEnabled(
  id: string,
  enabled: boolean,
): Promise<void> {
  await db
    .update(cookieServices)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(cookieServices.id, id));
  invalidateCookieRegistryCache();
}

export type UpsertCookieServiceData = {
  id: string;
  categoryId: string;
  firstParty?: boolean;
  provider?: string | null;
  providerPolicyUrl?: string | null;
  sortOrder?: number;
  enabled?: boolean;
  requiresSnippet?: boolean;
};

export async function insertCookieService(
  data: UpsertCookieServiceData,
): Promise<void> {
  await db.insert(cookieServices).values({
    id: data.id,
    categoryId: data.categoryId,
    enabled: data.enabled ?? true,
    firstParty: data.firstParty ?? false,
    provider: data.provider ?? null,
    providerPolicyUrl: data.providerPolicyUrl ?? null,
    requiresSnippet: data.requiresSnippet ?? true,
    sortOrder: data.sortOrder ?? 0,
    isSystem: false,
  });
  invalidateCookieRegistryCache();
}

export async function updateCookieService(
  id: string,
  patch: Partial<Omit<UpsertCookieServiceData, "id">>,
): Promise<void> {
  await db
    .update(cookieServices)
    .set({
      ...(patch.categoryId !== undefined && { categoryId: patch.categoryId }),
      ...(patch.firstParty !== undefined && { firstParty: patch.firstParty }),
      ...(patch.provider !== undefined && { provider: patch.provider }),
      ...(patch.providerPolicyUrl !== undefined && {
        providerPolicyUrl: patch.providerPolicyUrl,
      }),
      ...(patch.sortOrder !== undefined && { sortOrder: patch.sortOrder }),
      ...(patch.enabled !== undefined && { enabled: patch.enabled }),
      ...(patch.requiresSnippet !== undefined && {
        requiresSnippet: patch.requiresSnippet,
      }),
      updatedAt: new Date(),
    })
    .where(eq(cookieServices.id, id));
  invalidateCookieRegistryCache();
}

/** Elimina un servizio non-system. Le sue traduzioni cascade-ano per FK. */
export async function deleteCookieService(id: string): Promise<void> {
  await db.delete(cookieServices).where(eq(cookieServices.id, id));
  invalidateCookieRegistryCache();
}

/** Upsert traduzione di un servizio per un locale specifico. */
export async function upsertCookieServiceTranslation(data: {
  serviceId: string;
  locale: string;
  name: string;
  description: string;
}): Promise<void> {
  await db
    .insert(cookieServiceTranslations)
    .values({ ...data, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [
        cookieServiceTranslations.serviceId,
        cookieServiceTranslations.locale,
      ],
      set: {
        name: data.name,
        description: data.description,
        updatedAt: new Date(),
      },
    });
  invalidateCookieRegistryCache();
}

/** Cancella le traduzioni di un servizio in batch (es. dopo eliminazione). */
export async function deleteCookieServiceTranslations(
  serviceIds: string[],
): Promise<void> {
  if (serviceIds.length === 0) return;
  await db
    .delete(cookieServiceTranslations)
    .where(inArray(cookieServiceTranslations.serviceId, serviceIds));
  invalidateCookieRegistryCache();
}

/** Ritorna le traduzioni di un singolo servizio (per il form admin). */
export async function getCookieServiceTranslations(
  serviceId: string,
): Promise<CookieServiceTranslation[]> {
  return db
    .select()
    .from(cookieServiceTranslations)
    .where(eq(cookieServiceTranslations.serviceId, serviceId))
    .orderBy(asc(cookieServiceTranslations.locale));
}

/** Verifica se un service ID è già usato (per validazione admin "add"). */
export async function cookieServiceIdExists(id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: cookieServices.id })
    .from(cookieServices)
    .where(eq(cookieServices.id, id))
    .limit(1);
  return !!row;
}

// ── Vista per il cookie banner pubblico ────────────────────────────────────

/**
 * Forma compatta di un servizio per il banner: solo i campi che servono
 * a renderizzare la lista nella customize-modal. Niente `enabled` (sono
 * già filtrati), niente `isSystem`, niente `sortOrder`.
 */
export type ServiceForBanner = {
  id: string;
  name: string;
  description: string;
  firstParty: boolean;
  provider: string | null;
  providerPolicyUrl: string | null;
};

/**
 * Servizi raggruppati per "shortKey" (la stessa usata nelle keys i18n
 * `public.cookieModal.categories.${shortKey}`). Pronto per essere
 * passato come prop al `<CookieBanner>` client component.
 */
export type BannerServicesByCategory = {
  necessary: ServiceForBanner[];
  preferences: ServiceForBanner[];
  analytics: ServiceForBanner[];
  marketing: ServiceForBanner[];
};

const CATEGORY_TO_SHORT: Record<string, keyof BannerServicesByCategory> = {
  cookie_necessary: "necessary",
  cookie_preferences: "preferences",
  cookie_analytics: "analytics",
  cookie_marketing: "marketing",
};

function toServiceForBanner(s: CookieServiceLocalized): ServiceForBanner {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    firstParty: s.firstParty,
    provider: s.provider,
    providerPolicyUrl: s.providerPolicyUrl,
  };
}

/**
 * Pre-fetch ottimizzato per il banner pubblico: ritorna i servizi
 * `enabled=true` raggruppati per le 4 shortKey ePrivacy fisse, già
 * tradotti nel locale richiesto. Cached via `getCookieRegistry` (10min).
 *
 * Le categorie custom future (non system) NON vengono incluse: il banner
 * pubblico mostra solo le 4 standard ePrivacy.
 */
export async function getServicesForBanner(
  locale: string,
): Promise<BannerServicesByCategory> {
  const grouped = await getEnabledCookieServicesLocalized(locale);
  const out: BannerServicesByCategory = {
    necessary: [],
    preferences: [],
    analytics: [],
    marketing: [],
  };
  for (const [categoryId, services] of Object.entries(grouped)) {
    const shortKey = CATEGORY_TO_SHORT[categoryId];
    if (!shortKey) continue;
    out[shortKey] = services.map(toServiceForBanner);
  }
  return out;
}

// ── Snippet ↔ Service link ────────────────────────────────────────────────
//
// Il count viene usato dall'admin /admin/compliance/cookies per mostrare
// se un servizio "richiede snippet" ha effettivamente uno (o più) snippet
// collegati. Conta SIA attivi che inattivi: un admin che ha lo snippet
// disattivato sa che esiste e può riattivarlo, non vogliamo dirgli "manca".
//
// Cache breve (60s) — il dato cambia solo quando l'admin tocca snippets
// o cookies, e in quei casi le action invalidano `revalidatePath("/", "layout")`
// che invalida l'intera UI admin al prossimo navigate.

let _snippetCountCache: Record<string, number> | null = null;
let _snippetCountAt = 0;
const SNIPPET_COUNT_TTL_MS = 60_000;

export function invalidateSnippetCountCache(): void {
  _snippetCountCache = null;
  _snippetCountAt = 0;
}

/**
 * Mappa serviceId → numero di snippet collegati (qualsiasi stato).
 * I servizi senza snippet collegati semplicemente non compaiono nel record.
 */
export async function getSnippetCountByService(): Promise<Record<string, number>> {
  if (_snippetCountCache && Date.now() - _snippetCountAt < SNIPPET_COUNT_TTL_MS) {
    return _snippetCountCache;
  }
  const rows = await db
    .select({
      serviceId: siteSnippets.cookieServiceId,
      count: sql<number>`count(*)::int`,
    })
    .from(siteSnippets)
    .where(isNotNull(siteSnippets.cookieServiceId))
    .groupBy(siteSnippets.cookieServiceId);

  const out: Record<string, number> = {};
  for (const r of rows) {
    if (r.serviceId) out[r.serviceId] = Number(r.count) || 0;
  }
  _snippetCountCache = out;
  _snippetCountAt = Date.now();
  return out;
}

/**
 * Mappa serviceId → categoryId, derivata dal registry. Usata dal layout
 * runtime per filtrare snippet in base al consenso senza una seconda query.
 */
export function buildServiceCategoryMap(
  registry: CookieRegistry,
): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of registry.services) m.set(s.id, s.categoryId);
  return m;
}
