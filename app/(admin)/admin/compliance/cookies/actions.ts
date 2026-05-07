"use server";

import { getAdminPath } from "@/lib/admin-nav";
import { db } from "@/lib/db/drizzle";
import {
  cookieServiceIdExists,
  deleteCookieService,
  deleteCookieServiceTranslations,
  insertCookieService,
  setCookieServiceEnabled,
  updateCookieService,
  upsertCookieServiceTranslation,
} from "@/lib/db/cookie-services-queries";
import { cookieCategories, cookieServices } from "@/lib/db/schema";
import { updateAppSetting } from "@/lib/db/settings-queries";
import { LOCALES } from "@/lib/i18n/config";
import { requireAdmin } from "@/lib/rbac/guards";
import { can } from "@/lib/rbac/can";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export type ActionState =
  | Record<string, never>
  | { success: string; timestamp: number }
  | { error: string; timestamp: number };

function readBool(raw: FormDataEntryValue | null): "true" | "false" {
  return raw === "true" || raw === "on" ? "true" : "false";
}

/**
 * Guard centralizzato per le action di questo file: tutte richiedono
 * `admin:gdpr`. Lancia (redirect) se non autenticato.
 */
async function requireGdprAdmin(): Promise<{ ok: true } | { error: string }> {
  const user = await requireAdmin();
  if (!user.isAdmin && !(await can(user, "admin:gdpr"))) {
    return { error: "not_authorized" };
  }
  return { ok: true };
}

function revalidateCookiesAdmin() {
  revalidatePath(getAdminPath("compliance-cookies"));
  // Il banner pubblico riceve la lista servizi via prop dal RootLayout.
  // La cache module-level (`getCookieRegistry`) è già stata invalidata
  // dalle CRUD helper qui sopra, ma il render del RootLayout non rilegge
  // finché non invalidiamo il path. Qui invalidiamo solo la home pubblica
  // — basta a triggerare il refetch al prossimo navigate da quella route.
  // NB: invalidare "/", "layout" sarebbe troppo aggressivo (rebuild di
  // tutto l'admin in dev mode → percepito come freeze del browser).
  revalidatePath("/");
}

export async function saveCookieSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("admin.compliance.cookies.masterSwitch");
  try {
    const user = await requireAdmin();
    if (!user.isAdmin && !(await can(user, "admin:gdpr"))) {
      return { error: t("errorNotAuthorized"), timestamp: Date.now() };
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

    return { success: t("feedbackSaved"), timestamp: Date.now() };
  } catch {
    return { error: t("feedbackError"), timestamp: Date.now() };
  }
}

// ─── Services CRUD ────────────────────────────────────────────────────────
//
// Tutte le mutate sui servizi richiedono `admin:gdpr`. Il pattern di
// validazione è zod-based; in caso di errore zod ritorniamo il primo
// issue.message tradotto (da `admin.compliance.cookies.servicesErrors`).

const SERVICE_ID_REGEX = /^[a-z0-9_]{2,100}$/;
const HTTP_URL_REGEX = /^https?:\/\//i;

const serviceFormSchema = z.object({
  /** Edit: passato; Add: undefined → si usa `idNew`. */
  id: z.string().optional(),
  /** Add: ID nuovo da creare. Lowercase + underscore + cifre. */
  idNew: z
    .string()
    .trim()
    .optional()
    .superRefine((value, ctx) => {
      if (!value) return;
      if (!SERVICE_ID_REGEX.test(value)) {
        ctx.addIssue({ code: "custom", message: "errorIdInvalid" });
      }
    }),
  categoryId: z.string().min(1, "errorCategoryRequired"),
  enabled: z.string().optional(), // "true" | "false"
  firstParty: z.string().optional(),
  requiresSnippet: z.string().optional(),
  provider: z.string().trim().max(200).optional().default(""),
  providerPolicyUrl: z
    .string()
    .trim()
    .max(2048)
    .optional()
    .default("")
    .superRefine((value, ctx) => {
      if (value && !HTTP_URL_REGEX.test(value)) {
        ctx.addIssue({ code: "custom", message: "errorPolicyUrlInvalid" });
      }
    }),
  sortOrder: z.string().optional(),
});

const SERVICE_ERROR_KEYS = new Set([
  "errorIdRequired",
  "errorIdInvalid",
  "errorIdTaken",
  "errorCategoryRequired",
  "errorPolicyUrlInvalid",
  "errorTranslationMissing",
  "errorSystemDelete",
  "errorNotAuthorized",
]);

function isKnownServiceError(s: string): boolean {
  return SERVICE_ERROR_KEYS.has(s);
}

/** Toggle on/off di un singolo servizio (anche system: il toggle è ammesso). */
export async function toggleCookieServiceEnabledAction(
  id: string,
  enabled: boolean,
): Promise<ActionState> {
  const t = await getTranslations("admin.compliance.cookies.servicesErrors");
  const guard = await requireGdprAdmin();
  if ("error" in guard) {
    return { error: t("errorNotAuthorized"), timestamp: Date.now() };
  }
  try {
    await setCookieServiceEnabled(id, enabled);
    revalidateCookiesAdmin();
    return { success: t("toggleSaved"), timestamp: Date.now() };
  } catch (err) {
    console.error("[toggleCookieServiceEnabledAction]", err);
    return { error: t("errorSaveFailed"), timestamp: Date.now() };
  }
}

/**
 * Add o edit di un servizio + traduzioni in batch. Il form invia hidden
 * inputs `tr_<locale>_name` e `tr_<locale>_description` per ogni locale
 * abilitato (pattern coerente con page-editor / SEO form).
 */
export async function saveCookieServiceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("admin.compliance.cookies.servicesErrors");
  const guard = await requireGdprAdmin();
  if ("error" in guard) {
    return { error: t("errorNotAuthorized"), timestamp: Date.now() };
  }

  const raw = {
    id: formData.get("id")?.toString() || undefined,
    idNew: formData.get("idNew")?.toString() || undefined,
    categoryId: formData.get("categoryId")?.toString() || "",
    enabled: readBool(formData.get("enabled")),
    firstParty: readBool(formData.get("firstParty")),
    requiresSnippet: readBool(formData.get("requiresSnippet")),
    provider: formData.get("provider")?.toString() || "",
    providerPolicyUrl: formData.get("providerPolicyUrl")?.toString() || "",
    sortOrder: formData.get("sortOrder")?.toString() || "0",
  };

  const parsed = serviceFormSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "errorInvalidData";
    return {
      error: isKnownServiceError(msg) ? t(msg as Parameters<typeof t>[0]) : t("errorSaveFailed"),
      timestamp: Date.now(),
    };
  }

  const isCreate = !parsed.data.id;
  const targetId = isCreate ? parsed.data.idNew?.trim() : parsed.data.id;
  if (!targetId) {
    return { error: t("errorIdRequired"), timestamp: Date.now() };
  }

  // Verifica esistenza categoria.
  const [cat] = await db
    .select({ id: cookieCategories.id })
    .from(cookieCategories)
    .where(eq(cookieCategories.id, parsed.data.categoryId))
    .limit(1);
  if (!cat) {
    return { error: t("errorCategoryRequired"), timestamp: Date.now() };
  }

  try {
    const provider = parsed.data.provider?.trim() || null;
    const providerPolicyUrl = parsed.data.providerPolicyUrl?.trim() || null;
    const sortOrder = Number(parsed.data.sortOrder) || 0;
    const enabled = parsed.data.enabled === "true";
    const firstParty = parsed.data.firstParty === "true";
    const requiresSnippet = parsed.data.requiresSnippet === "true";

    if (isCreate) {
      if (await cookieServiceIdExists(targetId)) {
        return { error: t("errorIdTaken"), timestamp: Date.now() };
      }
      await insertCookieService({
        id: targetId,
        categoryId: parsed.data.categoryId,
        enabled,
        firstParty,
        requiresSnippet,
        provider,
        providerPolicyUrl,
        sortOrder,
      });
    } else {
      await updateCookieService(targetId, {
        categoryId: parsed.data.categoryId,
        enabled,
        firstParty,
        requiresSnippet,
        provider,
        providerPolicyUrl,
        sortOrder,
      });
    }

    // Salva traduzioni: per ogni locale supportato cerca tr_<locale>_name
    // e tr_<locale>_description. Una traduzione richiede entrambi i campi
    // popolati per essere persistita (stringhe vuote → no-op, non
    // sovrascrive una traduzione esistente).
    for (const locale of LOCALES) {
      const name = formData.get(`tr_${locale}_name`)?.toString().trim() ?? "";
      const description = formData.get(`tr_${locale}_description`)?.toString().trim() ?? "";
      if (name && description) {
        await upsertCookieServiceTranslation({
          serviceId: targetId,
          locale,
          name,
          description,
        });
      }
    }

    revalidateCookiesAdmin();
    return { success: t("saveOk"), timestamp: Date.now() };
  } catch (err) {
    console.error("[saveCookieServiceAction]", err);
    return { error: t("errorSaveFailed"), timestamp: Date.now() };
  }
}

/** Delete di un servizio non-system. Le traduzioni cascade-ano via FK. */
export async function deleteCookieServiceAction(id: string): Promise<ActionState> {
  const t = await getTranslations("admin.compliance.cookies.servicesErrors");
  const guard = await requireGdprAdmin();
  if ("error" in guard) {
    return { error: t("errorNotAuthorized"), timestamp: Date.now() };
  }

  // Server-side guard: i system services non possono essere eliminati
  // (toggle sì, delete no — sono parte del core dell'app).
  const [row] = await db
    .select({ isSystem: cookieServices.isSystem })
    .from(cookieServices)
    .where(eq(cookieServices.id, id))
    .limit(1);
  if (!row) {
    return { error: t("errorSaveFailed"), timestamp: Date.now() };
  }
  if (row.isSystem) {
    return { error: t("errorSystemDelete"), timestamp: Date.now() };
  }

  try {
    await deleteCookieServiceTranslations([id]);
    await deleteCookieService(id);
    revalidateCookiesAdmin();
    return { success: t("deleteOk"), timestamp: Date.now() };
  } catch (err) {
    console.error("[deleteCookieServiceAction]", err);
    return { error: t("errorSaveFailed"), timestamp: Date.now() };
  }
}
