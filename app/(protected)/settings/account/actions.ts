"use server";

import { z } from "zod";
import { getTranslations } from "next-intl/server";
import {
  type ActionState,
  validatedActionWithUser,
} from "@/lib/auth/middleware";
import { getSession } from "@/lib/auth/session";
import { getUser } from "@/lib/db/queries";
import {
  cancelEmailChange,
  confirmEmailChange,
  requestEmailChange,
} from "@/lib/account/email-change";
import { changePassword } from "@/lib/account/password-change";
import { resolveRecipientLocale } from "@/lib/email/recipient-locale";

// ---------------------------------------------------------------------------
// Cambio email — step 1: richiedi cambio
// ---------------------------------------------------------------------------

const requestEmailChangeSchema = z.object({
  newEmail: z
    .string()
    .trim()
    .min(3, "validation.zod.emailInvalid")
    .max(255)
    .email("validation.zod.emailInvalid"),
  password: z.string().min(1, "validation.zod.passwordRequired").max(100),
});

export const requestEmailChangeAction = validatedActionWithUser(
  requestEmailChangeSchema,
  async (data, _formData, user) => {
    const fullUser = await getUser();
    const tAct = await getTranslations("core.settings.actions");
    if (!fullUser) {
      return { error: tAct("sessionExpired") } satisfies ActionState;
    }

    const locale = await resolveRecipientLocale(fullUser.locale);
    const result = await requestEmailChange({
      userId: user.id,
      currentEmail: fullUser.email,
      currentPasswordHash: fullUser.passwordHash,
      currentPendingEmail: fullUser.pendingEmail,
      pendingEmailRequestedAt: fullUser.pendingEmailRequestedAt,
      firstName: fullUser.firstName,
      password: data.password,
      newEmail: data.newEmail,
      locale,
    });

    if (!result.ok) {
      return { error: result.error } satisfies ActionState;
    }

    return {
      success: tAct("emailCodeSent", {
        newEmail: data.newEmail.trim().toLowerCase(),
      }),
    } satisfies ActionState;
  },
);

// ---------------------------------------------------------------------------
// Cambio email — step 2: conferma con codice OTP
// ---------------------------------------------------------------------------

const confirmEmailChangeSchema = z.object({
  code: z
    .string()
    .trim()
    .length(6, "validation.zod.code6Digits")
    .regex(/^\d{6}$/, "validation.zod.code6Digits"),
});

export const confirmEmailChangeAction = validatedActionWithUser(
  confirmEmailChangeSchema,
  async (data, _formData, user) => {
    const fullUser = await getUser();
    const tAct = await getTranslations("core.settings.actions");
    if (!fullUser) {
      return { error: tAct("sessionExpired") } satisfies ActionState;
    }

    const session = await getSession();

    const result = await confirmEmailChange({
      userId: user.id,
      pendingEmail: fullUser.pendingEmail,
      code: data.code,
      currentSessionId: session?.sessionId,
    });

    if (!result.ok) {
      return { error: result.error } satisfies ActionState;
    }

    // emailUpdated + emailUpdatedRevoked (ICU plural) compongono il messaggio
    // finale: "Email aggiornata: ora la tua email è X.[ 1 altra sessione...]"
    const base = tAct("emailUpdated", { newEmail: result.newEmail });
    const revokedSuffix = tAct("emailUpdatedRevoked", {
      count: result.revokedOtherSessions,
    });
    return {
      success: `${base}${revokedSuffix}`,
    } satisfies ActionState;
  },
);

// ---------------------------------------------------------------------------
// Cambio email — annulla richiesta pendente
// ---------------------------------------------------------------------------

const cancelEmailChangeSchema = z.object({});

export const cancelEmailChangeAction = validatedActionWithUser(
  cancelEmailChangeSchema,
  async (_data, _formData, user) => {
    await cancelEmailChange(user.id);
    const tAct = await getTranslations("core.settings.actions");
    return { success: tAct("emailChangeCanceled") } satisfies ActionState;
  },
);

// ---------------------------------------------------------------------------
// Cambio password
// ---------------------------------------------------------------------------

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "validation.zod.currentPasswordRequired").max(100),
  newPassword: z.string().min(8, "validation.zod.newPasswordMin").max(100),
  confirmPassword: z.string().min(1).max(100),
});

export const changePasswordAction = validatedActionWithUser(
  changePasswordSchema,
  async (data, _formData, user) => {
    const fullUser = await getUser();
    const tAct = await getTranslations("core.settings.actions");
    if (!fullUser) {
      return { error: tAct("sessionExpired") } satisfies ActionState;
    }

    const session = await getSession();

    const result = await changePassword(
      user.id,
      fullUser.passwordHash,
      data.currentPassword,
      data.newPassword,
      data.confirmPassword,
      session?.sessionId,
    );

    if (!result.ok) {
      return { error: result.error } satisfies ActionState;
    }

    return {
      success: tAct("passwordUpdated", { count: result.revokedOtherSessions }),
    } satisfies ActionState;
  },
);
