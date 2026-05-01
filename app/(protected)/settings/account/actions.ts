"use server";

import { z } from "zod";
import {
  type ActionState,
  validatedActionWithUser,
} from "@/lib/auth/middleware";
import { getUser } from "@/lib/db/queries";
import {
  cancelEmailChange,
  confirmEmailChange,
  requestEmailChange,
} from "@/lib/account/email-change";
import { changePassword } from "@/lib/account/password-change";

// ---------------------------------------------------------------------------
// Cambio email — step 1: richiedi cambio
// ---------------------------------------------------------------------------

const requestEmailChangeSchema = z.object({
  newEmail: z
    .string()
    .trim()
    .min(3, "Email troppo corta")
    .max(255)
    .email("Email non valida"),
  password: z.string().min(1, "La password è obbligatoria").max(100),
});

export const requestEmailChangeAction = validatedActionWithUser(
  requestEmailChangeSchema,
  async (data, _formData, user) => {
    const fullUser = await getUser();
    if (!fullUser) {
      return { error: "Sessione scaduta. Effettua di nuovo il login." } satisfies ActionState;
    }

    const result = await requestEmailChange({
      userId: user.id,
      currentEmail: fullUser.email,
      currentPasswordHash: fullUser.passwordHash,
      currentPendingEmail: fullUser.pendingEmail,
      pendingEmailRequestedAt: fullUser.pendingEmailRequestedAt,
      firstName: fullUser.firstName,
      password: data.password,
      newEmail: data.newEmail,
    });

    if (!result.ok) {
      return { error: result.error } satisfies ActionState;
    }

    return {
      success: `Ti abbiamo inviato un codice di verifica a ${data.newEmail.trim().toLowerCase()}.`,
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
    .length(6, "Il codice deve essere di 6 cifre")
    .regex(/^\d{6}$/, "Solo cifre"),
});

export const confirmEmailChangeAction = validatedActionWithUser(
  confirmEmailChangeSchema,
  async (data, _formData, user) => {
    const fullUser = await getUser();
    if (!fullUser) {
      return { error: "Sessione scaduta. Effettua di nuovo il login." } satisfies ActionState;
    }

    const result = await confirmEmailChange({
      userId: user.id,
      pendingEmail: fullUser.pendingEmail,
      code: data.code,
    });

    if (!result.ok) {
      return { error: result.error } satisfies ActionState;
    }

    return {
      success: `Email aggiornata: ora la tua email è ${result.newEmail}.`,
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
    return { success: "Richiesta di cambio email annullata." } satisfies ActionState;
  },
);

// ---------------------------------------------------------------------------
// Cambio password
// ---------------------------------------------------------------------------

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Password attuale obbligatoria").max(100),
  newPassword: z.string().min(8, "Minimo 8 caratteri").max(100),
  confirmPassword: z.string().min(1).max(100),
});

export const changePasswordAction = validatedActionWithUser(
  changePasswordSchema,
  async (data, _formData, user) => {
    const fullUser = await getUser();
    if (!fullUser) {
      return { error: "Sessione scaduta. Effettua di nuovo il login." } satisfies ActionState;
    }

    const result = await changePassword(
      user.id,
      fullUser.passwordHash,
      data.currentPassword,
      data.newPassword,
      data.confirmPassword,
    );

    if (!result.ok) {
      return { error: result.error } satisfies ActionState;
    }

    return { success: "Password aggiornata." } satisfies ActionState;
  },
);
