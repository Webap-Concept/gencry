"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  type ActionState,
  validatedActionWithUser,
} from "@/lib/auth/middleware";
import { setMarketingConsent } from "@/lib/account/consents";

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
