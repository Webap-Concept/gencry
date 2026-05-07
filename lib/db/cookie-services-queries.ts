import { db } from "@/lib/db/drizzle";
import {
  cookieCategories,
  cookieServices,
  cookieServiceTranslations,
  type CookieCategory,
  type CookieService,
  type CookieServiceTranslation,
} from "@/lib/db/schema";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { and, asc, eq, inArray } from "drizzle-orm";

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

// ── Cache module-level ─────────────────────────────────────────────────────
//
// Il banner pubblico vede questa cache via prefetch del RootLayout. Su
// Vercel serverless ogni warm istanza condivide il cache → 1 query DB
// ogni 10min per istanza, anche con migliaia di visitatori al minuto.
// Le mutate dell'admin chiamano `invalidateCookieRegistryCache()` per
// invalidare immediatamente.
const CACHE_TTL_MS = 10 * 60_000;
let _cache: CookieRegistry | null = null;
let _cacheAt = 0;

export function invalidateCookieRegistryCache(): void {
  _cache = null;
  _cacheAt = 0;
}

/** Lettura aggregata cached del registry completo. */
export async function getCookieRegistry(): Promise<CookieRegistry> {
  if (_cache && Date.now() - _cacheAt < CACHE_TTL_MS) return _cache;

  const [categories, services, translations] = await Promise.all([
    db.select().from(cookieCategories).orderBy(asc(cookieCategories.sortOrder)),
    db
      .select()
      .from(cookieServices)
      .orderBy(asc(cookieServices.categoryId), asc(cookieServices.sortOrder)),
    db.select().from(cookieServiceTranslations),
  ]);

  _cache = { categories, services, translations };
  _cacheAt = Date.now();
  return _cache;
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
