// Helpers di rendering i18n per admin_notifications.
//
// Astratto dal hook `useTranslations` di next-intl: accetta una `t`
// strutturalmente compatibile (callable + `.has`) così è usabile sia
// lato client (`useTranslations()`) sia in futuro lato server
// (`getTranslations()`).
//
// Fallback robusto a 3 livelli:
//   1. type non nel registry        → `n.title` raw
//   2. titleKey/bodyKey missing nel locale → `n.title` raw
//   3. valuesFrom non definito      → `t(key)` senza values

import {
  NOTIFICATION_REGISTRY,
  type NotificationMetadata,
  type NotificationRegistryEntry,
} from "./registry";

export type TranslateFn = {
  (key: string, values?: Record<string, string | number | Date>): string;
  has(key: string): boolean;
};

/** True se uno dei `requiredFields` è missing → l'i18n key produrrebbe
 *  un risultato monco, meglio fallback al testo raw. */
function metadataIncomplete(
  entry: NotificationRegistryEntry,
  metadata: NotificationMetadata,
): boolean {
  if (!entry.requiredFields) return false;
  for (const f of entry.requiredFields) {
    const v = metadata[f];
    if (v == null || v === "") return true;
  }
  return false;
}

export function renderNotificationTitle(
  type: string,
  metadata: NotificationMetadata | null | undefined,
  fallbackTitle: string,
  t: TranslateFn,
): string {
  const entry = NOTIFICATION_REGISTRY[type];
  if (!entry || !t.has(entry.titleKey)) return fallbackTitle;
  const md = metadata ?? {};
  if (metadataIncomplete(entry, md)) return fallbackTitle;
  const values = entry.valuesFrom?.(md) ?? {};
  return t(entry.titleKey, values);
}

export function renderNotificationBody(
  type: string,
  metadata: NotificationMetadata | null | undefined,
  fallbackBody: string | null,
  t: TranslateFn,
): string | null {
  const entry = NOTIFICATION_REGISTRY[type];
  if (!entry?.bodyKey || !t.has(entry.bodyKey)) return fallbackBody;
  const md = metadata ?? {};
  if (metadataIncomplete(entry, md)) return fallbackBody;
  const values = entry.valuesFrom?.(md) ?? {};
  return t(entry.bodyKey, values);
}
