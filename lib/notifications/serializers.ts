// Trasforma AdminNotification (con Date) in ClientNotification (con string ISO)
// per essere passato in sicurezza dal Server Component al Client.

import type { AdminNotification } from "@/lib/db/schema";

export type ClientNotification = {
  id: string;
  type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  body: string | null;
  link: string | null;
  /**
   * JSONB con i template values per il rendering i18n (via
   * `lib/notifications/registry.ts`). Sempre presente (oggetto vuoto se
   * il generator non ha emesso metadata).
   */
  metadata: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
  snoozedUntil: string | null;
  dismissedAt: string | null;
  resolvedAt: string | null;
};

export function serializeNotification(n: AdminNotification): ClientNotification {
  return {
    id: n.id,
    type: n.type,
    // Severity nel DB e' un varchar libero; lo cast al tipo unione del client.
    // Valori non previsti cadranno su "info" lato render.
    severity: (n.severity as ClientNotification["severity"]) ?? "info",
    title: n.title,
    body: n.body,
    link: n.link,
    metadata:
      n.metadata && typeof n.metadata === "object"
        ? (n.metadata as Record<string, unknown>)
        : {},
    createdAt: n.createdAt.toISOString(),
    readAt: n.readAt?.toISOString() ?? null,
    snoozedUntil: n.snoozedUntil?.toISOString() ?? null,
    dismissedAt: n.dismissedAt?.toISOString() ?? null,
    resolvedAt: n.resolvedAt?.toISOString() ?? null,
  };
}
