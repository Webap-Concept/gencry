"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  type ActionState,
  validatedActionWithUser,
} from "@/lib/auth/middleware";
import { endCurrentSession } from "@/lib/auth/session";
import { recordMarketingConsentChange } from "@/lib/account/consent-ledger";
import { setMarketingConsent } from "@/lib/account/consents";
import {
  requestAccountDeletion,
  requestAccountDeletionViaOtp,
  sendAccountDeletionOtp,
} from "@/lib/account/deletion";
import {
  regenerateDownloadUrl,
  requestGdprExport,
} from "@/lib/account/gdpr-export";
import { getUser } from "@/lib/db/queries";
import { resolveRecipientLocale } from "@/lib/email/recipient-locale";

// "1" = on, qualsiasi altra cosa = off (coerente col comportamento dei
// checkbox HTML quando non sono presenti nel FormData).
const toggleMarketingSchema = z.object({
  enabled: z
    .string()
    .optional()
    .transform((v) => v === "1" || v === "true"),
});

export const toggleMarketingConsentAction = validatedActionWithUser(
  toggleMarketingSchema,
  async (data, _formData, user) => {
    const result = await setMarketingConsent({
      userId: user.id,
      enabled: data.enabled,
    });

    if (!result.ok) {
      return { error: result.error } satisfies ActionState;
    }

    // Append-only ledger: registra l'evento (granted/revoked) con
    // metadata di dimostrabilità. Best-effort: errori non rilanciati.
    const headersList = await headers();
    await recordMarketingConsentChange({
      userId: user.id,
      action: data.enabled ? "granted" : "revoked",
      ip:
        headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        headersList.get("x-real-ip") ??
        null,
      userAgent: headersList.get("user-agent") ?? null,
      locale: null,
    });

    revalidatePath("/settings/privacy");
    const tAct = await getTranslations("core.settings.actions");
    return {
      success: data.enabled
        ? tAct("marketingActivated")
        : tAct("marketingDeactivated"),
    } satisfies ActionState;
  },
);

// ---------------------------------------------------------------------------
// Richiesta eliminazione account (soft-delete, grace 30 giorni)
// ---------------------------------------------------------------------------

const requestAccountDeletionSchema = z.object({
  password: z.string().min(1, "Inserisci la password").max(100),
  // Checkbox di conferma. Quando spuntato il browser invia "on"; se non
  // spuntato non invia nulla → zod fallisce e l'utente vede l'errore.
  confirmDelete: z.literal("on", {
    message: "Devi confermare di voler eliminare l'account",
  }),
});

export const requestAccountDeletionAction = validatedActionWithUser(
  requestAccountDeletionSchema,
  async (data, _formData, user) => {
    const fullUser = await getUser();
    const tAct = await getTranslations("core.settings.actions");
    if (!fullUser) {
      return {
        error: tAct("sessionExpired"),
      } satisfies ActionState;
    }

    const locale = await resolveRecipientLocale(fullUser.locale);
    const result = await requestAccountDeletion({
      userId: user.id,
      email: fullUser.email,
      firstName: fullUser.firstName,
      currentPasswordHash: fullUser.passwordHash,
      currentPassword: data.password,
      locale,
    });

    if (!result.ok) {
      return { error: result.error } satisfies ActionState;
    }

    // Revoca la sessione corrente (DB + cache + cookie) e porta l'utente alla
    // pagina di sign-in con un banner informativo. Da questo momento qualunque
    // tentativo di rilogin viene respinto fino al purge (vedi check in signIn
    // / OAuth callback).
    await endCurrentSession();
    redirect("/sign-in?reason=deletion_requested");
  },
);

// ---------------------------------------------------------------------------
// Eliminazione via OTP (utenti OAuth-only senza password locale)
// ---------------------------------------------------------------------------

const sendAccountDeletionOtpSchema = z.object({});

export const sendAccountDeletionOtpAction = validatedActionWithUser(
  sendAccountDeletionOtpSchema,
  async (_data, _formData, user) => {
    const fullUser = await getUser();
    const tAct = await getTranslations("core.settings.actions");
    if (!fullUser) {
      return {
        error: tAct("sessionExpired"),
      } satisfies ActionState;
    }

    const locale = await resolveRecipientLocale(fullUser.locale);
    const result = await sendAccountDeletionOtp({
      userId: user.id,
      email: fullUser.email,
      firstName: fullUser.firstName,
      locale,
    });

    if (!result.ok) {
      return { error: result.error } satisfies ActionState;
    }

    return {
      success: tAct("emailCodeSent", { newEmail: fullUser.email }),
    } satisfies ActionState;
  },
);

const confirmDeletionViaOtpSchema = z.object({
  code: z
    .string()
    .trim()
    .length(6, "validation.zod.code6Digits")
    .regex(/^\d{6}$/, "validation.zod.code6Digits"),
  confirmDelete: z.literal("on", {
    message: "validation.zod.confirmDeleteAccount",
  }),
});

export const confirmAccountDeletionViaOtpAction = validatedActionWithUser(
  confirmDeletionViaOtpSchema,
  async (data, _formData, user) => {
    const fullUser = await getUser();
    const tAct = await getTranslations("core.settings.actions");
    if (!fullUser) {
      return {
        error: tAct("sessionExpired"),
      } satisfies ActionState;
    }

    const locale = await resolveRecipientLocale(fullUser.locale);
    const result = await requestAccountDeletionViaOtp({
      userId: user.id,
      email: fullUser.email,
      firstName: fullUser.firstName,
      code: data.code,
      locale,
    });

    if (!result.ok) {
      return { error: result.error } satisfies ActionState;
    }

    await endCurrentSession();
    redirect("/sign-in?reason=deletion_requested");
  },
);

// ---------------------------------------------------------------------------
// Export dati GDPR (richiesta + rigenerazione signed URL)
// ---------------------------------------------------------------------------

const requestGdprExportSchema = z.object({});

export const requestGdprExportAction = validatedActionWithUser(
  requestGdprExportSchema,
  async (_data, _formData, user) => {
    const result = await requestGdprExport(user.id);
    if (!result.ok) {
      return { error: result.error } satisfies ActionState;
    }
    revalidatePath("/settings/privacy");
    return {
      success:
        "Richiesta registrata. Riceverai una mail quando l'export sarà pronto.",
    } satisfies ActionState;
  },
);

// State esteso con downloadUrl: il bottone "Scarica" rigenera una signed
// URL fresca lato server e poi il client apre l'URL in nuova tab. Non
// passa per redirect/header per evitare di esporre l'URL nel referer.
export type DownloadActionState = ActionState & { downloadUrl?: string };

const regenerateGdprUrlSchema = z.object({
  jobId: z.string().uuid("validation.zod.jobInvalid"),
});

export const regenerateGdprExportUrlAction = validatedActionWithUser(
  regenerateGdprUrlSchema,
  async (data, _formData, user): Promise<DownloadActionState> => {
    const result = await regenerateDownloadUrl({
      userId: user.id,
      jobId: data.jobId,
    });
    if (!result.ok) {
      return { error: result.error };
    }
    return { downloadUrl: result.url };
  },
);
