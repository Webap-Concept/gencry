import { getSeoPage as _getSeoPage } from "@/lib/db/seo-queries";
import { getAppSettings as _getAppSettings } from "@/lib/db/settings-queries";
import { resolvePlaceholders } from "@/lib/utils/content-placeholders";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { connection } from "next/server";
/**
 * Versione cached di getSeoPage — revalidata ogni 60s o su revalidateTag('seo').
 * Esportata per i call site ad alto traffico (es. `app/not-found.tsx`) che
 * devono evitare un round-trip al DB ad ogni hit.
 */
export const getCachedSeoPage = unstable_cache(
  (pathname: string) => _getSeoPage(pathname),
  ["seo-page"],
  { revalidate: 60, tags: ["seo"] },
);

/**
 * Versione cached di getAppSettings — revalidata ogni 60s o su revalidateTag('settings').
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
 */
export async function generatePageMetadata(
  pathname: string,
  defaults?: { title?: string; description?: string },
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
  const ogTitle = resolve(row?.ogTitle || title);
  const ogDescription = resolve(row?.ogDescription || description);

  const canonical = siteUrl ? `${siteUrl}${pathname}` : undefined;
  const robots = mapRobots(row?.robots);

  return {
    title,
    description,
    ...(canonical ? { alternates: { canonical } } : {}),
    ...(robots ? { robots } : {}),
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      ...(canonical ? { url: canonical } : {}),
      ...(row?.ogImage ? { images: [{ url: row.ogImage }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: ogDescription,
      ...(row?.ogImage ? { images: [row.ogImage] } : {}),
    },
  };
}
