"use server";

import { recordCookieConsents } from "@/lib/account/consent-ledger";
import { getUser } from "@/lib/db/queries";
import { writeCookieConsent } from "@/lib/cookie-consent/cookie";
import type { CookieConsentPrefs } from "@/lib/cookie-consent/cookie";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

type Variant = "accept_all" | "reject_all" | "custom";

async function persist(prefs: CookieConsentPrefs, variant: Variant): Promise<void> {
  await writeCookieConsent(prefs);

  // Best-effort ledger: getUser può essere null per visitatori anonimi —
  // in quel caso registriamo comunque l'evento con userId=null. Eventuali
  // fallimenti del ledger non bloccano il flusso utente (vedi recordConsent).
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    null;
  const ua = headersList.get("user-agent") ?? null;

  let userId: string | null = null;
  try {
    const user = await getUser();
    userId = user?.id ?? null;
  } catch {
    // getUser non dovrebbe lanciare, ma siamo in un best-effort path:
    // se la sessione è in stato strano, l'utente conta come anonimo.
    userId = null;
  }

  await recordCookieConsents({
    userId,
    choice: {
      preferences: prefs.preferences,
      analytics: prefs.analytics,
      marketing: prefs.marketing,
    },
    ip,
    userAgent: ua,
    locale: null,
    variant,
  });

  // Invalida l'intero layout: il banner è gateato dal RootLayout sulla
  // base di getCookieConsentState, e Vercel Analytics viene montato/no
  // in funzione di prefs.analytics. Senza revalidate, l'utente vedrebbe
  // il banner sparire solo al refresh successivo.
  revalidatePath("/", "layout");
}

export async function acceptAllCookiesAction(): Promise<void> {
  await persist(
    {
      necessary: true,
      preferences: true,
      analytics: true,
      marketing: true,
    },
    "accept_all",
  );
}

export async function rejectAllCookiesAction(): Promise<void> {
  await persist(
    {
      necessary: true,
      preferences: false,
      analytics: false,
      marketing: false,
    },
    "reject_all",
  );
}

export async function saveCustomCookiesAction(formData: FormData): Promise<void> {
  await persist(
    {
      necessary: true,
      preferences: formData.get("preferences") === "on",
      analytics: formData.get("analytics") === "on",
      marketing: formData.get("marketing") === "on",
    },
    "custom",
  );
}
