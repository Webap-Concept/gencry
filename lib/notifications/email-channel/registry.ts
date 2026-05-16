// lib/notifications/email-channel/registry.ts
//
// Registry dei renderer per il dispatcher email. Aggiungere un nuovo
// notification type = importare il renderer + spreddarlo qui. Il
// dispatcher itera questo registry per matchare admin_notifications →
// renderer corretto.
import "server-only";

import { cronFailuresRenderer } from "./renderers/cron-failures";
import { sessionSuspiciousRenderer } from "./renderers/session-suspicious";
import type { AlertsSourceKey, NotificationRenderer } from "./types";

export const RENDERERS: readonly NotificationRenderer[] = [
  cronFailuresRenderer,
  sessionSuspiciousRenderer,
] as const;

/** Lista dei sources che hanno almeno un renderer registrato. */
export function getRegisteredSources(): AlertsSourceKey[] {
  return Array.from(new Set(RENDERERS.map((r) => r.source)));
}

/** Tutti i `admin_notifications.type` matchati da un dato source. */
export function getTypesForSource(source: AlertsSourceKey): string[] {
  return RENDERERS.filter((r) => r.source === source).flatMap((r) => [
    ...r.matchTypes,
  ]);
}

/** Trova il renderer che gestisce un dato `admin_notifications.type`. */
export function findRendererForType(
  type: string,
): NotificationRenderer | null {
  for (const r of RENDERERS) {
    if (r.matchTypes.includes(type)) return r;
  }
  return null;
}
