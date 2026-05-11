"use server";

import { getAdminPath } from "@/lib/admin-paths";
import { updateAppSetting } from "@/lib/db/settings-queries";
import { requireAdminSectionPage } from "@/lib/rbac/guards";
import { revalidatePath } from "next/cache";

export type ActionState =
  | {}
  | { success: string; timestamp: number }
  | { error: string; timestamp: number };

export async function saveOnboardingSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdminSectionPage("modules:onboarding");
  try {
    // Toggle "wizard obbligatorio". Hidden input invia sempre il valore
    // corrente; se per qualche motivo manca, fallback conservativo a "true".
    const raw = (formData.get("modules.onboarding.enabled") as string | null) ?? "true";
    await updateAppSetting(
      "modules.onboarding.enabled",
      raw === "false" ? "false" : "true",
    );
    revalidatePath(await getAdminPath("onboarding-settings"));
    return { success: "Onboarding settings saved.", timestamp: Date.now() };
  } catch {
    return { error: "Save failed.", timestamp: Date.now() };
  }
}
