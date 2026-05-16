"use client";
// lib/modules/onboarding/lib/use-onboarding-error.ts
//
// Hook che traduce le chiavi i18n ritornate dalle onboarding server actions.
//
// Le action di onboarding ritornano `{ error: "onboarding.errors.foo", ... }`
// dove `error` è una chiave del namespace "onboarding" (vedi
// `lib/modules/onboarding/messages/{en,it}/onboarding.json`). I client
// non possono mostrare la chiave grezza all'utente — questo hook fa il
// lookup via next-intl + supporta i placeholder ICU (`{min}`, `{max}`,
// `{list}`).
//
// Fallback: se la chiave non è in onboarding.json (es. dimenticata dopo
// un rename), ritorna la chiave grezza così la UX non si rompe e il dev
// vede subito il missing message in chiaro.
import { useTranslations } from "next-intl";

type ErrorMeta = Record<string, string | number>;

/**
 * Hook che ritorna un translator pronto da invocare con la chiave.
 *
 * @example
 *   const tErr = useOnboardingError();
 *   const res = await setOnboardingUsername(username);
 *   if (res.error) setSubmitError(tErr(res.error));
 */
export function useOnboardingError(): (
  key: string | null | undefined,
  meta?: ErrorMeta,
) => string {
  const t = useTranslations("onboarding");
  return (key, meta) => {
    if (!key) return "";
    // Le chiavi server-side includono il prefix "onboarding." (es.
    // "onboarding.errors.session_expired") per leggibilità nei file
    // action. useTranslations("onboarding") risolve relativo al namespace
    // → strip del prefix se presente.
    const relative = key.startsWith("onboarding.")
      ? key.slice("onboarding.".length)
      : key;
    try {
      return t(relative, meta);
    } catch {
      // Missing message: ritorna la chiave grezza così il dev la vede
      // subito senza far crashare la UI.
      return key;
    }
  };
}
