// lib/home/gates.ts
//
// Helper per i gate `isEnabled` delle HomeSection del registry.
//
// Tutti i gate vengono chiamati a ogni `resolveSlot()` (= ogni page
// load). PER ESSERE EFFICIENTI devono leggere da una sorgente cached
// per request:
//
// - `getAppSettings()` — già `React.cache()`-ata in
//   lib/db/settings-queries.ts. 1 sola query DB per request anche se
//   chiamata N volte.
// - `getUser()` — idem, cached per request.
//
// Helper qui sotto pre-cablano il pattern boolean-flag che è il caso
// più comune. Per gate più complessi (ruolo utente, A/B test, ecc.),
// implementare a mano usando le stesse fonti cached.
//
// Vedi project_home_slot_registry.md per il razionale.

import "server-only";

import {
  getAppSettings,
  type SettingKey,
} from "@/lib/db/settings-queries";

/**
 * Gate factory: ritorna un `isEnabled` che legge una setting boolean
 * (`'true' | 'false'` come stringa, convenzione del DB) e restituisce
 * `true` se uguale a `'true'`. Tutto via `getAppSettings()` cached.
 *
 * Esempio:
 *   { key: "modules.posts.timeline", ..., isEnabled: isEnabledByFlag("modules.posts.enabled") }
 *
 * Se la setting è `null` o assente, il default è `false` (sezione nascosta).
 */
export function isEnabledByFlag(
  settingKey: SettingKey,
): () => Promise<boolean> {
  return async () => {
    const settings = (await getAppSettings()) as Record<string, string | null>;
    return settings[settingKey] === "true";
  };
}

/**
 * Negazione di `isEnabledByFlag`. Utile per sezioni "mostra-quando-OFF"
 * (es. un placeholder onboarding che appare solo finché un modulo non
 * è ancora attivato dall'admin).
 *
 * Esempio:
 *   { key: "core.onboarding.cta", ..., isEnabled: isDisabledByFlag("modules.posts.enabled") }
 */
export function isDisabledByFlag(
  settingKey: SettingKey,
): () => Promise<boolean> {
  return async () => {
    const settings = (await getAppSettings()) as Record<string, string | null>;
    return settings[settingKey] !== "true";
  };
}
