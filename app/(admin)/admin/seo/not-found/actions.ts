"use server";

import { getAdminPath } from "@/lib/admin-nav";
import {
  deleteAllResolvedNotFoundLogs,
  deleteNotFoundLog,
  markNotFoundResolved,
  markNotFoundUnresolved,
} from "@/lib/db/not-found-queries";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

type ActionResult = { error?: string; success?: boolean; cleared?: number };

export async function resolveNotFoundAction(id: number): Promise<ActionResult> {
  const t = await getTranslations("admin.seo.notFound");
  if (!Number.isFinite(id) || id <= 0) return { error: t("errorInvalidId") };
  try {
    await markNotFoundResolved(id);
    revalidatePath(getAdminPath("seo-not-found"));
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
    revalidatePath(getAdminPath("seo-not-found"));
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
    revalidatePath(getAdminPath("seo-not-found"));
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
    revalidatePath(getAdminPath("seo-not-found"));
    return { success: true, cleared };
  } catch (err) {
    console.error("[clearResolvedNotFoundAction]", err);
    return { error: t("errorClearFailed") };
  }
}
