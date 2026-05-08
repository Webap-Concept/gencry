"use server";

import { getAdminPath } from "@/lib/admin-paths";
import {
  deleteAllResolvedNotFoundLogs,
  deleteNotFoundLog,
  deleteSystemPathsNotFoundLogs,
  markNotFoundResolved,
  markNotFoundUnresolved,
} from "@/lib/db/not-found-queries";
import { NON_PREFIXABLE_PREFIXES } from "@/lib/i18n/resolve-locale";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

type ActionResult = { error?: string; success?: boolean; cleared?: number };

// Tenuto IN SINCRONO con `BOT_PROBE_PREFIXES` di lib/seo/log-not-found.ts.
// Non importato perché quel file ha "server-only" e questo è già una
// server action — duplicazione minima per evitare cascade di re-export.
const BOT_PROBE_PREFIXES = [
  "/wp-",
  "/wordpress",
  "/wp/",
  "/wp",
  "/old/",
  "/old",
  "/new/",
  "/new",
  "/backup/",
  "/backup",
  "/admin.php",
  "/phpmyadmin",
  "/.git",
] as const;

export async function resolveNotFoundAction(id: number): Promise<ActionResult> {
  const t = await getTranslations("admin.seo.notFound");
  if (!Number.isFinite(id) || id <= 0) return { error: t("errorInvalidId") };
  try {
    await markNotFoundResolved(id);
    revalidatePath(await getAdminPath("seo-not-found"));
  } catch (err) {
    console.error("[resolveNotFoundAction]", err);
    return { error: t("errorResolveFailed") };
  }
  return { success: true };
}

export async function reopenNotFoundAction(id: number): Promise<ActionResult> {
  const t = await getTranslations("admin.seo.notFound");
  if (!Number.isFinite(id) || id <= 0) return { error: t("errorInvalidId") };
  try {
    await markNotFoundUnresolved(id);
    revalidatePath(await getAdminPath("seo-not-found"));
  } catch (err) {
    console.error("[reopenNotFoundAction]", err);
    return { error: t("errorReopenFailed") };
  }
  return { success: true };
}

export async function deleteNotFoundAction(id: number): Promise<ActionResult> {
  const t = await getTranslations("admin.seo.notFound");
  if (!Number.isFinite(id) || id <= 0) return { error: t("errorInvalidId") };
  try {
    await deleteNotFoundLog(id);
    revalidatePath(await getAdminPath("seo-not-found"));
  } catch (err) {
    console.error("[deleteNotFoundAction]", err);
    return { error: t("errorDeleteFailed") };
  }
  return { success: true };
}

export async function clearResolvedNotFoundAction(): Promise<ActionResult> {
  const t = await getTranslations("admin.seo.notFound");
  try {
    const cleared = await deleteAllResolvedNotFoundLogs();
    revalidatePath(await getAdminPath("seo-not-found"));
    return { success: true, cleared };
  } catch (err) {
    console.error("[clearResolvedNotFoundAction]", err);
    return { error: t("errorClearFailed") };
  }
}

/**
 * Cancella tutte le righe che corrispondono a path file-based di sistema
 * (sign-in, settings, onboarding, …) o a probe noti di bot (/wp-, /old,
 * …). Il filter d'ingresso ora le scarta a monte, ma le righe già
 * accumulate prima del fix vanno pulite manualmente — questa action lo
 * fa in batch.
 */
export async function clearSystemPathsNotFoundAction(): Promise<ActionResult> {
  const t = await getTranslations("admin.seo.notFound");
  try {
    const cleared = await deleteSystemPathsNotFoundLogs({
      exactOrUnderPrefixes: NON_PREFIXABLE_PREFIXES,
      startsWithPrefixes: BOT_PROBE_PREFIXES,
    });
    revalidatePath(await getAdminPath("seo-not-found"));
    return { success: true, cleared };
  } catch (err) {
    console.error("[clearSystemPathsNotFoundAction]", err);
    return { error: t("errorClearFailed") };
  }
}
