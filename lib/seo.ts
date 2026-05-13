import { getSeoPage as _getSeoPage } from "@/lib/db/seo-queries";
import { getAppSettings as _getAppSettings } from "@/lib/db/settings-queries";
import { resolvePlaceholders } from "@/lib/utils/content-placeholders";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { connection } from "next/server";
/**
 * Versione cached di getSeoPage — revalidata ogni 60s o su revalidateTag('seo').
 * Esportata per i call site ad alto traffico (es. `app/not-found.tsx` per
 * la 404, `cms-page.tsx` per ogni page CMS pubblica) che devono evitare
 * un round-trip al DB ad ogni hit.
 *
 * Locale opzionale: cms-page passa il locale corrente per ottenere
 * l'overlay seo_page_translations sui 4 campi testuali. Cache key
 * include il locale, quindi `/azienda` IT e `/azienda` EN sono entries
 * separate (60s ciascuna). Se locale è omesso, cache la riga base.
 *
 * Fallback graceful: se il DB fallisce (statement_timeout 57014 visto su
 * Sentry sotto burst di 404), ritorna undefined invece di propagare —
 * `generatePageMetadata` cade sui defaults e la pagina non crasha. Il
 * try/catch sta FUORI dalla cache così non finisce nei 60s di TTL.
 */
const _cachedSeoPage = unstable_cache(
  (pathname: string, locale?: string) => _getSeoPage(pathname, locale),
  ["seo-page"],
  { revalidate: 60, tags: ["seo"] },
);
export async function getCachedSeoPage(pathname: string, locale?: string) {
  try {
    return await _cachedSeoPage(pathname, locale);
  } catch (err) {
    console.warn(
      `[getCachedSeoPage] lookup failed for ${pathname}` +
        (locale ? ` (locale=${locale})` : "") +
        `, falling back to undefined`,
      err,
    );
    return undefined;
  }
}

/**
 * Versione cached di getAppSettings — revalidata ogni 60s o su revalidateTag('settings').
 * Niente try/catch: settings sono richieste anche dai layout autenticati
 * dove un fallback parziale romperebbe più di quel che salva. Se il DB
 * non risponde, vogliamo l'error boundary, non un undefined silenzioso.
 */
export const getCachedAppSettings = unstable_cache(
  () => _getAppSettings(),
  ["app-settings"],
  { revalidate: 60, tags: ["settings"] },
);

/**
 * Restituisce il dominio configurato nelle impostazioni.
 * Normalizza aggiungendo "https://" se mancante e rimuovendo lo slash finale.
 */
export async function getSiteUrl(): Promise<string> {
  const settings = await getCachedAppSettings();
  let domain = settings.app_domain?.trim() ?? "";
  if (!domain) return "";
  if (!/^https?:\/\//i.test(domain)) domain = `https://${domain}`;
  return domain.replace(/\/$/, "");
}

/**
 * Converte il valore stringa salvato in DB nel formato robots atteso da Next.js.
 * Tollera spazi nella stringa salvata (es. "noindex, follow" oltre a
 * "noindex,follow") perché entrambe le forme sono in giro nel DB.
 */
function mapRobots(robots?: string | null): Metadata["robots"] | undefined {
  if (!robots) return undefined;
  const normalized = robots.replace(/\s+/g, "").toLowerCase();
  if (normalized === "noindex,nofollow") return { index: false, follow: false };
  if (normalized === "noindex,follow") return { index: false, follow: true };
  return undefined;
}

/**
 * Genera metadata per una pagina leggendo da DB (con cache), con fallback sensati.
 * Il nome dell'app viene letto dinamicamente dalle impostazioni — mai hardcoded.
 *
 * `defaults.image` permette ai chiamanti dinamici (es. la pagina coin
 * `/coins/[symbol]`) di passare un'immagine OG/Twitter senza dover
 * registrare una riga in `seo_pages` per ogni record: se l'admin
 * inserisce un override in DB, quello vince; altrimenti si usa il
 * default passato dal call site.
 */
export async function generatePageMetadata(
  pathname: string,
  defaults?: {
    title?: string;
    description?: string;
    image?: string;
    /** OG/Twitter overrides separati dalla `description` SERP. Utile quando
     *  la description SERP contiene dati dinamici (es. prezzo live per le
     *  coin) ma vuoi che gli share social mostrino una versione statica
     *  per evitare card "stale" cachate da Twitter/FB. Se omessi, ricadono
     *  rispettivamente su `title` e `description`. */
    ogTitle?: string;
    ogDescription?: string;
  },
): Promise<Metadata> {
  await connection();
  const [row, settings, siteUrl] = await Promise.all([
    getCachedSeoPage(pathname),
    getCachedAppSettings(),
    getSiteUrl(),
  ]);

  const appName = settings.app_name?.trim() || "App";
  // resolvePlaceholders gestisce {{appName}}, {{appDescription}}, {{appDomain}},
  // {{emailFrom}}, {{currentYear}}: stesso set usato dal CMS per il content.
  const resolve = (text: string) => resolvePlaceholders(text, settings);

  const title = resolve(row?.title || defaults?.title || appName);
  const description = resolve(
    row?.description || defaults?.description || `Welcome to ${appName}.`,
  );
  // OG/Twitter: DB override > default caller > description SERP.
  const ogTitle = resolve(row?.ogTitle || defaults?.ogTitle || title);
  const ogDescription = resolve(
    row?.ogDescription || defaults?.ogDescription || description,
  );

  const canonical = siteUrl ? `${siteUrl}${pathname}` : undefined;
  const robots = mapRobots(row?.robots);

  // OG image: DB override vince, altrimenti default passato dal caller.
  const ogImage = row?.ogImage ?? defaults?.image;

  return {
    title,
    description,
    ...(canonical ? { alternates: { canonical } } : {}),
    ...(robots ? { robots } : {}),
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      ...(canonical ? { url: canonical } : {}),
      siteName: appName,
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: ogDescription,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}
