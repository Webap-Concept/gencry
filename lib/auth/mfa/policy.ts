import "server-only";

import { unstable_cache } from "next/cache";
import { getAppSettings } from "@/lib/db/settings-queries";
import type { MfaState } from "./queries";

/** Tag per `revalidateTag()` quando l'admin cambia la policy MFA da
 * /admin/security/mfa. Invalidare invalida la cache cross-request della
 * policy globale; senza revalidate la cache scade comunque ogni 60s. */
export const MFA_POLICY_TAG = "mfa-policy";

export type MfaMode = "optional" | "required-for-staff" | "required-for-all";

export interface MfaPolicy {
  /** Master switch: false = feature disabled globalmente. */
  enabled: boolean;
  /** Modalità di enforcement. */
  mode: MfaMode;
  /** Giorni di grace period per gli account esistenti quando mode è required-*. */
  gracePeriodDays: number;
  /**
   * Etichetta che le authenticator app mostrano. Già risolta: usa
   * `mfa.issuer_label` se settato, altrimenti `app_name`, altrimenti "MFA".
   */
  issuer: string;
  /**
   * Timestamp di quando il mode è diventato required-*. Null se la policy
   * è optional (o non è mai stata required). Usato per calcolare la
   * deadline del grace period.
   */
  requiredSince: Date | null;
}

/**
 * Caricamento della policy dai settings, con resolve dell'issuer.
 *
 * Cachata con `unstable_cache` (60s, tag MFA_POLICY_TAG) perché viene
 * letta dal `(protected)/layout.tsx` su OGNI navigazione di area loggata
 * — anche frontend (/profile, /notifiche, /esplora). Senza cache, ogni
 * pageload pagava 1 query DB per leggere appSettings. Cambia raramente
 * (solo quando l'admin tocca /admin/security/mfa), quindi 60s di stale
 * sono safe; il save admin chiama `revalidateTag(MFA_POLICY_TAG)` per
 * propagare immediatamente.
 */
const fetchPolicy = async (): Promise<MfaPolicy> => {
  const s = await getAppSettings();
  const enabled = s["mfa.enabled"] !== "false";
  const rawMode = s["mfa.mode"] ?? "optional";
  const mode: MfaMode =
    rawMode === "required-for-staff" || rawMode === "required-for-all"
      ? rawMode
      : "optional";
  const grace = Number(s["mfa.grace_period_days"] ?? 7);
  const issuer =
    (s["mfa.issuer_label"] ?? "").trim() || s.app_name?.trim() || "MFA";
  const requiredSince = s["mfa.required_since"]
    ? new Date(s["mfa.required_since"])
    : null;

  return {
    enabled,
    mode,
    gracePeriodDays: Number.isFinite(grace) ? grace : 7,
    issuer,
    requiredSince,
  };
};

const fetchPolicyCached = unstable_cache(fetchPolicy, ["mfa-policy"], {
  revalidate: 60,
  tags: [MFA_POLICY_TAG],
});

export async function getMfaPolicy(): Promise<MfaPolicy> {
  // unstable_cache JSON-serializza il return value, quindi `requiredSince`
  // (Date) torna come string ISO al cache hit. Ri-istanziamo Date qui per
  // mantenere il contratto di tipo verso i caller — `mfaDeadlineFor` chiama
  // `.getTime()` e prima di questo fix esplodeva con
  // "TypeError: requiredSince.getTime is not a function" appena un admin
  // attivava una mode required-* (= scriveva `mfa.required_since`).
  const cached = await fetchPolicyCached();
  return {
    ...cached,
    requiredSince: cached.requiredSince ? new Date(cached.requiredSince) : null,
  };
}

/**
 * Determina se MFA è obbligatorio per uno specifico utente in base al mode.
 * mode optional → mai required.
 * mode required-for-staff → solo isAdmin = true.
 * mode required-for-all → tutti.
 */
export function mfaIsRequiredFor(
  user: { isAdmin: boolean },
  policy: MfaPolicy,
): boolean {
  if (!policy.enabled) return false;
  if (policy.mode === "optional") return false;
  if (policy.mode === "required-for-staff") return user.isAdmin === true;
  return true; // required-for-all
}

/**
 * Calcola la deadline assoluta entro la quale l'utente deve attivare MFA.
 * Ritorna null se MFA non è required per quell'utente.
 *
 * Regola: deadline = requiredSince + gracePeriodDays. Stessa per tutti gli
 * utenti — utenti registrati prima del cambio mode hanno il grace pieno;
 * utenti registrati dopo ricevono lo stesso grace (semplificazione v1; se
 * serve "no grace per i nuovi signups" si raffina dopo).
 */
export function mfaDeadlineFor(
  user: { isAdmin: boolean },
  policy: MfaPolicy,
): Date | null {
  if (!mfaIsRequiredFor(user, policy)) return null;
  if (!policy.requiredSince) return null;
  return new Date(
    policy.requiredSince.getTime() + policy.gracePeriodDays * 86_400_000,
  );
}

export type MfaEnforcement =
  | { kind: "ok" } // utente ok (enrolled, oppure non target, oppure deadline futura ma non ancora visibile)
  | { kind: "warning"; deadline: Date; daysRemaining: number }
  | { kind: "blocking"; deadline: Date };

/**
 * Risolve lo stato di enforcement per un utente.
 *
 * - Se MFA è già enrolled (anche pending setup non conta come enrolled) → ok.
 * - Se mode required ma deadline futura → warning con countdown.
 * - Se mode required e deadline passata → blocking (il guard del layout
 *   protetto deve forzare il redirect a /settings/security).
 */
export function mfaEnforcement(
  user: { isAdmin: boolean },
  policy: MfaPolicy,
  state: MfaState,
): MfaEnforcement {
  if (state.enabled) return { kind: "ok" };

  const deadline = mfaDeadlineFor(user, policy);
  if (!deadline) return { kind: "ok" };

  const now = Date.now();
  if (now >= deadline.getTime()) {
    return { kind: "blocking", deadline };
  }
  const daysRemaining = Math.max(
    0,
    Math.ceil((deadline.getTime() - now) / 86_400_000),
  );
  return { kind: "warning", deadline, daysRemaining };
}
