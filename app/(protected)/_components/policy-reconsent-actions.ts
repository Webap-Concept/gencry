"use server";

import { acceptUpdatedConsents } from "@/lib/account/policy-reconsent";
import {
  type ActionState,
  validatedActionWithUser,
} from "@/lib/auth/middleware";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

// Form fields: tre checkbox HTML standard ("on" se spuntato, assente
// altrimenti). I terms/privacy sono richiesti dalla form lato client per
// poter cliccare submit; lato server non li forziamo strict perché la
// frontend potrebbe legittimamente skipparli (marketing) e perché il banner
// va comunque protetto contro l'utente che modifica il DOM.
const acceptUpdatedConsentsSchema = z.object({
  terms: z
    .string()
    .optional()
    .transform((v) => v === "on"),
  privacy: z
    .string()
    .optional()
    .transform((v) => v === "on"),
  marketing: z
    .string()
    .optional()
    .transform((v) => v === "on"),
});

export const acceptUpdatedConsentsAction = validatedActionWithUser(
  acceptUpdatedConsentsSchema,
  async (data, _formData, user) => {
    if (!data.terms && !data.privacy && !data.marketing) {
      return {
        error: "Seleziona almeno una policy da accettare.",
      } satisfies ActionState;
    }

    const headersList = await headers();
    const ip =
      headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headersList.get("x-real-ip") ??
      null;

    await acceptUpdatedConsents({
      userId: user.id,
      ip,
      userAgent: headersList.get("user-agent") ?? null,
      locale: null,
      accept: {
        terms: data.terms,
        privacy: data.privacy,
        marketing: data.marketing,
      },
    });

    // Invalida tutti i layout: il banner è renderizzato dal layout protetto
    // ed è il layout a leggere `getPendingReconsents`.
    revalidatePath("/", "layout");

    return {
      success: "Consensi aggiornati. Grazie!",
    } satisfies ActionState;
  },
);
