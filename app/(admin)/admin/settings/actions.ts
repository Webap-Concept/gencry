"use server";

import { getAdminPath } from "@/lib/admin-nav";
import { invalidateBlockedUsernamesCache } from "@/lib/auth/blocked-usernames";
import { invalidateDisposableDomainsCache } from "@/lib/auth/disposable-domains";
import { addUsernameToBloom, invalidateRedisConfigCache } from "@/lib/bloom/bloom-filter";
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
    return { success: "Settings saved.", timestamp: Date.now() };
  } catch {
    return { error: "Save failed.", timestamp: Date.now() };
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
  try {
    const slot = formData.get("slot");
    const file = formData.get("file");

    if (!isBrandingSlot(slot)) {
      return { error: "Invalid asset slot.", timestamp: Date.now() };
    }
    if (!(file instanceof File) || file.size === 0) {
      return { error: "No file selected.", timestamp: Date.now() };
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
    return { success: "Asset uploaded.", timestamp: Date.now() };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    return { error: message, timestamp: Date.now() };
  }
}

export async function removeBrandingAssetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const slot = formData.get("slot");
    if (!isBrandingSlot(slot)) {
      return { error: "Invalid asset slot.", timestamp: Date.now() };
    }
    const key = BRANDING_SLOT_TO_KEY[slot];
    const settings = await getAppSettings();
    const previousUrl = (settings as Record<string, string | null>)[key];

    await updateAppSetting(key, null);
    if (previousUrl) {
      try { await deleteBrandingAsset(previousUrl); } catch {}
    }

    revalidatePath(getAdminPath("settings-general"));
    return { success: "Asset removed.", timestamp: Date.now() };
  } catch {
    return { error: "Remove failed.", timestamp: Date.now() };
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

export async function saveSenderSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await updateAppSetting(
      "resend_api_key",
      formData.get("resend_api_key") as string,
    );
    await updateAppSetting(
      "email_from_name",
      formData.get("email_from_name") as string,
    );
    await updateAppSetting(
      "email_from_address",
      formData.get("email_from_address") as string,
    );
    // Esecuzione esplicita: chiude subito eventuali alert di rotazione
    // per resend_api_key se il valore e' stato aggiornato.
    await runGenerators();
    getAdminPath("settings-resend");
    return { success: "Impostazioni Resend salvate.", timestamp: Date.now() };
  } catch {
    return { error: "Errore durante il salvataggio.", timestamp: Date.now() };
  }
}

export async function testResendConnection(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const apiKey = (
      (formData.get("resend_api_key") as string | null) ?? ""
    ).trim();
    if (!apiKey) {
      return {
        error: "Inserisci una API key Resend prima di testare.",
        timestamp: Date.now(),
      };
    }
    const response = await fetch("https://api.resend.com/domains", {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        error: `Connessione Resend fallita (${response.status}).`,
        timestamp: Date.now(),
      };
    }
    return { success: "Connessione Resend riuscita.", timestamp: Date.now() };
  } catch {
    return { error: "Impossibile contattare Resend.", timestamp: Date.now() };
  }
}

export const saveEmailSettings = saveSenderSettings;

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
  try {
    await updateAppSetting(
      "default_role",
      formData.get("default_role") as string,
    );
    revalidatePath(getAdminPath("settings-signin"));
    return { success: "Impostazioni utenti salvate.", timestamp: Date.now() };
  } catch {
    return { error: "Errore durante il salvataggio.", timestamp: Date.now() };
  }
}

export async function saveRedisSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const url = (
      (formData.get("upstash_redis_rest_url") as string) ?? ""
    ).trim();
    const token = (
      (formData.get("upstash_redis_rest_token") as string) ?? ""
    ).trim();
    await updateAppSetting("upstash_redis_rest_url", url || null);
    await updateAppSetting("upstash_redis_rest_token", token || null);

    // [FIX] Invalida la cache in-memory delle credenziali Redis nel modulo
    // bloom-filter, così la prossima chiamata redisPipeline() rilegge url/token
    // dal DB senza attendere il riavvio del processo Node.
    invalidateRedisConfigCache();

    // Chiude subito alert di rotazione per upstash_redis_rest_token.
    await runGenerators();

    revalidatePath(getAdminPath("settings-redis"));
    return { success: "Credenziali Redis salvate.", timestamp: Date.now() };
  } catch {
    return { error: "Errore durante il salvataggio.", timestamp: Date.now() };
  }
}

export async function testRedisConnection(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const url = (
      (formData.get("upstash_redis_rest_url") as string | null) ?? ""
    ).trim();
    const token = (
      (formData.get("upstash_redis_rest_token") as string | null) ?? ""
    ).trim();
    if (!url || !token) {
      return {
        error: "Inserisci URL e token Redis prima di testare.",
        timestamp: Date.now(),
      };
    }
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["PING"]),
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        error: `Connessione Redis fallita (${response.status}).`,
        timestamp: Date.now(),
      };
    }
    return { success: "Connessione Redis riuscita.", timestamp: Date.now() };
  } catch {
    return {
      error: "Impossibile contattare Redis / Upstash.",
      timestamp: Date.now(),
    };
  }
}

// ---------------------------------------------------------------------------
// Google OAuth
// ---------------------------------------------------------------------------

export async function saveGoogleOAuthSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const clientId     = ((formData.get("google_client_id")     as string) ?? "").trim();
    const clientSecret = ((formData.get("google_client_secret") as string) ?? "").trim();
    const redirectUri  = ((formData.get("google_redirect_uri")  as string) ?? "").trim();

    await updateAppSetting("google_client_id",     clientId     || null);
    await updateAppSetting("google_client_secret", clientSecret || null);
    await updateAppSetting("google_redirect_uri",  redirectUri  || null);

    // Chiude subito alert di rotazione per google_client_secret.
    await runGenerators();

    revalidatePath(getAdminPath("settings-google"));
    return { success: "Credenziali Google OAuth salvate.", timestamp: Date.now() };
  } catch {
    return { error: "Errore durante il salvataggio.", timestamp: Date.now() };
  }
}

export async function testGoogleOAuthSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const clientId     = ((formData.get("google_client_id")     as string | null) ?? "").trim();
    const clientSecret = ((formData.get("google_client_secret") as string | null) ?? "").trim();
    const redirectUri  = ((formData.get("google_redirect_uri")  as string | null) ?? "").trim();

    if (!clientId || !clientSecret || !redirectUri) {
      return {
        error: "Compila tutti e tre i campi prima di testare.",
        timestamp: Date.now(),
      };
    }

    // Verifica che il redirect URI sia HTTPS (o localhost per dev)
    const isLocalhost = redirectUri.startsWith("http://localhost") ||
                        redirectUri.startsWith("http://127.0.0.1");
    if (!redirectUri.startsWith("https://") && !isLocalhost) {
      return {
        error: "Redirect URI deve iniziare con https:// (o http://localhost per dev).",
        timestamp: Date.now(),
      };
    }

    // Verifica che il Client ID abbia il formato Google corretto
    if (!clientId.endsWith(".apps.googleusercontent.com")) {
      return {
        error: "Client ID non valido: deve terminare con .apps.googleusercontent.com",
        timestamp: Date.now(),
      };
    }

    // Probe del token endpoint con un authorization_code volutamente
    // invalido. Google distingue tra credenziali errate (invalid_client) e
    // codice non valido ma credenziali OK (invalid_grant): è il pattern
    // standard per validare client_id+secret senza completare un flow reale.
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: "invalid-probe-code",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
      cache: "no-store",
    });

    const data = (await res.json().catch(() => null)) as
      | { error?: string; error_description?: string }
      | null;

    if (!data) {
      return {
        error: `Risposta non leggibile da Google (HTTP ${res.status}).`,
        timestamp: Date.now(),
      };
    }

    switch (data.error) {
      case "invalid_grant":
        // Credenziali accettate, è stato il code fittizio a essere rigettato.
        return {
          success: "Credenziali Google valide.",
          timestamp: Date.now(),
        };
      case "invalid_client":
        return {
          error: "Client ID o Client Secret non validi.",
          timestamp: Date.now(),
        };
      case "redirect_uri_mismatch":
        return {
          error:
            "Redirect URI non registrato in Google Cloud Console per questo Client ID.",
          timestamp: Date.now(),
        };
      case "unauthorized_client":
        return {
          error: "Client non autorizzato al grant authorization_code.",
          timestamp: Date.now(),
        };
      case undefined:
        // Nessun errore: improbabile con un code fittizio, ma trattalo come ok.
        return {
          success: "Credenziali Google valide.",
          timestamp: Date.now(),
        };
      default:
        return {
          error: `Errore Google: ${data.error}${
            data.error_description ? ` — ${data.error_description}` : ""
          }`,
          timestamp: Date.now(),
        };
    }
  } catch {
    return {
      error: "Errore durante la verifica. Controlla la connessione.",
      timestamp: Date.now(),
    };
  }
}

// ---------------------------------------------------------------------------
// GitHub CI (vitest report dal branch ci-results)
// ---------------------------------------------------------------------------

export async function saveGitHubCISettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const repo   = ((formData.get("github_repo")      as string) ?? "").trim();
    const pat    = ((formData.get("github_pat")       as string) ?? "").trim();
    const branch = ((formData.get("github_ci_branch") as string) ?? "").trim();

    // Validazione formato "owner/repo" se presente
    if (repo && !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(repo)) {
      return {
        error: 'Formato repo non valido. Usa "owner/repo" (es. webappconcept/librolo).',
        timestamp: Date.now(),
      };
    }

    await updateAppSetting("github_repo",      repo   || null);
    await updateAppSetting("github_pat",       pat    || null);
    await updateAppSetting("github_ci_branch", branch || null);

    revalidatePath(getAdminPath("settings-github"));
    revalidatePath("/admin/tests");
    return { success: "Configurazione GitHub CI salvata.", timestamp: Date.now() };
  } catch {
    return { error: "Errore durante il salvataggio.", timestamp: Date.now() };
  }
}

export async function testGitHubCISettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const repo   = ((formData.get("github_repo")      as string | null) ?? "").trim();
    const pat    = ((formData.get("github_pat")       as string | null) ?? "").trim();
    const branch = (((formData.get("github_ci_branch") as string | null) ?? "").trim() || "ci-results");

    if (!repo || !pat) {
      return { error: "Compila almeno repo e token prima di testare.", timestamp: Date.now() };
    }

    // Verifica accesso al file vitest-results.json sul branch
    const url = `https://api.github.com/repos/${repo}/contents/vitest-results.json?ref=${branch}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    });

    if (res.status === 401) {
      return { error: "Token non valido o scaduto.", timestamp: Date.now() };
    }
    if (res.status === 403) {
      return { error: "Token senza permessi sufficienti (serve Contents:Read).", timestamp: Date.now() };
    }
    if (res.status === 404) {
      return {
        error: `Branch "${branch}" o file vitest-results.json non trovato. Il primo run del CI lo creerà.`,
        timestamp: Date.now(),
      };
    }
    if (!res.ok) {
      return { error: `GitHub API ha risposto ${res.status}.`, timestamp: Date.now() };
    }

    return {
      success: `Connessione OK · branch "${branch}" raggiungibile.`,
      timestamp: Date.now(),
    };
  } catch {
    return { error: "Errore durante la verifica. Controlla la connessione.", timestamp: Date.now() };
  }
}

// ---------------------------------------------------------------------------
// Cloudflare Turnstile
// ---------------------------------------------------------------------------

export async function saveCloudflareSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const siteKey   = ((formData.get("cf_turnstile_site_key")   as string) ?? "").trim();
    const secretKey = ((formData.get("cf_turnstile_secret_key") as string) ?? "").trim();

    await updateAppSetting("cf_turnstile_site_key",   siteKey   || null);
    await updateAppSetting("cf_turnstile_secret_key", secretKey || null);

    revalidatePath(getAdminPath("settings-cloudflare"));
    return { success: "Cloudflare Turnstile credentials saved.", timestamp: Date.now() };
  } catch {
    return { error: "Save failed.", timestamp: Date.now() };
  }
}

export async function testCloudflareSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const secretKey = ((formData.get("cf_turnstile_secret_key") as string) ?? "").trim();

    if (!secretKey) {
      return { error: "Enter the Secret Key before testing.", timestamp: Date.now() };
    }

    // Verifica la secret key con un token volutamente invalido.
    // Cloudflare risponde con success:false e error-codes contenenti
    // "invalid-input-secret" se la chiave non è valida,
    // oppure "invalid-input-response" se la chiave è corretta ma il token è sbagliato.
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: secretKey, response: "probe-token-invalid" }),
      cache: "no-store",
    });

    const data = (await res.json().catch(() => null)) as
      | { success: boolean; "error-codes"?: string[] }
      | null;

    if (!data) {
      return { error: `Unreadable response from Cloudflare (HTTP ${res.status}).`, timestamp: Date.now() };
    }

    const errorCodes = data["error-codes"] ?? [];

    if (errorCodes.includes("invalid-input-secret")) {
      return { error: "Secret Key is not valid.", timestamp: Date.now() };
    }

    // "invalid-input-response" means the key is recognised but the probe token was rejected.
    if (errorCodes.includes("invalid-input-response") || errorCodes.includes("timeout-or-duplicate")) {
      return { success: "Secret Key is valid.", timestamp: Date.now() };
    }

    return { success: "Secret Key is valid.", timestamp: Date.now() };
  } catch {
    return { error: "Verification failed. Check your connection.", timestamp: Date.now() };
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
export const saveEmailSettingsAction = saveSenderSettings;
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
