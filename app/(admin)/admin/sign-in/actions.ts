"use server";

import { validatedAction } from "@/lib/auth/middleware";
import { comparePasswords, setSession } from "@/lib/auth/session";
import { db } from "@/lib/db/drizzle";
import { users } from "@/lib/db/schema";
import { can } from "@/lib/rbac/can";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { z } from "zod";

const adminSignInSchema = z.object({
  email: z.email().min(3).max(255),
  password: z.string().min(8).max(30),
});

export const adminSignIn = validatedAction(
  adminSignInSchema,
  async (data) => {
    const { email, password } = data;
    const t = await getTranslations("admin.signInErrors");

    const [foundUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!foundUser) {
      return { error: t("invalidCredentials"), email, password };
    }

    // Verifica accesso admin: flag is_admin OPPURE permesso RBAC "admin:access"
    const hasAccess = foundUser.isAdmin || (await can(foundUser, "admin:access"));
    if (!hasAccess) {
      return { error: t("noAccess"), email, password };
    }

    if (foundUser.bannedAt !== null) {
      return { error: t("banned"), email, password };
    }

    const isPasswordValid = await comparePasswords(password, foundUser.passwordHash);
    if (!isPasswordValid) {
      return { error: t("invalidCredentials"), email, password };
    }

    await setSession(foundUser);

    redirect("/admin");
  },
);
