// /app/(login)/actions.ts

"use server";

import {
  isDomainBlacklisted,
  isIpBlacklisted,
  isUsernameBlacklisted,
} from "@/lib/auth/blacklist";
import {
  validatedAction,
  validatedActionWithUser,
} from "@/lib/auth/middleware";
import { setPendingMfaCookie } from "@/lib/auth/mfa/pending-cookie";
import { getMfaState } from "@/lib/auth/mfa/queries";
import { createVerificationCode } from "@/lib/auth/otp";
import {
  addTrustedDevice,
  checkDeviceTrust,
  generateDeviceToken,
  getDeviceToken,
  setPendingAuthCookie,
  setDeviceTokenCookie,
} from "@/lib/auth/trusted-device";
import { sendDeviceVerificationEmail } from "@/lib/email/templates/device-verification";
import {
  isUniqueConstraintError,
  resolveConflictField,
} from "@/lib/auth/race-condition";
import {
  checkAvailabilityRateLimit,
  checkRateLimit,
  checkSignupRateLimit,
  recordLoginAttempt,
  recordSignupAttempt,
} from "@/lib/auth/rate-limit";
import {
  comparePasswords,
  endCurrentSession,
  hashPassword,
  setSession,
} from "@/lib/auth/session";
import { validateUsernameFormat } from "@/lib/auth/username-validator";
import {
  addEmailToBloom,
  addUsernameToBloom,
  checkEmailAvailability,
  checkUsernameAvailability,
  ensureBloomFilter,
} from "@/lib/bloom/bloom-filter";
import { recordSignupConsents } from "@/lib/account/consent-ledger";
import { db } from "@/lib/db/drizzle";
import { getConsentVersions } from "@/lib/db/pages-queries";
import { getUser } from "@/lib/db/queries";
import {
  activityLogs,
  ActivityType,
  userProfiles,
  users,
  type NewActivityLog,
} from "@/lib/db/schema";
import { getAppSettings } from "@/lib/db/settings-queries";
import { sendSignupVerificationEmail } from "@/lib/email/templates/signup-verification";
import { eq, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

async function verifyTurnstile(token: string | null, ip: string): Promise<boolean> {
  const settings = await getAppSettings();
  const secret = settings.cf_turnstile_secret_key;
  if (!secret) return true; // Turnstile non configurato: skip
  if (!token) return false;

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
  });
  const json = await res.json() as { success: boolean };
  return json.success === true;
}

async function logActivity(
  userId: string,
  type: ActivityType,
  ipAddress?: string,
) {
  const newActivity: NewActivityLog = {
    userId,
    action: type,
    ipAddress: ipAddress || "",
  };
  await db.insert(activityLogs).values(newActivity);
}

// ---------------------------------------------------------------------------
// signIn
// ---------------------------------------------------------------------------

const signInSchema = z.object({
  email: z.email().min(3).max(255),
  password: z.string().min(8).max(30),
});

export const signIn = validatedAction(signInSchema, async (data, formData) => {
  const { email, password } = data;
  const t = await getTranslations("auth");

  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    "unknown";

  const turnstileOk = await verifyTurnstile(
    formData.get("cf_turnstile_token") as string | null,
    ip,
  );
  if (!turnstileOk) {
    return { error: t("actionErrors.common.turnstileFailed"), email, password };
  }

  const { blocked } = await checkRateLimit(email, ip);
  if (blocked) {
    return {
      error: t("actionErrors.common.tooManyAttempts"),
      email,
      password,
    };
  }

  const [foundUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!foundUser) {
    await comparePasswords(
      password,
      "$2b$12$dummyhashXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    );
    await recordLoginAttempt(email, ip, false);
    return { error: t("actionErrors.signIn.invalidCredentials"), email, password };
  }

  if (foundUser.bannedAt !== null) {
    await comparePasswords(
      password,
      "$2b$12$dummyhashXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    );
    return {
      error: t("actionErrors.signIn.banned"),
      email,
      password,
    };
  }

  // Soft-delete: utente in attesa di purge fisico (entro 30gg). Niente login
  // finché non viene annullato manualmente dall'assistenza. Compare dummy
  // per evitare un timing oracle che riveli l'esistenza dell'account.
  if (foundUser.deletedAt !== null) {
    await comparePasswords(
      password,
      "$2b$12$dummyhashXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    );
    return {
      error: t("actionErrors.signIn.deleted"),
      email,
      password,
    };
  }

  const isPasswordValid = await comparePasswords(password, foundUser.passwordHash);

  if (!isPasswordValid) {
    await recordLoginAttempt(email, ip, false);
    return { error: t("actionErrors.signIn.invalidCredentials"), email, password };
  }

  if (foundUser.role !== "admin") {
    const settings = await getAppSettings();
    if (settings.maintenance_mode === "true") {
      return {
        error: t("actionErrors.signIn.maintenance"),
        email,
        password,
      };
    }
  }

  await recordLoginAttempt(email, ip, true);

  const deviceToken = await getDeviceToken();
  const { trusted, isFirstDevice } = await checkDeviceTrust(foundUser.id, deviceToken);

  if (trusted) {
    if (isFirstDevice) {
      const newToken = generateDeviceToken();
      const ua = headersList.get("user-agent") ?? undefined;
      await addTrustedDevice(foundUser.id, newToken, ua);
      await setDeviceTokenCookie(newToken);
    }

    // MFA gate: se l'utente ha attivato il TOTP, sospendi la sessione e
    // manda al challenge. setSession verrà chiamata da /sign-in/mfa solo
    // dopo verifica del codice. Niente logActivity SIGN_IN qui — viene
    // loggato MFA_VERIFIED dopo il check.
    const mfaState = await getMfaState(foundUser.id);
    if (mfaState.enabled) {
      await setPendingMfaCookie(foundUser.id, foundUser.role);
      redirect("/sign-in/mfa");
    }

    await Promise.all([
      setSession(foundUser),
      logActivity(foundUser.id, ActivityType.SIGN_IN),
    ]);
    // Onboarding gate: utenti non-admin che non hanno completato il wizard
    // (es. abbandonato dopo signup) tornano sempre lì finché non finiscono.
    if (foundUser.role !== "admin" && !foundUser.onboardingCompletedAt) {
      redirect("/onboarding");
    }
    redirect(foundUser.role === "admin" ? "/admin" : "/");
  }

  // Dispositivo non riconosciuto: OTP via email, sessione sospesa
  const code = await createVerificationCode(foundUser.id, "device_verification");
  try {
    await sendDeviceVerificationEmail(foundUser.email, code);
  } catch (err) {
    console.error("[signIn] sendDeviceVerificationEmail failed:", err);
  }
  await setPendingAuthCookie(foundUser.id, foundUser.role);
  redirect("/verify-device");
});

// ---------------------------------------------------------------------------
// signUp
// ---------------------------------------------------------------------------

const signUpSchema = z
  .object({
    // firstName e lastName non sono raccolti nella form di registrazione:
    // vengono inseriti dall'utente nella pagina del profilo dopo la registrazione.
    username: z
      .string()
      .min(3, "Username minimo 3 caratteri")
      .max(50, "Username massimo 50 caratteri")
      .superRefine((value, ctx) => {
        const result = validateUsernameFormat(value);
        if (!result.ok) {
          ctx.addIssue({ code: "custom", message: result.error });
        }
      }),
    email: z.email("Email non valida"),
    password: z
      .string()
      .min(8, "La password deve contenere almeno 8 caratteri")
      .max(30)
      .regex(/[A-Z]/, "La password deve contenere almeno una lettera maiuscola")
      .regex(/[0-9]/, "La password deve contenere almeno un numero")
      .regex(
        /[^a-zA-Z0-9]/,
        "La password deve contenere almeno un carattere speciale",
      ),
    acceptTerms: z.string(),
    acceptPrivacy: z.string(),
    acceptMarketing: z.string().optional(),
  })
  .refine((data) => data.acceptTerms === "on", {
    message: "Devi accettare i Termini e Condizioni per procedere",
    path: ["acceptTerms"],
  })
  .refine((data) => data.acceptPrivacy === "on", {
    message: "Devi accettare la Privacy Policy per procedere",
    path: ["acceptPrivacy"],
  });

export const signUp = validatedAction(signUpSchema, async (data, formData) => {
  const { username, email, password } = data;
  // firstName e lastName non presenti in questa fase: saranno null nel DB
  // fino a quando l'utente non li compila dalla pagina del profilo.
  const t = await getTranslations("auth");

  const settings = await getAppSettings();
  if (settings.registrations_enabled === "false") {
    return {
      error: t("actionErrors.signUp.registrationsDisabled"),
      email,
      password,
    };
  }

  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    "unknown";

  const turnstileOk = await verifyTurnstile(
    formData.get("cf_turnstile_token") as string | null,
    ip,
  );
  if (!turnstileOk) {
    return { error: t("actionErrors.common.turnstileFailed"), email, password };
  }

  // Rate limit registrazione (bf_signup_max, default 10 per IP)
  const signupCheck = await checkSignupRateLimit(ip);
  if (signupCheck.blocked) {
    return {
      error: t("actionErrors.signUp.tooManyAttempts"),
      email,
      password,
    };
  }

  if (await isIpBlacklisted(ip)) {
    return { error: t("actionErrors.common.ipBlocked"), email, password };
  }

  if (await isDomainBlacklisted(email)) {
    return {
      error: t("actionErrors.signUp.domainBlocked"),
      email,
      password,
    };
  }

  if (await isUsernameBlacklisted(username)) {
    return {
      error: t("actionErrors.signUp.usernameBlocked"),
      email,
      password,
    };
  }

  await ensureBloomFilter();

  const [emailAvailability, usernameAvailability] = await Promise.all([
    checkEmailAvailability(email),
    checkUsernameAvailability(username),
  ]);

  if (!emailAvailability.available) {
    return { error: t("actionErrors.signUp.emailTaken"), email, password };
  }

  if (!usernameAvailability.available) {
    return { error: t("actionErrors.signUp.usernameTaken"), email, password };
  }

  const { termsVersion, privacyVersion, marketingVersion } =
    await getConsentVersions();

  const passwordHash = await hashPassword(password);
  const defaultRole = settings.default_role || "member";
  const now = new Date();

  let createdUser: typeof users.$inferSelect;

  try {
    const [inserted] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        role: defaultRole,
        acceptedTermsAt: now,
        acceptedTermsVersion: termsVersion,
        acceptedPrivacyAt: now,
        acceptedPrivacyVersion: privacyVersion,
        acceptedMarketingAt: data.acceptMarketing === "on" ? now : null,
        acceptedMarketingVersion:
          data.acceptMarketing === "on" ? marketingVersion : null,
      })
      .returning();

    if (!inserted) {
      return { error: t("actionErrors.common.createAccountFailed"), email, password };
    }

    createdUser = inserted;
  } catch (err: unknown) {
    if (isUniqueConstraintError(err)) {
      await recordSignupAttempt(ip);
      return {
        error: t("actionErrors.signUp.emailRace"),
        email,
        password,
      };
    }
    throw err;
  }

  try {
    await db.insert(userProfiles).values({
      userId: createdUser.id,
      // firstName e lastName lasciati null: l'utente li inserirà dal profilo
      username,
    });
  } catch (err: unknown) {
    if (isUniqueConstraintError(err)) {
      await db.delete(users).where(eq(users.id, createdUser.id));
      await recordSignupAttempt(ip);
      return {
        error: t("actionErrors.signUp.usernameRace"),
        email,
        password,
      };
    }
    throw err;
  }

  await addEmailToBloom(createdUser.email);
  await addUsernameToBloom(username);

  // Append-only consent ledger (GDPR Art. 7(1)). best-effort: errori interni
  // non bloccano il signup. La cattura di IP/UA segue la strategy configurata
  // in /admin/compliance/gdpr (ip_strategy, capture_ip, ecc.).
  await recordSignupConsents({
    userId: createdUser.id,
    acceptMarketing: data.acceptMarketing === "on",
    ip: ip === "unknown" ? null : ip,
    userAgent: headersList.get("user-agent") ?? null,
    locale: null,
    source: "signup",
  });

  const code = await createVerificationCode(createdUser.id);

  try {
    // firstName non disponibile in questa fase: passiamo undefined,
    // il template email userà un saluto generico.
    await sendSignupVerificationEmail(createdUser.email, code, undefined);
  } catch (emailErr) {
    console.error("[signUp] sendSignupVerificationEmail failed:", emailErr);
  }

  await logActivity(createdUser.id, ActivityType.SIGN_UP);

  (await cookies()).set("pending_verification_user_id", createdUser.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 20,
    path: "/",
  });

  redirect("/verify-email");
});

// ---------------------------------------------------------------------------
// checkEmailAction — usa checkAvailabilityRateLimit (non login!)
// ---------------------------------------------------------------------------

export async function checkEmailAction(email: string) {
  const t = await getTranslations("auth");
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const availCheck = await checkAvailabilityRateLimit(ip);
  if (availCheck.blocked) {
    return {
      available: false,
      error: t("actionErrors.common.tooManyChecks"),
    };
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    return { available: false, error: t("actionErrors.checkEmail.emailRequired") };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { available: false, error: t("actionErrors.checkEmail.emailInvalid") };
  }

  if (await isDomainBlacklisted(normalizedEmail)) {
    return { available: false, error: t("actionErrors.checkEmail.domainBlocked") };
  }

  await ensureBloomFilter();
  const result = await checkEmailAvailability(normalizedEmail);

  return {
    available: result.available,
    checkedViaDb: result.checkedViaDb,
    error: result.available ? "" : t("actionErrors.checkEmail.alreadyRegistered"),
  };
}

// ---------------------------------------------------------------------------
// checkUsernameAction — usa checkAvailabilityRateLimit (non login!)
// ---------------------------------------------------------------------------

export async function checkUsernameAction(
  username: string,
): Promise<{ available: boolean; error?: string }> {
  const t = await getTranslations("auth");
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const availCheck = await checkAvailabilityRateLimit(ip);
  if (availCheck.blocked) {
    return {
      available: false,
      error: t("actionErrors.common.tooManyChecks"),
    };
  }

  if (!username || username.length < 3) {
    return { available: false };
  }

  if (await isUsernameBlacklisted(username)) {
    return { available: false, error: t("actionErrors.checkUsername.blocked") };
  }

  const result = await checkUsernameAvailability(username);
  return {
    available: result.available,
    error: result.available ? undefined : t("actionErrors.checkUsername.alreadyTaken"),
  };
}

// ---------------------------------------------------------------------------
// signOut
// ---------------------------------------------------------------------------

export async function signOut() {
  const user = await getUser();
  if (user) await logActivity(user.id, ActivityType.SIGN_OUT);
  // endCurrentSession revoca la row sessions + invalida la cache Redis
  // + cancella il cookie. Senza, la sessione resterebbe valida per altri
  // 60s (TTL cache) anche dopo il "logout".
  await endCurrentSession();
  redirect("/sign-in");
}

// ---------------------------------------------------------------------------
// updatePassword
// ---------------------------------------------------------------------------

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(100),
  newPassword: z.string().min(8).max(100),
  confirmPassword: z.string().min(8).max(100),
});

export const updatePassword = validatedActionWithUser(
  updatePasswordSchema,
  async (data, _, user) => {
    const { currentPassword, newPassword, confirmPassword } = data;

    const isPasswordValid = await comparePasswords(
      currentPassword,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: "Current password is incorrect.",
      };
    }

    if (currentPassword === newPassword) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: "New password must be different from the current password.",
      };
    }

    if (confirmPassword !== newPassword) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: "New password and confirmation password do not match.",
      };
    }

    const newPasswordHash = await hashPassword(newPassword);
    await Promise.all([
      db
        .update(users)
        .set({ passwordHash: newPasswordHash })
        .where(eq(users.id, user.id)),
      logActivity(user.id, ActivityType.UPDATE_PASSWORD),
    ]);

    return { success: "Password updated successfully." };
  },
);

// ---------------------------------------------------------------------------
// deleteAccount
// ---------------------------------------------------------------------------

const deleteAccountSchema = z.object({
  password: z.string().min(8).max(100),
});

export const deleteAccount = validatedActionWithUser(
  deleteAccountSchema,
  async (data, _, user) => {
    const { password } = data;

    const isPasswordValid = await comparePasswords(password, user.passwordHash);
    if (!isPasswordValid) {
      return { password, error: "Incorrect password. Account deletion failed." };
    }

    await logActivity(user.id, ActivityType.DELETE_ACCOUNT);
    await db
      .update(users)
      .set({
        deletedAt: sql`CURRENT_TIMESTAMP`,
        email: sql`CONCAT(email, '-', id, '-deleted')`,
      })
      .where(eq(users.id, user.id));

    await endCurrentSession();
    redirect("/sign-in");
  },
);

// ---------------------------------------------------------------------------
// updateAccount
// ---------------------------------------------------------------------------

const updateAccountSchema = z.object({
  firstName: z.string().min(1, "Il nome è richiesto").max(100),
  lastName: z.string().min(1, "Il cognome è richiesto").max(100),
  email: z.string().email("Email non valida"),
});

export const updateAccount = validatedActionWithUser(
  updateAccountSchema,
  async (data, _, user) => {
    const { firstName, lastName, email } = data;

    await Promise.all([
      db
        .update(users)
        .set({ email, updatedAt: new Date() })
        .where(eq(users.id, user.id)),
      db
        .insert(userProfiles)
        .values({ userId: user.id, firstName, lastName })
        .onConflictDoUpdate({
          target: userProfiles.userId,
          set: { firstName, lastName, updatedAt: new Date() },
        }),
      logActivity(user.id, ActivityType.UPDATE_ACCOUNT),
    ]);

    return { firstName, success: "Account updated successfully." };
  },
);
