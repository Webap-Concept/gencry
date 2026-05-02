"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  type ActionState,
  validatedActionWithUser,
} from "@/lib/auth/middleware";
import { setMarketingConsent } from "@/lib/account/consents";
import { requestAccountDeletion } from "@/lib/account/deletion";
import { getUser } from "@/lib/db/queries";

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

    revalidatePath("/settings/privacy");
    return {
      success: data.enabled
        ? "Hai attivato le comunicazioni marketing."
        : "Hai disattivato le comunicazioni marketing.",
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
    if (!fullUser) {
      return {
        error: "Sessione scaduta. Effettua di nuovo il login.",
      } satisfies ActionState;
    }

    const result = await requestAccountDeletion({
      userId: user.id,
      currentPasswordHash: fullUser.passwordHash,
      currentPassword: data.password,
    });

    if (!result.ok) {
      return { error: result.error } satisfies ActionState;
    }

    // Cancella la sessione e porta l'utente alla pagina di sign-in con un
    // banner informativo. Da questo momento qualunque tentativo di rilogin
    // viene respinto fino al purge (vedi check in signIn / OAuth callback).
    (await cookies()).delete("session");
    redirect("/sign-in?reason=deletion_requested");
  },
);
