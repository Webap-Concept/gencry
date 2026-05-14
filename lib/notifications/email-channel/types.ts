// lib/notifications/email-channel/types.ts
//
// Tipi per il dispatcher email generico delle notifiche admin. Ogni
// notification type (cron_job_failure, session_suspicious, future:
// security/payments/ecc.) implementa un Renderer che mappa N
// AdminNotification → { subject, html, text }.
//
// Pattern factory + registry: vedi `./registry.ts`.
import type { AdminNotification } from "@/lib/db/schema";
import type { AlertSeverity } from "@/lib/sessions/suspicious/config-types";

/**
 * Identifica la "source" di config alerts a cui questo renderer si lega
 * (1:1 con `AlertsConfig.sources.<key>`). Il dispatcher legge enabled/
 * schedule/severityThreshold dalla source corrispondente.
 */
export type AlertsSourceKey = "sessions" | "cron";

export type RendererItem = AdminNotification;

export type RenderResult = {
  subject: string;
  html: string;
  /** Plain-text fallback per i mail client che non renderizzano HTML. */
  text?: string;
};

export interface NotificationRenderer {
  /** Source di config a cui questo renderer è legato. */
  source: AlertsSourceKey;
  /** Lista di `admin_notifications.type` che questo renderer accetta. */
  matchTypes: readonly string[];
  /**
   * Compone subject + body. Riceve le notifications già filtrate per
   * type + severity threshold. Per `instant` schedule ne riceve 1; per
   * digest schedule ne riceve N raggruppate.
   */
  render(items: RendererItem[]): Promise<RenderResult>;
}

export type SeverityLevel = AlertSeverity;
