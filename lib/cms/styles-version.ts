import { db } from "@/lib/db/drizzle";
import { appSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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
 * Nessuna cache lato Next: la CmsPage è già dynamic (export const dynamic
 * = "force-dynamic" nei page handler) quindi questa query gira ad ogni
 * render. Costa ~1 round-trip DB, trascurabile rispetto alle 3-4 query
 * che la pagina fa già (page lookup, settings, seo, template fields).
 *
 * Avere la query NON cachata evita lo strato di indirezione di
 * `unstable_cache` + `updateTag` che, in dev/Next 16, può presentare
 * inconsistenze sotto certi flussi (read-your-own-writes per Server
 * Action ma non per route handler dell'API CSS, ecc.).
 *
 * Fallback: se la riga non esiste (admin non ha mai salvato), torna 0 →
 * URL `?v=0`. Stabile finché l'admin non personalizza, dopo cambia.
 */
export async function getCmsStylesVersion(): Promise<number> {
  const rows = await db
    .select({ updatedAt: appSettings.updatedAt })
    .from(appSettings)
    .where(eq(appSettings.key, "cms.custom_css"))
    .limit(1);
  return rows[0]?.updatedAt?.getTime() ?? 0;
}
