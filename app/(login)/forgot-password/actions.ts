// app/(login)/forgot-password/actions.ts
"use server";

import { validatedAction } from "@/lib/auth/middleware";
import { createPasswordResetToken } from "@/lib/auth/password-reset";
import {
  checkGeneralRateLimit,
  recordGeneralAttempt,
} from "@/lib/auth/rate-limit";
import { db } from "@/lib/db/drizzle";
import { users, userProfiles } from "@/lib/db/schema";
import { resolveRecipientLocale } from "@/lib/email/recipient-locale";
import { sendPasswordResetEmail } from "@/lib/email/templates/password-reset";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { z } from "zod";

const forgotPasswordSchema = z.object({
  email: z.email("Inserisci un indirizzo email valido"),
});

export const forgotPassword = validatedAction(
  forgotPasswordSchema,
  async (data) => {
    const t = await getTranslations("auth");
    const headersList = await headers();
    const ip =
      headersList.get("x-forwarded-for") ??
      headersList.get("x-real-ip") ??
      "unknown";

    const rateLimitKey = `forgot-password:${ip}`;
    const { blocked } = await checkGeneralRateLimit(rateLimitKey, 3, 15 * 60);

    if (blocked) {
      return { error: t("actionErrors.common.tooManyRequests") };
    }

    await recordGeneralAttempt(rateLimitKey);

    const { email } = data;

    const [row] = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: userProfiles.firstName,
        locale: users.locale,
      })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(eq(users.email, email))
      .limit(1);

    if (!row) {
      return {
        success: t("actionErrors.forgotPassword.successAlways"),
      };
    }

    const token = await createPasswordResetToken(row.id);
    const locale = await resolveRecipientLocale(row.locale);
    await sendPasswordResetEmail(
      row.email,
      token,
      row.firstName ?? undefined,
      locale,
    );

    return {
      success: t("actionErrors.forgotPassword.successAlways"),
    };
  },
);
