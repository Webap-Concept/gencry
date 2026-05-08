// app/(onboarding)/onboarding/actions.ts
//
// Server actions per il wizard di onboarding.
// Tre step: username → interessi crypto → done.
//
// Ogni step persiste su DB; se l'utente abbandona e torna, il wizard
// riparte dallo step corretto (gestito in page.tsx).

"use server";

import { isUsernameBlacklisted } from "@/lib/auth/blacklist";
import { isUniqueConstraintError } from "@/lib/auth/race-condition";
import { validateUsernameFormat } from "@/lib/auth/username-validator";
import {
  addUsernameToBloom,
  checkUsernameAvailability,
} from "@/lib/bloom/bloom-filter";
import { db } from "@/lib/db/drizzle";
import { getUser } from "@/lib/db/queries";
import { userProfiles, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

export type OnboardingActionState =
  | { error?: string; success?: boolean };

// ---------------------------------------------------------------------------
// Step 1 — username
// ---------------------------------------------------------------------------

export async function setOnboardingUsername(
  username: string,
): Promise<OnboardingActionState> {
  const user = await getUser();
  if (!user) return { error: "Sessione scaduta. Effettua di nuovo il login." };

  const clean = username.trim().toLowerCase();

  if (clean.length < 3 || clean.length > 50) {
    return { error: "Username tra 3 e 50 caratteri." };
  }
  const formatCheck = validateUsernameFormat(clean);
  if (!formatCheck.ok) {
    return { error: formatCheck.error };
  }
  if (await isUsernameBlacklisted(clean)) {
    return { error: "Questo username non è disponibile. Scegline un altro." };
  }

  const availability = await checkUsernameAvailability(clean);
  if (!availability.available) {
    return { error: "Questo username è già in uso. Scegline un altro." };
  }

  try {
    await db
      .update(userProfiles)
      .set({ username: clean, updatedAt: new Date() })
      .where(eq(userProfiles.userId, user.id));
  } catch (err: unknown) {
    if (isUniqueConstraintError(err)) {
      return {
        error:
          "Questo username è appena stato scelto da un altro utente. Scegline un altro.",
      };
    }
    throw err;
  }

  try {
    await addUsernameToBloom(clean);
  } catch (e) {
    console.error("[onboarding] addUsernameToBloom failed:", e);
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// Step 2 — interessi crypto (mock — implementazione vera in seguito)
// ---------------------------------------------------------------------------

// Lista mock di asset accettati. La validazione server controlla che ogni id
// scelto sia presente in questa lista (nessuna fiducia nei dati client).
const ALLOWED_INTEREST_IDS = new Set([
  "btc", "eth", "sol", "ada", "xrp", "doge",
  "dot", "matic", "link", "avax", "atom", "near",
]);
const MIN_INTERESTS = 3;

export async function setOnboardingInterests(
  interests: string[],
): Promise<OnboardingActionState> {
  const user = await getUser();
  if (!user) return { error: "Sessione scaduta. Effettua di nuovo il login." };

  const clean = Array.from(
    new Set(interests.map((i) => i.trim().toLowerCase()).filter(Boolean)),
  );

  if (clean.length < MIN_INTERESTS) {
    return { error: `Scegli almeno ${MIN_INTERESTS} asset.` };
  }

  for (const id of clean) {
    if (!ALLOWED_INTEREST_IDS.has(id)) {
      return { error: "Selezione non valida." };
    }
  }

  await db
    .update(userProfiles)
    .set({ interests: clean, updatedAt: new Date() })
    .where(eq(userProfiles.userId, user.id));

  return { success: true };
}

// ---------------------------------------------------------------------------
// Step 3 — completa l'onboarding e redirect
// ---------------------------------------------------------------------------

export async function completeOnboarding(): Promise<void> {
  const user = await getUser();
  if (!user) redirect("/sign-in");

  // Sanity check: lo username deve esistere e ci devono essere almeno 3 interessi
  const [profile] = await db
    .select({
      username: userProfiles.username,
      interests: userProfiles.interests,
    })
    .from(userProfiles)
    .where(eq(userProfiles.userId, user.id))
    .limit(1);

  if (!profile?.username) redirect("/onboarding");
  if (!profile?.interests || profile.interests.length < MIN_INTERESTS) {
    redirect("/onboarding");
  }

  await db
    .update(users)
    .set({ onboardingCompletedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, user.id));

  // Onboarding è solo per nuovi utenti del frontend social. Un admin che
  // finisce qui è un edge-case (probabilmente importato da DB con flag
  // mancante); torna a "/", da lì può navigare manualmente all'admin.
  redirect("/");
}
