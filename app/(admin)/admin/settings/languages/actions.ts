"use server";

import {
  getAllLocales,
  setLocaleEnabled,
  setLocaleNativeLabel,
  setLocaleSortOrder,
} from "@/lib/db/locales-queries";
import { getUser } from "@/lib/db/queries";
import { can } from "@/lib/rbac/can";
import { revalidatePath } from "next/cache";

/**
 * Guard per le Server Actions sotto /admin/settings/languages.
 * Il layout admin protegge la pagina ma le Server Actions sono callable
 * indipendentemente, quindi serve un controllo esplicito.
 */
async function requireLanguagesPermission(): Promise<{ ok: true } | ActionState> {
  const user = await getUser();
  if (!user) {
    return { error: "Not authenticated.", timestamp: Date.now() };
  }
  if (user.isAdmin) return { ok: true };
  const allowed = await can(user, "admin:languages");
  if (!allowed) {
    return { error: "Permission denied.", timestamp: Date.now() };
  }
  return { ok: true };
}

export type ActionState =
  | Record<string, never>
  | { success: string; timestamp: number }
  | { error: string; timestamp: number };

const ADMIN_PATH = "/admin/settings/languages";

/**
 * Toggle del flag `enabled` per un locale. Vincoli applicati lato server:
 *   - il locale di default non può essere disabilitato (resta sempre attivo)
 *   - almeno un locale deve restare abilitato (safety: una lingua serve)
 */
export async function toggleLocaleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const guard = await requireLanguagesPermission();
  if ("error" in guard) return guard;

  const code = String(formData.get("code") ?? "").trim();
  const nextRaw = String(formData.get("enabled") ?? "");
  const next = nextRaw === "true";

  if (!code) {
    return { error: "Missing locale code.", timestamp: Date.now() };
  }

  try {
    const all = await getAllLocales();
    const target = all.find((l) => l.code === code);
    if (!target) {
      return { error: `Locale "${code}" not found.`, timestamp: Date.now() };
    }

    if (target.isDefault && !next) {
      return {
        error: "The default locale cannot be disabled.",
        timestamp: Date.now(),
      };
    }

    if (!next) {
      const enabledOthers = all.filter(
        (l) => l.enabled && l.code !== code,
      );
      if (enabledOthers.length === 0) {
        return {
          error: "At least one locale must remain enabled.",
          timestamp: Date.now(),
        };
      }
    }

    await setLocaleEnabled(code, next);
    revalidatePath(ADMIN_PATH);
    return {
      success: `Locale "${code}" ${next ? "enabled" : "disabled"}.`,
      timestamp: Date.now(),
    };
  } catch {
    return { error: "Update failed.", timestamp: Date.now() };
  }
}

/**
 * Aggiornamento batch di sort_order e native_label da un singolo form.
 * Il form contiene un input per locale: `sort_<code>` (number) e
 * `label_<code>` (string). Salviamo solo i valori effettivamente cambiati.
 */
export async function saveLocaleMetadataAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const guard = await requireLanguagesPermission();
  if ("error" in guard) return guard;

  try {
    const all = await getAllLocales();

    for (const locale of all) {
      const sortRaw = formData.get(`sort_${locale.code}`);
      const labelRaw = formData.get(`label_${locale.code}`);

      if (typeof sortRaw === "string" && sortRaw.length > 0) {
        const parsed = Number.parseInt(sortRaw, 10);
        if (Number.isFinite(parsed) && parsed !== locale.sortOrder) {
          await setLocaleSortOrder(locale.code, parsed);
        }
      }

      if (typeof labelRaw === "string") {
        const trimmed = labelRaw.trim();
        if (trimmed.length > 0 && trimmed !== locale.nativeLabel) {
          await setLocaleNativeLabel(locale.code, trimmed);
        }
      }
    }

    revalidatePath(ADMIN_PATH);
    return { success: "Locale metadata saved.", timestamp: Date.now() };
  } catch {
    return { error: "Save failed.", timestamp: Date.now() };
  }
}
