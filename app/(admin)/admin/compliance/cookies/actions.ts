"use server";

import { getAdminPath } from "@/lib/admin-nav";
import { updateAppSetting } from "@/lib/db/settings-queries";
import { requireAdmin } from "@/lib/rbac/guards";
import { can } from "@/lib/rbac/can";
import { revalidatePath } from "next/cache";

export type ActionState =
  | Record<string, never>
  | { success: string; timestamp: number }
  | { error: string; timestamp: number };

function readBool(raw: FormDataEntryValue | null): "true" | "false" {
  return raw === "true" || raw === "on" ? "true" : "false";
}

export async function saveCookieSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireAdmin();
    if (!user.isAdmin && !(await can(user, "admin:gdpr"))) {
      return { error: "Not authorized.", timestamp: Date.now() };
    }

    await updateAppSetting(
      "gdpr.cookie_banner.enabled",
      readBool(formData.get("gdpr.cookie_banner.enabled")),
    );

    // Invalida sia la sezione cookies sia il root layout: il banner
    // pubblico viene mostrato/no in base a questo flag, e la decisione
    // è presa nel RootLayout — un revalidate locale non basterebbe.
    revalidatePath(getAdminPath("compliance-cookies"));
    revalidatePath("/", "layout");

    return { success: "Cookie settings saved.", timestamp: Date.now() };
  } catch {
    return { error: "Save failed.", timestamp: Date.now() };
  }
}
