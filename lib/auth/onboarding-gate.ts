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

import { getAppSettings } from "@/lib/db/settings-queries";

export async function isOnboardingRequired(user: {
  role: string;
  onboardingCompletedAt: Date | null;
}): Promise<boolean> {
  if (user.role === "admin") return false;
  if (user.onboardingCompletedAt) return false;
  const settings = await getAppSettings();
  return settings.onboarding_enabled !== "false";
}
