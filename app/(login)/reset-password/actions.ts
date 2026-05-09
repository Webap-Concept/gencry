// app/(login)/reset-password/actions.ts
"use server";

import { validatedAction } from "@/lib/auth/middleware";
import {
    deletePasswordResetToken,
    verifyPasswordResetToken,
} from "@/lib/auth/password-reset";
import { hashPassword } from "@/lib/auth/session";
import { db } from "@/lib/db/drizzle";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { z } from "zod";

const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: z
      .string()
      .min(8, "validation.zod.passwordMin")
      .max(30)
      .regex(/[A-Z]/, "validation.zod.passwordUppercase")
      .regex(/[0-9]/, "validation.zod.passwordNumber"),
    confirmPassword: z.string().min(8).max(30),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "validation.passwordMismatch",
    path: ["confirmPassword"],
  });

export const resetPassword = validatedAction(
  resetPasswordSchema,
  async (data) => {
    const { token, password } = data;

    const result = await verifyPasswordResetToken(token);
    if (!result.valid) {
      const t = await getTranslations("auth.validation.passwordReset");
      return { error: t(result.errorCode) };
    }

    const passwordHash = await hashPassword(password);

    await db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, result.userId));

    await deletePasswordResetToken(token);

    redirect("/sign-in?reset=success");
  },
);
