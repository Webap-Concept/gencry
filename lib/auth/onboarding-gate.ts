// lib/auth/onboarding-gate.ts
//
// Single source of truth: l'utente deve passare per il wizard /onboarding
// prima di entrare nell'app? Centralizzato qui per evitare divergenze fra i
// punti di redirect (signin form, verify-email, verify-device, mfa, oauth).
//
// Regole:
//   - admin / staff non passano mai dal wizard utente
//   - se l'admin ha disabilitato la setting `onboarding_enabled`, salta tutti
//   - altrimenti: required finché `onboardingCompletedAt` non è valorizzato
//
// `bypassOnboardingIfNeeded` chiude il flusso quando il wizard è skippato:
// genera lo username automatico per gli OAuth signup (form signup raccoglie
// già lo username) e marca onboardingCompletedAt, così il profilo è
// "completo" anche senza interazione utente.

import { addUsernameToBloom } from "@/lib/bloom/bloom-filter";
import { generateUniqueUsernameFromEmail } from "@/lib/auth/username-generator";
import { db } from "@/lib/db/drizzle";
import { userProfiles, users } from "@/lib/db/schema";
import { getAppSettings } from "@/lib/db/settings-queries";
import { eq, isNull, and } from "drizzle-orm";

export async function isOnboardingRequired(user: {
  role: string;
  onboardingCompletedAt: Date | null;
}): Promise<boolean> {
  if (user.role === "admin") return false;
  if (user.onboardingCompletedAt) return false;
  const settings = await getAppSettings();
  return settings.onboarding_enabled !== "false";
}

export async function bypassOnboardingIfNeeded(user: {
  id: string;
  email: string;
  onboardingCompletedAt: Date | null;
}): Promise<void> {
  if (user.onboardingCompletedAt) return;

  // Username: se l'utente è arrivato qui via form signup ce l'ha già; gli
  // OAuth signup invece lo lasciano null in attesa del wizard. Generiamone
  // uno valido (regex + non-blacklist + unique) dal local-part dell'email.
  // L'utente potrà cambiarlo da /settings/profile.
  const [profile] = await db
    .select({ username: userProfiles.username })
    .from(userProfiles)
    .where(eq(userProfiles.userId, user.id))
    .limit(1);

  if (profile && !profile.username) {
    const username = await generateUniqueUsernameFromEmail(user.email);
    // Set solo se lo slot è ancora null per evitare race con il wizard.
    await db
      .update(userProfiles)
      .set({ username, updatedAt: new Date() })
      .where(
        and(
          eq(userProfiles.userId, user.id),
          isNull(userProfiles.username),
        ),
      );
    try {
      await addUsernameToBloom(username);
    } catch {
      // Non critico
    }
  }

  await db
    .update(users)
    .set({ onboardingCompletedAt: new Date() })
    .where(and(eq(users.id, user.id), isNull(users.onboardingCompletedAt)));
}
