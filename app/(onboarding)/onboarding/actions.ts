// app/(onboarding)/onboarding/actions.ts
//
// Server actions per il wizard di onboarding.
// Step:
//   - username   (solo se manca, OAuth flow)
//   - coin picks (3..20)
//   - risk profile + experience
//   - complete   (UPDATE users.onboarding_completed_at + redirect)

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
import {
  COIN_PICKS_MAX,
  COIN_PICKS_MIN,
  existingCoinSymbols,
  getUserCoinPicks,
  getUserRiskProfile,
  replaceUserCoinPicks,
  searchCoins,
  upsertUserRiskProfile,
  type CoinOption,
} from "@/lib/modules/onboarding/queries";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

export type OnboardingActionState =
  | { error?: string; success?: boolean };

const RISK_PROFILES   = new Set(["cauto", "moderato", "aggressivo", "degen"]);
const EXPERIENCE_KEYS = new Set(["newbie", "1to3y", "over3y"]);

// ---------------------------------------------------------------------------
// Step username (solo OAuth)
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
// Step coin picks (3..20)
// ---------------------------------------------------------------------------

export async function setOnboardingCoinPicks(
  symbols: string[],
): Promise<OnboardingActionState> {
  const user = await getUser();
  if (!user) return { error: "Sessione scaduta. Effettua di nuovo il login." };

  // Dedup + uppercase
  const clean = Array.from(
    new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)),
  );

  if (clean.length < COIN_PICKS_MIN) {
    return { error: `Scegli almeno ${COIN_PICKS_MIN} coin.` };
  }
  if (clean.length > COIN_PICKS_MAX) {
    return { error: `Massimo ${COIN_PICKS_MAX} coin.` };
  }

  // Validazione server-side: ogni simbolo deve esistere ed essere attivo.
  // Non ci si fida del client (potrebbe inviare simboli arbitrari).
  const existing = await existingCoinSymbols(clean);
  const unknown = clean.filter((s) => !existing.has(s));
  if (unknown.length > 0) {
    return { error: `Coin non disponibili: ${unknown.slice(0, 5).join(", ")}.` };
  }

  await replaceUserCoinPicks(user.id, clean);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Step risk profile + experience
// ---------------------------------------------------------------------------

export async function setOnboardingRiskProfile(
  profile: string,
  experience: string,
): Promise<OnboardingActionState> {
  const user = await getUser();
  if (!user) return { error: "Sessione scaduta. Effettua di nuovo il login." };

  if (!RISK_PROFILES.has(profile)) {
    return { error: "Profilo di rischio non valido." };
  }
  if (!EXPERIENCE_KEYS.has(experience)) {
    return { error: "Livello di esperienza non valido." };
  }

  await upsertUserRiskProfile(user.id, profile, experience);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Search coin server-side (per il picker dello step coin)
// ---------------------------------------------------------------------------

export async function searchCoinsAction(query: string): Promise<CoinOption[]> {
  const user = await getUser();
  if (!user) return [];
  return searchCoins(query);
}

// ---------------------------------------------------------------------------
// Complete: verifica integrità + UPDATE flag + redirect
// ---------------------------------------------------------------------------

export async function completeOnboarding(): Promise<void> {
  const user = await getUser();
  if (!user) redirect("/sign-in");

  // Sanity check: il wizard non termina senza tutti gli step completati
  const [profile] = await db
    .select({ username: userProfiles.username })
    .from(userProfiles)
    .where(eq(userProfiles.userId, user.id))
    .limit(1);

  if (!profile?.username) redirect("/onboarding");

  const picks = await getUserCoinPicks(user.id);
  if (picks.length < COIN_PICKS_MIN) redirect("/onboarding");

  const risk = await getUserRiskProfile(user.id);
  if (!risk) redirect("/onboarding");

  await db
    .update(users)
    .set({ onboardingCompletedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, user.id));

  // Onboarding è solo per nuovi utenti del frontend social. Un admin che
  // finisce qui è un edge-case (probabilmente importato da DB con flag
  // mancante); torna a "/", da lì può navigare manualmente all'admin.
  redirect("/");
}
