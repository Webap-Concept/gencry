import "server-only";

import { cookies } from "next/headers";

/**
 * Stato di consenso cookie persistito sul client.
 *
 * Il payload è volutamente compatto (chiavi a 1 char) perché vive in un
 * cookie HttpOnly e ne riduciamo la dimensione per ogni request. Il campo
 * `v` è la versione dello schema: se in futuro cambiamo la forma, possiamo
 * invalidare i cookie precedenti senza ambiguità.
 *
 * Le 4 categorie sono allineate ai consent_type di consent_records:
 *   - n  → cookie_necessary  (sempre true; tecnicamente non opt-in ma loggato per audit)
 *   - p  → cookie_preferences
 *   - a  → cookie_analytics
 *   - m  → cookie_marketing
 */
export type CookieConsentPayload = {
  v: 1;
  n: 1;
  p: 0 | 1;
  a: 0 | 1;
  m: 0 | 1;
  ts: string;
};

export type CookieConsentPrefs = {
  necessary: true;
  preferences: boolean;
  analytics: boolean;
  marketing: boolean;
};

export const COOKIE_NAME = "gc_cc";

/**
 * 6 mesi: ICO/CNIL raccomandano fra 6 e 13 mesi prima di richiedere
 * nuovamente il consenso. 6 è il limite inferiore prudente.
 */
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

/** Stato derivato letto/composto dal layout. */
export type CookieConsentState =
  | { hasDecision: false; prefs: CookieConsentPrefs }
  | { hasDecision: true; prefs: CookieConsentPrefs; decidedAt: string };

/** Default conservativo: tutto OFF tranne i tecnici. */
export const DEFAULT_PREFS: CookieConsentPrefs = {
  necessary: true,
  preferences: false,
  analytics: false,
  marketing: false,
};

export function parseCookieConsent(raw: string | undefined): CookieConsentPayload | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { v?: unknown }).v !== 1
  ) {
    return null;
  }
  const p = parsed as Record<string, unknown>;
  const isFlag = (x: unknown): x is 0 | 1 => x === 0 || x === 1;
  if (
    !isFlag(p.n) ||
    !isFlag(p.p) ||
    !isFlag(p.a) ||
    !isFlag(p.m) ||
    typeof p.ts !== "string"
  ) {
    return null;
  }
  return { v: 1, n: 1, p: p.p, a: p.a, m: p.m, ts: p.ts };
}

export function payloadToPrefs(payload: CookieConsentPayload): CookieConsentPrefs {
  return {
    necessary: true,
    preferences: payload.p === 1,
    analytics: payload.a === 1,
    marketing: payload.m === 1,
  };
}

export function prefsToPayload(prefs: CookieConsentPrefs, now: Date = new Date()): CookieConsentPayload {
  return {
    v: 1,
    n: 1,
    p: prefs.preferences ? 1 : 0,
    a: prefs.analytics ? 1 : 0,
    m: prefs.marketing ? 1 : 0,
    ts: now.toISOString(),
  };
}

/**
 * Legge il cookie HttpOnly e ritorna lo stato corrente.
 * - Cookie assente o malformato → hasDecision=false con DEFAULT_PREFS.
 * - Cookie valido → hasDecision=true con prefs decodificate.
 */
export async function readCookieConsent(): Promise<CookieConsentState> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  const payload = parseCookieConsent(raw);
  if (!payload) {
    return { hasDecision: false, prefs: { ...DEFAULT_PREFS } };
  }
  return {
    hasDecision: true,
    prefs: payloadToPrefs(payload),
    decidedAt: payload.ts,
  };
}

/**
 * Scrive il cookie HttpOnly. Da chiamare solo dentro Server Actions o
 * Route Handlers (cookies().set richiede contesto mutabile).
 */
export async function writeCookieConsent(prefs: CookieConsentPrefs): Promise<void> {
  const store = await cookies();
  const payload = prefsToPayload(prefs);
  store.set({
    name: COOKIE_NAME,
    value: JSON.stringify(payload),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}
