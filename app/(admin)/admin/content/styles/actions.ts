"use server";

import { updateAppSetting } from "@/lib/db/settings-queries";
import { requireAdminPage } from "@/lib/rbac/guards";
import { revalidatePath, updateTag } from "next/cache";

const MAX_CSS_BYTES = 200_000; // 200KB — più che sufficiente, evita upload abnormi

export type SaveCmsStylesState =
  | { ok?: never; error?: never; savedAt?: never; reset?: never }
  | {
      ok: true;
      savedAt: number;
      reset: boolean;
      error?: never;
    }
  | { ok?: never; error: "tooLong" | "save"; savedAt?: never; reset?: never };

/**
 * Salva (o azzera) il CSS custom delle pagine CMS.
 *
 * Due modalità invocate dalla stessa action — il client passa
 * `reset=1` nel FormData per ripristinare il default seed:
 *   - Save normale: scrive il valore in app_settings[cms.custom_css].
 *     Quando l'utente non l'ha mai personalizzato, lo crea.
 *   - Reset: scrive `null` → il route handler /api/cms/styles.css
 *     ritorna DEFAULT_CMS_STYLES.
 *
 * Dopo la mutazione, invalida la cache di Next per il route handler:
 * la response avrà nuovo Cache-Control max-age=300 ma il primo hit dopo
 * il save serve già il valore aggiornato.
 */
export async function saveCmsStylesAction(
  _prev: SaveCmsStylesState,
  formData: FormData,
): Promise<SaveCmsStylesState> {
  await requireAdminPage();

  const isReset = formData.get("reset") === "1";
  const raw = isReset ? null : ((formData.get("css") as string | null) ?? "");

  if (raw !== null && raw.length > MAX_CSS_BYTES) {
    return { error: "tooLong" };
  }

  try {
    await updateAppSetting("cms.custom_css", raw);
    // 1. Invalida la cache Next del route handler che serve il CSS.
    revalidatePath("/api/cms/styles.css");
    // 2. Invalida il timestamp cachato (lib/cms/styles-version.ts) usato
    //    come cache buster nel <link href> del CmsPage. Senza questo, il
    //    timestamp resterebbe quello vecchio e il browser continuerebbe
    //    a servire il CSS in cache fino allo scadere del max-age (5min).
    //    In Next 16 dentro una Server Action si usa `updateTag` (single
    //    arg, read-your-own-writes) — non `revalidateTag` che ora ne
    //    richiede 2 ed è pensato per route handlers.
    updateTag("cms-styles");
    return { ok: true, savedAt: Date.now(), reset: isReset };
  } catch (err) {
    console.error("[admin/content/styles] save failed:", err);
    return { error: "save" };
  }
}
