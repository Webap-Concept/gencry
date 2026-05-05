"use server";

import { getAdminPath } from "@/lib/admin-nav";
import { invalidateBlockedUsernamesCache } from "@/lib/auth/blocked-usernames";
import { invalidateDisposableDomainsCache } from "@/lib/auth/disposable-domains";
import { addUsernameToBloom } from "@/lib/bloom/bloom-filter";
import { getUser } from "@/lib/db/queries";
import { db } from "@/lib/db/drizzle";
import type { SiteSnippet } from "@/lib/db/schema";
import { blockedUsernames, disposableDomains, siteSnippets } from "@/lib/db/schema";
import { getAppSettings, updateAppSetting } from "@/lib/db/settings-queries";
import { runGenerators } from "@/lib/notifications/dispatcher";
import {
  deleteBrandingAsset,
  uploadBrandingAsset,
  type BrandingSlot,
} from "@/lib/storage/branding";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

// Regex permissiva per il core di un blocked username/pattern.
// NB: qui *non* applichiamo le regole strict del form sign-up sui punti
// (no leading/trailing/consecutive) perché un pattern come "marco.*" ha
// core "marco." con trailing dot, e va consentito per poter bloccare i
// nick che iniziano con "marco.".
const USERNAME_CORE_REGEX = /^[a-zA-Z0-9_.]+$/;
const USERNAME_MIN = 3;
const USERNAME_MAX = 50;

/**
 * Valida il core di un username (senza eventuali asterischi wildcard).
 * Restituisce { error } se non valido, oppure { isPattern } se valido.
 */
function validateBlockedEntry(raw: string): { error: string } | { isPattern: boolean } {
  const startsWithAsterisk = raw.startsWith("*");
  const endsWithAsterisk = raw.endsWith("*");
  const isPattern = startsWithAsterisk || endsWithAsterisk;
  const core = raw.replace(/^\*/, "").replace(/\*$/, "");

  if (!core) return { error: "Pattern non valido: il core non può essere vuoto." };
  if (core.length < USERNAME_MIN)
    return { error: `Core troppo corto (min ${USERNAME_MIN} caratteri).` };
  if (core.length > USERNAME_MAX)
    return { error: `Core troppo lungo (max ${USERNAME_MAX} caratteri).` };
  if (!USERNAME_CORE_REGEX.test(core))
    return { error: "Solo lettere, numeri, punto (.) e underscore (_) nel core." };

  return { isPattern };
}

export type ActionState =
  | {}
  | { success: string; timestamp: number }
  | { error: string; timestamp: number };

export async function saveAppSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("admin.settings.actionMessages");
  try {
    const domain = ((formData.get("app_domain") as string) ?? "")
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/$/, "");
    await updateAppSetting("app_name", formData.get("app_name") as string);
    await updateAppSetting(
      "app_description",
      formData.get("app_description") as string,
    );
    await updateAppSetting("app_domain", domain ? `https://${domain}` : "");
    revalidatePath(getAdminPath("settings-general"));
    return { success: t("saved"), timestamp: Date.now() };
  } catch {
    return { error: t("saveFailed"), timestamp: Date.now() };
  }
}

const BRANDING_SLOT_TO_KEY = {
  logo: "app_logo_url",
  "logo-variant": "app_logo_variant_url",
  favicon: "app_favicon_url",
} as const;

function isBrandingSlot(value: unknown): value is BrandingSlot {
  return value === "logo" || value === "logo-variant" || value === "favicon";
}

export async function uploadBrandingAssetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("admin.settings.actionMessages");
  try {
    const slot = formData.get("slot");
    const file = formData.get("file");

    if (!isBrandingSlot(slot)) {
      return { error: t("invalidSlot"), timestamp: Date.now() };
    }
    if (!(file instanceof File) || file.size === 0) {
      return { error: t("noFileSelected"), timestamp: Date.now() };
    }

    const key = BRANDING_SLOT_TO_KEY[slot];
    const settings = await getAppSettings();
    const previousUrl = (settings as Record<string, string | null>)[key];

    const publicUrl = await uploadBrandingAsset(slot, file);
    await updateAppSetting(key, publicUrl);

    // Best-effort cleanup of the previous file (don't fail the action if delete errors)
    if (previousUrl && previousUrl !== publicUrl) {
      try { await deleteBrandingAsset(previousUrl); } catch {}
    }

    revalidatePath(getAdminPath("settings-general"));
    return { success: t("assetUploaded"), timestamp: Date.now() };
  } catch (err) {
    // Bubble up infrastructure error message verbatim — di solito è una
    // descrizione tecnica utile al debug e non vale la pena tradurla qui.
    const message =
      err instanceof Error ? err.message : t("saveFailed");
    return { error: message, timestamp: Date.now() };
  }
}

export async function removeBrandingAssetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("admin.settings.actionMessages");
  try {
    const slot = formData.get("slot");
    if (!isBrandingSlot(slot)) {
      return { error: t("invalidSlot"), timestamp: Date.now() };
    }
    const key = BRANDING_SLOT_TO_KEY[slot];
    const settings = await getAppSettings();
    const previousUrl = (settings as Record<string, string | null>)[key];

    await updateAppSetting(key, null);
    if (previousUrl) {
      try { await deleteBrandingAsset(previousUrl); } catch {}
    }

    revalidatePath(getAdminPath("settings-general"));
    return { success: t("assetRemoved"), timestamp: Date.now() };
  } catch {
    return { error: t("removeFailed"), timestamp: Date.now() };
  }
}

export async function saveModeSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await updateAppSetting(
      "registrations_enabled",
      formData.get("registrations_enabled") as string,
    );
    await updateAppSetting(
      "maintenance_mode",
      formData.get("maintenance_mode") as string,
    );
    revalidatePath(getAdminPath("settings-mode"));
    return {
      success: "Impostazioni comportamento salvate.",
      timestamp: Date.now(),
    };
  } catch {
    return { error: "Errore durante il salvataggio.", timestamp: Date.now() };
  }
}

export async function saveEmailTemplateSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const keys = [
      "email_welcome_subject",
      "email_welcome_bcc",
      "email_welcome_body",
      "email_welcome_footer",
      "email_signup_subject",
      "email_signup_bcc",
      "email_signup_body",
      "email_signup_footer",
      "email_reset_subject",
      "email_reset_bcc",
      "email_reset_body",
      "email_reset_footer",
      "email_deleted_subject",
      "email_deleted_bcc",
      "email_deleted_body",
      "email_deleted_footer",
      "email_waitinglist_subject",
      "email_waitinglist_bcc",
      "email_waitinglist_body",
      "email_waitinglist_footer",
      "email_emailchange_subject",
      "email_emailchange_bcc",
      "email_emailchange_body",
      "email_emailchange_footer",
      "email_device_subject",
      "email_device_bcc",
      "email_device_body",
      "email_device_footer",
      "email_staffinvite_subject",
      "email_staffinvite_bcc",
      "email_staffinvite_body",
      "email_staffinvite_footer",
      "email_gdprexport_subject",
      "email_gdprexport_bcc",
      "email_gdprexport_body",
      "email_gdprexport_footer",
      "email_accountdeletion_subject",
      "email_accountdeletion_bcc",
      "email_accountdeletion_body",
      "email_accountdeletion_footer",
      "email_accountdeletionotp_subject",
      "email_accountdeletionotp_bcc",
      "email_accountdeletionotp_body",
      "email_accountdeletionotp_footer",
      "email_mfaenabled_subject",
      "email_mfaenabled_bcc",
      "email_mfaenabled_body",
      "email_mfaenabled_footer",
      "email_mfadisabled_subject",
      "email_mfadisabled_bcc",
      "email_mfadisabled_body",
      "email_mfadisabled_footer",
      "email_mfaadminreset_subject",
      "email_mfaadminreset_bcc",
      "email_mfaadminreset_body",
      "email_mfaadminreset_footer",
    ] as const;
    for (const key of keys) {
      const val = (formData.get(key) as string | null) ?? "";
      await updateAppSetting(key, val.trim() || null);
    }

    // Logo choice è separata: ha valori vincolati (logo|logo-variant|none)
    // e non può essere svuotata (default sempre "logo").
    const logoChoiceRaw = (formData.get("email_logo_choice") as string | null) ?? "logo";
    const logoChoice =
      logoChoiceRaw === "logo-variant" || logoChoiceRaw === "none"
        ? logoChoiceRaw
        : "logo";
    await updateAppSetting("email_logo_choice", logoChoice);

    revalidatePath(getAdminPath("settings-email"));
    return { success: "Email templates saved.", timestamp: Date.now() };
  } catch {
    return { error: "Save failed.", timestamp: Date.now() };
  }
}

export async function saveUsersSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("admin.settings.actionMessages");
  try {
    await updateAppSetting(
      "default_role",
      formData.get("default_role") as string,
    );
    revalidatePath(getAdminPath("settings-signin"));
    return { success: t("usersSaved"), timestamp: Date.now() };
  } catch {
    return { error: t("usersSaveFailed"), timestamp: Date.now() };
  }
}

// ---------------------------------------------------------------------------
// Blocked Domains
// ---------------------------------------------------------------------------

export async function addDisposableDomainAction(
  domain: string,
): Promise<ActionState> {
  try {
    const clean = domain.trim().toLowerCase();
    if (!clean) return { error: "Dominio non valido.", timestamp: Date.now() };
    await db
      .insert(disposableDomains)
      .values({ domain: clean })
      .onConflictDoNothing();
    invalidateDisposableDomainsCache();
    revalidatePath(getAdminPath("security-blocked-domains"));
    return { success: `"${clean}" aggiunto.`, timestamp: Date.now() };
  } catch {
    return { error: "Errore durante l'aggiunta.", timestamp: Date.now() };
  }
}

export async function removeDisposableDomainAction(
  domain: string,
): Promise<ActionState> {
  try {
    await db
      .delete(disposableDomains)
      .where(eq(disposableDomains.domain, domain.trim().toLowerCase()));
    invalidateDisposableDomainsCache();
    revalidatePath(getAdminPath("security-blocked-domains"));
    return { success: `"${domain}" rimosso.`, timestamp: Date.now() };
  } catch {
    return { error: "Errore durante la rimozione.", timestamp: Date.now() };
  }
}

export async function bulkImportDisposableDomainsAction(
  domains: string[],
): Promise<ActionState> {
  try {
    if (domains.length === 0)
      return { error: "Nessun dominio da importare.", timestamp: Date.now() };
    const values = domains
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean)
      .map((domain) => ({ domain }));
    await db.insert(disposableDomains).values(values).onConflictDoNothing();
    invalidateDisposableDomainsCache();
    revalidatePath(getAdminPath("security-blocked-domains"));
    return {
      success: `${values.length} domini importati con successo.`,
      timestamp: Date.now(),
    };
  } catch {
    return {
      error: "Errore durante l'importazione bulk.",
      timestamp: Date.now(),
    };
  }
}

// ---------------------------------------------------------------------------
// Blocked Usernames
// ---------------------------------------------------------------------------

export async function addBlockedUsernameAction(
  username: string,
): Promise<ActionState> {
  try {
    const clean = username.trim().toLowerCase();
    if (!clean)
      return { error: "Username non valido.", timestamp: Date.now() };

    const validation = validateBlockedEntry(clean);
    if ("error" in validation) return { error: validation.error, timestamp: Date.now() };
    const { isPattern } = validation;

    const admin = await getUser();
    const createdBy = admin?.id ?? null;

    await db
      .insert(blockedUsernames)
      .values({ username: clean, isPattern, createdBy })
      .onConflictDoNothing();

    if (!isPattern) {
      try {
        await addUsernameToBloom(clean);
      } catch {
        // Non critico
      }
    }

    invalidateBlockedUsernamesCache();
    revalidatePath(getAdminPath("security-blocked-usernames"));
    return { success: `"${clean}" aggiunto.`, timestamp: Date.now() };
  } catch {
    return { error: "Errore durante l'aggiunta.", timestamp: Date.now() };
  }
}

export async function removeBlockedUsernameAction(
  username: string,
): Promise<ActionState> {
  try {
    await db
      .delete(blockedUsernames)
      .where(
        eq(blockedUsernames.username, username.trim().toLowerCase()),
      );
    invalidateBlockedUsernamesCache();
    revalidatePath(getAdminPath("security-blocked-usernames"));
    return { success: `"${username}" rimosso.`, timestamp: Date.now() };
  } catch {
    return { error: "Errore durante la rimozione.", timestamp: Date.now() };
  }
}

export async function bulkImportBlockedUsernamesAction(
  usernames: string[],
): Promise<ActionState> {
  try {
    if (usernames.length === 0)
      return { error: "Nessun username da importare.", timestamp: Date.now() };

    const admin = await getUser();
    const createdBy = admin?.id ?? null;

    type ValidEntry = { username: string; isPattern: boolean; createdBy: string | null };
    const valid: ValidEntry[] = [];
    const invalid: string[] = [];

    for (const u of usernames) {
      const clean = u.trim().toLowerCase();
      if (!clean) continue;
      const result = validateBlockedEntry(clean);
      if ("error" in result) {
        invalid.push(clean);
      } else {
        valid.push({ username: clean, isPattern: result.isPattern, createdBy });
      }
    }

    if (valid.length === 0)
      return {
        error: `Nessun username valido da importare.${
          invalid.length > 0 ? ` ${invalid.length} non validi ignorati.` : ""
        }`,
        timestamp: Date.now(),
      };

    await db.insert(blockedUsernames).values(valid).onConflictDoNothing();

    const exactEntries = valid.filter((e) => !e.isPattern).map((e) => e.username);
    if (exactEntries.length > 0) {
      try {
        await Promise.all(exactEntries.map((u) => addUsernameToBloom(u)));
      } catch {
        // Non critico
      }
    }

    invalidateBlockedUsernamesCache();
    revalidatePath(getAdminPath("security-blocked-usernames"));

    const msg =
      invalid.length > 0
        ? `${valid.length} username importati. ${invalid.length} ignorati (formato non valido).`
        : `${valid.length} username importati con successo.`;

    return { success: msg, timestamp: Date.now() };
  } catch {
    return {
      error: "Errore durante l'importazione bulk.",
      timestamp: Date.now(),
    };
  }
}

export const saveGeneralSettingsAction = saveAppSettings;
export const saveModeSettingsAction = saveModeSettings;
export const saveUsersSettingsAction = saveUsersSettings;

function invalidateSnippets() {
  revalidatePath("/", "layout");
}

export async function createSnippetAction(
  data: Omit<SiteSnippet, "id" | "createdAt" | "updatedAt">,
) {
  await db.insert(siteSnippets).values({
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  invalidateSnippets();
}

export async function updateSnippetAction(
  id: number,
  data: Omit<SiteSnippet, "id" | "createdAt" | "updatedAt">,
) {
  await db
    .update(siteSnippets)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(siteSnippets.id, id));
  invalidateSnippets();
}

export async function deleteSnippetAction(id: number) {
  await db.delete(siteSnippets).where(eq(siteSnippets.id, id));
  invalidateSnippets();
}

export async function toggleSnippetAction(id: number, isActive: boolean) {
  await db
    .update(siteSnippets)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(siteSnippets.id, id));
  invalidateSnippets();
}
