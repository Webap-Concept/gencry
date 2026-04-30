"use server";

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

  if (!invite) return { error: "Invito non valido." };
  if (invite.acceptedAt) return { error: "Questo invito è già stato utilizzato." };
  if (invite.declinedAt) return { error: "Questo invito è stato rifiutato." };
  if (new Date() > invite.expiresAt) return { error: "Questo invito è scaduto." };

  // ── Validate role ─────────────────────────────────────────────────────────
  const [role] = await db
    .select({ isAdmin: roles.isAdmin })
    .from(roles)
    .where(eq(roles.name, invite.role))
    .limit(1);

  if (!role) return { error: "Il ruolo dell'invito non esiste più." };
  // isAdmin viene propagato dal flag del ruolo; l'accesso admin via permessi
  // è gestito dall'RBAC, non dal flag utente.

  // ── Validate username ─────────────────────────────────────────────────────
  const usernameValidation = validateUsernameFormat(username);
  if (!usernameValidation.ok) return { error: usernameValidation.error };

  if (await isUsernameBlacklisted(username)) {
    return { error: "Questo username non è disponibile. Scegli un altro username." };
  }

  await ensureBloomFilter();

  const usernameAvail = await checkUsernameAvailability(username);
  if (!usernameAvail.available) {
    return { error: "Questo username è già in uso." };
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

    if (!inserted) return { error: "Impossibile creare l'account. Riprova." };
    createdUserId = inserted.id;
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return { error: "Questa email è già registrata. Prova ad accedere." };
    }
    throw err;
  }

  try {
    await db.insert(userProfiles).values({ userId: createdUserId, username });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      await db.delete(users).where(eq(users.id, createdUserId));
      return { error: "Questo username è appena stato scelto da un altro utente. Scegline un altro." };
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

  const log: NewActivityLog = {
    userId: createdUserId,
    action: ActivityType.SIGN_UP,
  };
  await db.insert(activityLogs).values(log);

  await createSession(createdUserId, invite.role);

  redirect("/admin");
}
