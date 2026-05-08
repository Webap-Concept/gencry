import { db } from "@/lib/db/drizzle";
import { appSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";

/**
 * Timestamp dell'ultimo update di `app_settings.cms.custom_css`, usato per
 * cache-bustare il <link rel="stylesheet" href="/api/cms/styles.css?v=…">
 * emesso dal renderer CmsPage.
 *
 * Senza questo, anche dopo un save lato admin il browser dell'utente (e di
 * eventuali CDN) servirebbe la copia in cache fino allo scadere di
 * `Cache-Control: max-age=300` (5 minuti). Con il querystring agganciato
 * all'updated_at, il save cambia l'URL → cache miss → fetch immediato.
 *
 * Performance: `unstable_cache` con tag `cms-styles` evita la query DB ad
 * ogni render. Sul save, `revalidateTag("cms-styles")` invalida questa
 * cache; il prossimo render legge il nuovo timestamp.
 *
 * Fallback: se la riga non esiste (admin non ha mai salvato), torna 0 →
 * URL `?v=0`. Stabile finché l'admin non personalizza, dopo cambia.
 */
export const getCmsStylesVersion = unstable_cache(
  async (): Promise<number> => {
    const rows = await db
      .select({ updatedAt: appSettings.updatedAt })
      .from(appSettings)
      .where(eq(appSettings.key, "cms.custom_css"))
      .limit(1);
    return rows[0]?.updatedAt?.getTime() ?? 0;
  },
  ["cms-styles-version"],
  { tags: ["cms-styles"], revalidate: 3600 },
);
