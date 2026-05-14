// lib/notifications/email-channel/renderers/session-suspicious.ts
//
// Renderer per le notifiche di tipo `session_suspicious`. Adapter:
// ricostruisce DigestAlert[] dal `metadata.snapshot` salvato nelle
// admin_notifications dal sessions runner, poi delega al template
// esistente `renderSuspiciousAlertsDigest` (riuso totale del rendering
// già rodato, niente duplicazione).
import "server-only";

import type { DigestAlert } from "@/lib/email/templates/admin-suspicious-alerts";
import { renderSuspiciousAlertsDigest } from "@/lib/email/templates/admin-suspicious-alerts";
import { getAlertsConfig } from "@/lib/sessions/suspicious/config";
import type {
  NotificationRenderer,
  RenderResult,
  RendererItem,
} from "../types";

function rehydrateDigestAlert(meta: unknown): DigestAlert | null {
  if (meta === null || typeof meta !== "object") return null;
  const snapshot = (meta as Record<string, unknown>).snapshot;
  if (snapshot === null || typeof snapshot !== "object") return null;
  const s = snapshot as Record<string, unknown>;
  // Validation light: i campi essenziali. Se mancano la notifica viene
  // semplicemente scartata (logged) invece di crashare l'intero digest.
  if (
    typeof s.id !== "number" ||
    typeof s.reason !== "string" ||
    typeof s.severity !== "string" ||
    typeof s.createdAt !== "string"
  ) {
    return null;
  }
  return {
    id: s.id,
    reason: s.reason,
    severity: s.severity,
    createdAt: new Date(s.createdAt),
    userId: typeof s.userId === "string" ? s.userId : null,
    sessionId: typeof s.sessionId === "string" ? s.sessionId : null,
    details: (s.details ?? {}) as Record<string, unknown>,
  };
}

export const sessionSuspiciousRenderer: NotificationRenderer = {
  source: "sessions",
  matchTypes: ["session_suspicious"],
  async render(items: RendererItem[]): Promise<RenderResult> {
    const alerts: DigestAlert[] = [];
    for (const n of items) {
      const a = rehydrateDigestAlert(n.metadata);
      if (a) alerts.push(a);
    }
    if (alerts.length === 0) {
      // Edge case: tutte le admin_notifications session_suspicious
      // hanno metadata malformato. Restituisci un subject minimale
      // così il dispatcher non crasha; il send sarà evitato dal
      // chiamante (length check).
      return {
        subject: "Suspicious session alerts",
        html: "<p>No valid alerts in batch.</p>",
      };
    }
    const cfg = await getAlertsConfig();
    return renderSuspiciousAlertsDigest({
      alerts,
      schedule: cfg.sources.sessions.schedule,
    });
  },
};
