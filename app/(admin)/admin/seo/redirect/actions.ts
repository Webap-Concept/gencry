"use server";

import { getAdminPath } from "@/lib/admin-paths";
import { deleteRedirect, toggleRedirectActive, upsertRedirect } from "@/lib/db/redirects-queries";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const schema = z.object({
  id: z.string().optional(),
  fromPath: z
    .string()
    .min(1, "errorFromRequired")
    .regex(/^\//, { message: "errorFromMustStartSlash" }),
  toPath: z
    .string()
    .min(1, "errorToRequired")
    .regex(/^\//, { message: "errorToMustStartSlash" }),
  statusCode: z.enum(["301", "302", "307", "308"]).default("301"),
  isActive: z.string().optional(),
});

const REDIRECT_ERROR_KEYS = new Set([
  "errorFromRequired",
  "errorFromMustStartSlash",
  "errorToRequired",
  "errorToMustStartSlash",
]);

export async function upsertRedirectAction(
  _: unknown,
  formData: FormData,
): Promise<{ error?: string; success?: boolean; savedAt?: string }> {
  const raw = {
    id: formData.get("id") || undefined,
    fromPath: formData.get("fromPath"),
    toPath: formData.get("toPath"),
    statusCode: formData.get("statusCode") ?? "301",
    isActive: formData.get("isActive") || undefined,
  };

  const tErrors = await getTranslations("admin.seo.redirect");
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "errorInvalidData";
    if (REDIRECT_ERROR_KEYS.has(msg)) {
      return {
        error: tErrors(msg as Parameters<typeof tErrors>[0]),
      };
    }
    return { error: tErrors("errorInvalidData") };
  }

  const { id, statusCode, isActive, ...rest } = parsed.data;

  try {
    await upsertRedirect({
      id: id ? Number(id) : undefined,
      ...rest,
      statusCode: Number(statusCode) as 301 | 302 | 307 | 308,
      isActive: isActive === "true",
    });
    revalidatePath(await getAdminPath("seo-redirects"));
  } catch (err) {
    console.error("[upsertRedirectAction]", err);
    return { error: tErrors("errorSaveFailed") };
  }
  return { success: true, savedAt: new Date().toISOString() };
}

export async function deleteRedirectAction(
  id: number,
): Promise<{ error?: string; success?: boolean }> {
  const tErrors = await getTranslations("admin.seo.redirect");
  try {
    await deleteRedirect(id);
    revalidatePath(await getAdminPath("seo-redirects"));
  } catch (err) {
    console.error("[deleteRedirectAction]", err);
    return { error: tErrors("errorDeleteFailed") };
  }
  return { success: true };
}

export async function toggleAutoRedirectAction(
  id: number,
  isActive: boolean,
): Promise<{ error?: string; success?: boolean }> {
  const tErrors = await getTranslations("admin.seo.redirect");
  try {
    await toggleRedirectActive(id, isActive);
    revalidatePath(await getAdminPath("seo-redirects"));
  } catch (err) {
    console.error("[toggleAutoRedirectAction]", err);
    return { error: tErrors("errorSaveFailed") };
  }
  return { success: true };
}
