"use server";

import { deleteSeoPage } from "@/lib/db/seo-queries";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

/**
 * Le actions per CREATE/UPDATE dei meta SEO sono state consolidate dentro
 * `upsertPageAction` (app/(admin)/admin/content/pages/actions.ts): l'admin
 * ora salva pagina + SEO + traduzioni in un colpo solo dal page-editor.
 *
 * Qui resta solo la delete, usata per scenari di pulizia diretta dal
 * pannello SEO se servirà in futuro.
 */
export async function deleteSeoPageAction(
  pathname: string,
): Promise<{ error?: string; success?: boolean }> {
  const tErrors = await getTranslations("admin.seo.form");
  if (!pathname) return { error: tErrors("errorPathnameMissing") };
  try {
    await deleteSeoPage(pathname);
    revalidatePath("/admin/seo");
    revalidatePath(pathname);
  } catch (err) {
    console.error("[deleteSeoPageAction] error:", err);
    return { error: tErrors("errorDeleteFailed") };
  }
  return { success: true };
}
