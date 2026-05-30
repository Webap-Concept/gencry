// lib/auth/oauth/index.ts
//
// findOrCreateOAuthUser — upsert utente + profilo + oauth_account.
// Usato dal callback di ogni provider OAuth (al momento solo Google).
//
// Logica:
//   A) L'account OAuth esiste già           → aggiorna tokens, ritorna user
//   B) Esiste un user con la stessa email   → collega l'account OAuth, ritorna user
//   C) Nessun match                         → crea user + profile + oauth_account
//
// Side effects al primo signup OAuth (caso C):
//   - registra acceptedTermsAt/Version, acceptedPrivacyAt/Version (consenso
//     implicito tramite la consent screen di Google, che mostra i nostri T&S)
//   - aggiunge l'email al Bloom filter `bloom:emails`
//   - logga ActivityType.SIGN_UP (il caller logga SIGN_IN per i casi A/B)

import { recordSignupConsents } from "@/lib/account/consent-ledger";
import { addEmailToBloom } from "@/lib/bloom/bloom-filter";
import { db } from "@/lib/db/drizzle";
import { getConsentVersions } from "@/lib/db/pages-queries";
import {
  activityLogs,
  ActivityType,
  oauthAccounts,
  userProfiles,
  users,
  type NewActivityLog,
} from "@/lib/db/schema";
import { uploadAvatarFromUrlToR2 } from "@/lib/storage/r2-avatars";
import { and, eq } from "drizzle-orm";
import type { GoogleTokens } from "./google";

export interface OAuthProfile {
  provider:          string;
  providerAccountId: string;
  email:             string;
  emailVerified:     boolean;
  firstName:         string | null;
  lastName:          string | null;
  picture:           string | null;
  tokens:            GoogleTokens;
  ipAddress?:        string;
  userAgent?:        string;
}

export type FindOrCreateResult =
  | { status: "ok"; user: typeof users.$inferSelect; created: boolean }
  | { status: "blocked"; reason: "registrations_disabled" | "email_unverified" }
  | { status: "error" };

export async function findOrCreateOAuthUser(
  profile: OAuthProfile,
  opts: { canCreate: boolean } = { canCreate: true },
): Promise<FindOrCreateResult> {
  const {
    provider,
    providerAccountId,
    email,
    emailVerified,
    firstName,
    lastName,
    picture,
    tokens,
    ipAddress,
    userAgent,
  } = profile;

  // ------------------------------------------------------------------
  // A) Account OAuth già presente → aggiorna tokens e ritorna l'utente
  // ------------------------------------------------------------------
  const [existingOAuth] = await db
    .select({ userId: oauthAccounts.userId })
    .from(oauthAccounts)
    .where(
      and(
        eq(oauthAccounts.provider, provider),
        eq(oauthAccounts.providerAccountId, providerAccountId),
      ),
    )
    .limit(1);

  if (existingOAuth) {
    await db
      .update(oauthAccounts)
      .set({
        accessToken:  tokens.access_token,
        refreshToken: tokens.refresh_token ?? undefined,
        expiresAt:    tokens.expires_at ?? undefined,
        updatedAt:    new Date(),
      })
      .where(
        and(
          eq(oauthAccounts.provider, provider),
          eq(oauthAccounts.providerAccountId, providerAccountId),
        ),
      );

    // Avatar = snapshot al PRIMO login (fix A): importiamo da OAuth solo
    // se l'utente non ne ha ancora uno. Re-login successivi NON ri-scaricano
    // ne' sovrascrivono — l'utente cambia avatar a mano in /settings/profile.
    // Cosi' evitiamo il fetch+PUT R2 inutile a ogni login + comportamento
    // prevedibile (niente re-sync impredicibile col cache-bust).
    if (picture) {
      const [prof] = await db
        .select({ avatarUrl: userProfiles.avatarUrl })
        .from(userProfiles)
        .where(eq(userProfiles.userId, existingOAuth.userId))
        .limit(1);
      if (prof && prof.avatarUrl == null) {
        const avatarUrl =
          (await uploadAvatarFromUrlToR2(existingOAuth.userId, picture)) ?? picture;
        await db
          .update(userProfiles)
          .set({ avatarUrl, updatedAt: new Date() })
          .where(eq(userProfiles.userId, existingOAuth.userId));
      }
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, existingOAuth.userId))
      .limit(1);

    return user ? { status: "ok", user, created: false } : { status: "error" };
  }

  // ------------------------------------------------------------------
  // B) Utente con stessa email esiste → collega il nuovo account OAuth
  // ------------------------------------------------------------------
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser) {
    // Hardening account-takeover: collega il provider a un account
    // pre-esistente SOLO se il provider garantisce l'email come verificata.
    // Senza questo gate, chi controllasse un account provider con un'email
    // (non verificata) uguale a quella di un nostro utente registrato via
    // password potrebbe loggarsi come lui. L'utente legittimo deve invece
    // accedere col metodo originale e collegare il provider dalle impostazioni.
    // (Con Google `email_verified` è di fatto sempre true; il gate conta il
    // giorno che si aggiunge un secondo provider — Apple, Facebook, ecc.)
    if (!emailVerified) {
      return { status: "blocked", reason: "email_unverified" };
    }

    await db.insert(oauthAccounts).values({
      userId:            existingUser.id,
      provider,
      providerAccountId,
      accessToken:       tokens.access_token,
      refreshToken:      tokens.refresh_token,
      expiresAt:         tokens.expires_at,
      scope:             tokens.scope,
    });

    // Snapshot al primo collegamento (fix A): importa solo se l'utente
    // (esistente, registrato via email) non ha gia' un avatar suo.
    if (picture) {
      const [prof] = await db
        .select({ avatarUrl: userProfiles.avatarUrl })
        .from(userProfiles)
        .where(eq(userProfiles.userId, existingUser.id))
        .limit(1);
      if (prof && prof.avatarUrl == null) {
        const avatarUrl =
          (await uploadAvatarFromUrlToR2(existingUser.id, picture)) ?? picture;
        await db
          .update(userProfiles)
          .set({ avatarUrl, updatedAt: new Date() })
          .where(eq(userProfiles.userId, existingUser.id));
      }
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, existingUser.id))
      .limit(1);

    return user ? { status: "ok", user, created: false } : { status: "error" };
  }

  // ------------------------------------------------------------------
  // Caso C: serve creare un nuovo account
  // Verifica se le registrazioni sono abilitate prima di procedere
  // ------------------------------------------------------------------
  if (!opts.canCreate) {
    return { status: "blocked", reason: "registrations_disabled" };
  }

  // ------------------------------------------------------------------
  // C) Nessun match → crea user + profile + oauth_account
  //    Consenso T&S/Privacy implicito (Google ha già mostrato i nostri link
  //    nella consent screen). Il marketing rimane null: opt-in esplicito
  //    richiesto, l'utente può attivarlo in seguito dalla pagina profilo.
  // ------------------------------------------------------------------
  const { termsVersion, privacyVersion } = await getConsentVersions();
  const now = new Date();

  const [newUser] = await db
    .insert(users)
    .values({
      email,
      passwordHash:           null,
      role:                   "member",
      isAdmin:                false,
      emailVerified,
      acceptedTermsAt:        now,
      acceptedTermsVersion:   termsVersion,
      acceptedPrivacyAt:      now,
      acceptedPrivacyVersion: privacyVersion,
    })
    .returning();

  if (!newUser) throw new Error("[oauth] Failed to create user");

  const avatarUrl = picture
    ? ((await uploadAvatarFromUrlToR2(newUser.id, picture)) ?? picture)
    : null;

  await db.insert(userProfiles).values({
    userId:    newUser.id,
    firstName: firstName ?? null,
    lastName:  lastName  ?? null,
    avatarUrl,
    // username: null — l'utente lo sceglierà nel wizard di onboarding
  });

  await db.insert(oauthAccounts).values({
    userId:            newUser.id,
    provider,
    providerAccountId,
    accessToken:       tokens.access_token,
    refreshToken:      tokens.refresh_token,
    expiresAt:         tokens.expires_at,
    scope:             tokens.scope,
  });

  // Tieni il bloom filter delle email allineato al nuovo signup
  try {
    await addEmailToBloom(newUser.email);
  } catch (err) {
    console.error("[oauth] addEmailToBloom failed (non critico):", err);
  }

  // Log SIGN_UP per i nuovi account OAuth
  const log: NewActivityLog = {
    userId:    newUser.id,
    action:    ActivityType.SIGN_UP,
    ipAddress: ipAddress ?? "",
  };
  await db.insert(activityLogs).values(log);

  // Append-only consent ledger: terms + privacy (impliciti via consent screen
  // del provider OAuth). Marketing resta non loggato — l'utente lo attiverà
  // esplicitamente da /settings/privacy in seguito.
  await recordSignupConsents({
    userId: newUser.id,
    acceptMarketing: false,
    ip: ipAddress ?? null,
    userAgent: userAgent ?? null,
    locale: null,
    source: "oauth_signup",
  });

  return { status: "ok", user: newUser, created: true };
}
