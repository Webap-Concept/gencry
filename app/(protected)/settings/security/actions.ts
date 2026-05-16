"use server";

import { z } from "zod";
import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getAdminUrlSlug } from "@/lib/admin-paths";
import {
  type ActionState,
  validatedActionWithUser,
} from "@/lib/auth/middleware";
import { getDeviceToken } from "@/lib/auth/trusted-device";
import { comparePasswords, getSession } from "@/lib/auth/session";
import {
  revokeAllUserSessions,
  revokeSession,
} from "@/lib/auth/sessions";
import {
  revokeAllOtherDevices,
  revokeDevice,
} from "@/lib/account/devices";
import {
  confirmMfaSetup,
  disableMfa as disableMfaQuery,
  getMfaState,
  MFA_STATE_TAG,
  regenerateRecoveryCodes,
  startMfaSetup,
  verifyTotpForLogin,
} from "@/lib/auth/mfa/queries";
import {
  clearPendingRecoveryCodesCookie,
  setPendingRecoveryCodesCookie,
} from "@/lib/auth/mfa/pending-codes-cookie";
import { buildOtpauthUrl } from "@/lib/auth/mfa/totp";
import { qrCodeDataUrl } from "@/lib/auth/mfa/qrcode";
import { getMfaPolicy } from "@/lib/auth/mfa/policy";
import {
  checkMfaTotpRateLimit,
  recordMfaTotpAttempt,
} from "@/lib/auth/mfa/rate-limit";
import { db } from "@/lib/db/drizzle";
import {
  activityLogs,
  ActivityType,
  type NewActivityLog,
  userProfiles,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { resolveRecipientLocale } from "@/lib/email/recipient-locale";
import { sendMfaDisabledEmail } from "@/lib/email/templates/mfa-disabled";
import { sendMfaEnabledEmail } from "@/lib/email/templates/mfa-enabled";

async function getFirstNameForEmail(userId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ firstName: userProfiles.firstName })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  return row?.firstName ?? undefined;
}

async function logActivity(userId: string, type: ActivityType) {
  const entry: NewActivityLog = { userId, action: type, ipAddress: "" };
  await db.insert(activityLogs).values(entry);
}

// ---------------------------------------------------------------------------
// Revoca singolo dispositivo
// ---------------------------------------------------------------------------

const revokeDeviceSchema = z.object({
  deviceId: z.coerce.number().int().positive(),
});

export const revokeDeviceAction = validatedActionWithUser(
  revokeDeviceSchema,
  async (data, _formData, user) => {
    const currentDeviceToken = await getDeviceToken();
    const result = await revokeDevice({
      userId: user.id,
      deviceId: data.deviceId,
      currentDeviceToken,
    });

    if (!result.ok) {
      return { error: result.error } satisfies ActionState;
    }

    revalidatePath("/settings/security");
    const tAct = await getTranslations("core.settings.actions");
    return { success: tAct("deviceRevoked") } satisfies ActionState;
  },
);

// ---------------------------------------------------------------------------
// Revoca tutti gli altri dispositivi
// ---------------------------------------------------------------------------

const revokeAllOthersSchema = z.object({});

export const revokeAllOtherDevicesAction = validatedActionWithUser(
  revokeAllOthersSchema,
  async (_data, _formData, user) => {
    const currentDeviceToken = await getDeviceToken();
    const { revokedCount } = await revokeAllOtherDevices({
      userId: user.id,
      currentDeviceToken,
    });

    revalidatePath("/settings/security");
    const tAct = await getTranslations("core.settings.actions");

    if (revokedCount === 0) {
      return {
        success: tAct("noOtherDevices"),
      } satisfies ActionState;
    }
    return {
      success: tAct("devicesRevoked", { n: revokedCount }),
    } satisfies ActionState;
  },
);

// ---------------------------------------------------------------------------
// Revoca singola sessione (l'utente non può revocare quella corrente)
// ---------------------------------------------------------------------------

const revokeSessionSchema = z.object({
  sessionId: z.string().uuid("validation.zod.sessionInvalid"),
});

export const revokeSessionAction = validatedActionWithUser(
  revokeSessionSchema,
  async (data, _formData, user) => {
    const current = await getSession();
    const tAct = await getTranslations("core.settings.actions");
    if (current && current.sessionId === data.sessionId) {
      return {
        error: tAct("cannotRevokeCurrentSession"),
      } satisfies ActionState;
    }

    // Ownership check via WHERE id=$1 AND user_id=$2: una sessione di un
    // altro utente non viene revocata anche se l'attacker indovina il sid
    // (UUIDv4 = ~122 bit di entropia, praticamente impossibile, ma defense
    // in depth è gratis).
    await revokeSession(data.sessionId, user.id);

    revalidatePath("/settings/security");
    return { success: tAct("sessionRevoked") } satisfies ActionState;
  },
);

// ---------------------------------------------------------------------------
// Revoca tutte le altre sessioni
// ---------------------------------------------------------------------------

const revokeAllOtherSessionsSchema = z.object({});

export const revokeAllOtherSessionsAction = validatedActionWithUser(
  revokeAllOtherSessionsSchema,
  async (_data, _formData, user) => {
    const current = await getSession();
    const { revokedCount } = await revokeAllUserSessions({
      userId: user.id,
      exceptSessionId: current?.sessionId,
    });

    revalidatePath("/settings/security");
    const tAct = await getTranslations("core.settings.actions");

    if (revokedCount === 0) {
      return {
        success: tAct("noOtherSessions"),
      } satisfies ActionState;
    }
    return {
      success: tAct("sessionsRevoked", { n: revokedCount }),
    } satisfies ActionState;
  },
);

// ---------------------------------------------------------------------------
// MFA TOTP — start setup
//
// Genera un secret pending e ritorna QR + chiave manuale al client.
// Il setup non è ancora attivo: serve `confirmMfaSetupAction` con il
// primo codice valido per attivarlo davvero.
// ---------------------------------------------------------------------------

export type MfaStartState = ActionState & {
  qrCodeDataUrl?: string;
  manualKey?: string;
};

const startMfaSetupSchema = z.object({});

export const startMfaSetupAction = validatedActionWithUser(
  startMfaSetupSchema,
  async (_data, _formData, user): Promise<MfaStartState> => {
    const state = await getMfaState(user.id);
    const tAct = await getTranslations("core.settings.actions");
    if (state.enabled) {
      return { error: tAct("mfaAlreadyActive") };
    }

    const policy = await getMfaPolicy();
    const { secretBase32 } = await startMfaSetup(user.id);
    const otpauthUrl = buildOtpauthUrl({
      secretBase32,
      label: user.email,
      issuer: policy.issuer,
    });
    const dataUrl = await qrCodeDataUrl(otpauthUrl);

    return {
      success: tAct("mfaScanQr"),
      qrCodeDataUrl: dataUrl,
      manualKey: secretBase32,
    };
  },
);

// ---------------------------------------------------------------------------
// MFA TOTP — confirm setup
//
// Verifica il primo codice, attiva MFA, e ritorna i 10 recovery codes
// in chiaro (mostrati una sola volta).
// ---------------------------------------------------------------------------

export type MfaConfirmState = ActionState;

const confirmMfaSetupSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "core.settings.actions.code6Digits"),
  // Quale chrome ha invocato l'action: determina la page /codes di
  // destinazione del redirect post-success.
  context: z.enum(["admin", "public"]).optional().default("public"),
});

export const confirmMfaSetupAction = validatedActionWithUser(
  confirmMfaSetupSchema,
  async (data, _formData, user): Promise<MfaConfirmState> => {
    const result = await confirmMfaSetup(user.id, data.token);
    const tAct = await getTranslations("core.settings.actions");
    if (!result.ok) {
      if (result.reason === "no_pending") {
        return { error: tAct("mfaNoPendingSetup") };
      }
      return { error: tAct("mfaInvalidCode") };
    }

    await logActivity(user.id, ActivityType.MFA_ENABLED);

    // Email di notifica fire-and-forget — non bloccare la risposta se Resend
    // ha problemi (l'attivazione è comunque andata a buon fine).
    const enableLocale = await resolveRecipientLocale(user.locale);
    void getFirstNameForEmail(user.id)
      .then((firstName) =>
        sendMfaEnabledEmail(user.email, firstName, enableLocale),
      )
      .catch((err: unknown) => {
        console.error("[mfa] sendMfaEnabledEmail failed:", err);
      });

    // Cookie firmato (10 min) → redirect a una page dedicata che li
    // mostra. Niente codici nello state action: lo stream poteva rompersi
    // tra commit e ack del client perdendo i codici per sempre. Vedi
    // lib/auth/mfa/pending-codes-cookie.ts per il razionale.
    await setPendingRecoveryCodesCookie(result.recoveryCodes, "setup");
    updateTag(MFA_STATE_TAG);

    const redirectTo =
      data.context === "admin"
        ? `/${await getAdminUrlSlug()}/security/mfa-enroll/codes`
        : "/settings/security/codes";
    redirect(redirectTo);
  },
);

// ---------------------------------------------------------------------------
// MFA — ack pending recovery codes
//
// Chiamata dalla page /codes quando l'utente conferma di aver salvato i
// codici. Cancella il cookie e rimanda alla page MFA del contesto giusto.
// Da fuori della page /codes l'azione non ha effetti utili (cookie non c'è).
// ---------------------------------------------------------------------------

export async function ackPendingRecoveryCodesAction(
  formData: FormData,
): Promise<void> {
  const context = formData.get("context");
  await clearPendingRecoveryCodesCookie();
  if (context === "admin") {
    const slug = await getAdminUrlSlug();
    redirect(`/${slug}/security/mfa-enroll`);
  }
  redirect("/settings/security");
}

// ---------------------------------------------------------------------------
// MFA TOTP — disable
//
// Step-up: richiede password CORRENTE + codice TOTP corrente.
// ---------------------------------------------------------------------------

const disableMfaSchema = z.object({
  password: z.string().min(1, "core.settings.actions.enterPassword"),
  token: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "core.settings.actions.code6Digits"),
});

export const disableMfaAction = validatedActionWithUser(
  disableMfaSchema,
  async (data, _formData, user): Promise<ActionState> => {
    const state = await getMfaState(user.id);
    const tAct = await getTranslations("core.settings.actions");
    if (!state.enabled) {
      return { error: tAct("mfaNotActive") };
    }

    const passwordOk = await comparePasswords(data.password, user.passwordHash);
    if (!passwordOk) {
      return { error: tAct("passwordIncorrect") };
    }

    const rl = await checkMfaTotpRateLimit(user.id);
    if (rl.blocked) {
      return {
        error: tAct("tooManyAttempts"),
      };
    }

    const totpResult = await verifyTotpForLogin(user.id, data.token);
    if (!totpResult.valid) {
      await recordMfaTotpAttempt(user.id);
      return { error: tAct("mfaInvalidCode") };
    }

    await disableMfaQuery(user.id);
    await logActivity(user.id, ActivityType.MFA_DISABLED);

    const disableLocale = await resolveRecipientLocale(user.locale);
    void getFirstNameForEmail(user.id)
      .then((firstName) =>
        sendMfaDisabledEmail(user.email, firstName, disableLocale),
      )
      .catch((err: unknown) => {
        console.error("[mfa] sendMfaDisabledEmail failed:", err);
      });

    revalidatePath("/settings/security");
    updateTag(MFA_STATE_TAG);
    return { success: tAct("mfaDisabled") };
  },
);

// ---------------------------------------------------------------------------
// MFA TOTP — regenerate recovery codes
//
// Step-up: richiede codice TOTP corrente. I 10 codici precedenti vengono
// invalidati e ne vengono generati 10 nuovi.
// ---------------------------------------------------------------------------

export type MfaRegenerateState = ActionState;

const regenerateRecoveryCodesSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "core.settings.actions.code6Digits"),
  context: z.enum(["admin", "public"]).optional().default("public"),
});

export const regenerateRecoveryCodesAction = validatedActionWithUser(
  regenerateRecoveryCodesSchema,
  async (data, _formData, user): Promise<MfaRegenerateState> => {
    const state = await getMfaState(user.id);
    const tAct = await getTranslations("core.settings.actions");
    if (!state.enabled) {
      return { error: tAct("mfaNotActive") };
    }

    const rl = await checkMfaTotpRateLimit(user.id);
    if (rl.blocked) {
      return {
        error: tAct("tooManyAttempts"),
      };
    }

    const totpResult = await verifyTotpForLogin(user.id, data.token);
    if (!totpResult.valid) {
      await recordMfaTotpAttempt(user.id);
      return { error: tAct("mfaInvalidCode") };
    }

    const codes = await regenerateRecoveryCodes(user.id);
    await logActivity(user.id, ActivityType.MFA_RECOVERY_CODES_REGENERATED);
    // recoveryCodesRemaining è parte di MfaState → invalida la cache.
    updateTag(MFA_STATE_TAG);

    // Stesso pattern di confirmMfaSetupAction: cookie firmato + redirect.
    await setPendingRecoveryCodesCookie(codes, "regenerate");

    const redirectTo =
      data.context === "admin"
        ? `/${await getAdminUrlSlug()}/security/mfa-enroll/codes`
        : "/settings/security/codes";
    redirect(redirectTo);
  },
);
