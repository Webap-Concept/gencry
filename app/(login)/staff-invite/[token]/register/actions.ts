"use server";

import { recordSignupConsents } from "@/lib/account/consent-ledger";
import { isUsernameBlacklisted } from "@/lib/auth/blacklist";
import { isUniqueConstraintError } from "@/lib/auth/race-condition";
import { createSession, hashPassword } from "@/lib/auth/session";
import { validateUsernameFormat } from "@/lib/auth/username-validator";
import {
  addEmailToBloom,
  addUsernameToBloom,
  checkUsernameAvailability,
  ensureBloomFilter,
} from "@/lib/bloom/bloom-filter";
import { db } from "@/lib/db/drizzle";
import { getConsentVersions } from "@/lib/db/pages-queries";
import {
  activityLogs,
  ActivityType,
  roles,
  staffInvitations,
  userProfiles,
  users,
  type NewActivityLog,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

const registerSchema = z.object({
  token: z.string().min(64).max(64),
  username: z
    .string()
    .min(3, "Username troppo corto (minimo 3 caratteri)")
    .max(50, "Username troppo lungo (massimo 50 caratteri)"),
  password: z
    .string()
    .min(8, "La password deve avere almeno 8 caratteri")
    .max(30, "La password non può superare 30 caratteri")
    .regex(/[A-Z]/, "La password deve contenere almeno una lettera maiuscola")
    .regex(/[0-9]/, "La password deve contenere almeno un numero")
    .regex(/[^a-zA-Z0-9]/, "La password deve contenere almeno un carattere speciale"),
  acceptTerms: z.literal("on", { message: "Devi accettare i Termini di Servizio" }),
  acceptPrivacy: z.literal("on", { message: "Devi accettare la Privacy Policy" }),
});

export type RegisterState = { error?: string };

export async function registerViaInvite(
  prevState: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const t = await getTranslations("auth");
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { token, username, password } = parsed.data;

  // ── Validate invite ───────────────────────────────────────────────────────
  const [invite] = await db
    .select({
      id: staffInvitations.id,
      email: staffInvitations.email,
      role: staffInvitations.role,
      expiresAt: staffInvitations.expiresAt,
      acceptedAt: staffInvitations.acceptedAt,
      declinedAt: staffInvitations.declinedAt,
    })
    .from(staffInvitations)
    .where(eq(staffInvitations.token, token))
    .limit(1);

  if (!invite) return { error: t("actionErrors.staffRegister.inviteInvalid") };
  if (invite.acceptedAt) return { error: t("actionErrors.staffRegister.inviteAlreadyUsed") };
  if (invite.declinedAt) return { error: t("actionErrors.staffRegister.inviteDeclined") };
  if (new Date() > invite.expiresAt) return { error: t("actionErrors.staffRegister.inviteExpired") };

  // ── Validate role ─────────────────────────────────────────────────────────
  const [role] = await db
    .select({ isAdmin: roles.isAdmin })
    .from(roles)
    .where(eq(roles.name, invite.role))
    .limit(1);

  if (!role) return { error: t("actionErrors.staffRegister.roleNotFound") };
  // isAdmin viene propagato dal flag del ruolo; l'accesso admin via permessi
  // è gestito dall'RBAC, non dal flag utente.

  // ── Validate username ─────────────────────────────────────────────────────
  const usernameValidation = validateUsernameFormat(username);
  if (!usernameValidation.ok) return { error: usernameValidation.error };

  if (await isUsernameBlacklisted(username)) {
    return { error: t("actionErrors.signUp.usernameBlocked") };
  }

  await ensureBloomFilter();

  const usernameAvail = await checkUsernameAvailability(username);
  if (!usernameAvail.available) {
    return { error: t("actionErrors.signUp.usernameTaken") };
  }

  // ── Create user ───────────────────────────────────────────────────────────
  const { termsVersion, privacyVersion } = await getConsentVersions();
  const passwordHash = await hashPassword(password);
  const now = new Date();

  let createdUserId: string;

  try {
    const [inserted] = await db
      .insert(users)
      .values({
        email: invite.email,
        passwordHash,
        role: invite.role,
        isAdmin: role.isAdmin,
        emailVerified: true,
        onboardingCompletedAt: now,
        acceptedTermsAt: now,
        acceptedTermsVersion: termsVersion,
        acceptedPrivacyAt: now,
        acceptedPrivacyVersion: privacyVersion,
      })
      .returning({ id: users.id, role: users.role });

    if (!inserted) return { error: t("actionErrors.common.createAccountFailed") };
    createdUserId = inserted.id;
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return { error: t("actionErrors.staffRegister.emailExists") };
    }
    throw err;
  }

  try {
    await db.insert(userProfiles).values({ userId: createdUserId, username });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      await db.delete(users).where(eq(users.id, createdUserId));
      return { error: t("actionErrors.signUp.usernameRace") };
    }
    throw err;
  }

  // ── Post-creation steps ───────────────────────────────────────────────────
  await db
    .update(staffInvitations)
    .set({ acceptedAt: now })
    .where(eq(staffInvitations.id, invite.id));

  await addEmailToBloom(invite.email);
  await addUsernameToBloom(username);

  // Append-only consent ledger (terms + privacy obbligatori; lo schema Zod
  // sopra garantisce che siano stati spuntati). Marketing non è in form.
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    null;
  await recordSignupConsents({
    userId: createdUserId,
    acceptMarketing: false,
    ip,
    userAgent: headersList.get("user-agent") ?? null,
    locale: null,
    source: "staff_invite",
  });

  const log: NewActivityLog = {
    userId: createdUserId,
    action: ActivityType.SIGN_UP,
  };
  await db.insert(activityLogs).values(log);

  await createSession(createdUserId, invite.role);

  redirect("/admin");
}
