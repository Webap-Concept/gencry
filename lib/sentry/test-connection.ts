/**
 * Test connessione Sentry.
 *
 * Due step indipendenti:
 *   1. Validazione formato DSN + invio evento di test all'envelope
 *      endpoint Sentry. Se Sentry restituisce 200/202 con header
 *      `X-Sentry-ID`, il DSN è valido e il progetto risponde.
 *   2. (Opzionale, solo se l'admin ha incollato `auth_token` + org +
 *      project) chiamata GET all'API REST per validare anche il token —
 *      conferma che il token può essere usato per upload source maps al
 *      build.
 *
 * Mai mandare l'evento via SDK (`Sentry.captureMessage`) per il test:
 * non sappiamo se Sentry è già stato init in questo processo, e
 * vogliamo isolare il check dal singleton globale. Andiamo direttamente
 * via fetch all'endpoint envelope Sentry.
 */
import "server-only";

import { isValidDsn } from "./config";

export type SentryTestResult =
  | { ok: true; eventId: string; tokenValid?: boolean }
  | {
      ok: false;
      reason:
        | "invalid_dsn_format"
        | "dsn_required"
        | "dsn_unreachable"
        | "dsn_unauthorized"
        | "dsn_unknown_status"
        | "token_invalid"
        | "token_forbidden"
        | "network_error";
      detail?: string;
    };

/**
 * Estrae host, project_id, public key da un DSN Sentry.
 * Format: https://<publicKey>@<host>/<projectId>
 */
function parseDsn(dsn: string): {
  host: string;
  projectId: string;
  publicKey: string;
} | null {
  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.replace(/^\//, "");
    if (!publicKey || !projectId) return null;
    return { host: url.host, projectId, publicKey };
  } catch {
    return null;
  }
}

/**
 * Costruisce l'envelope endpoint per inviare un evento di test.
 * https://docs.sentry.io/api/envelopes/
 */
function envelopeEndpoint(parsed: {
  host: string;
  projectId: string;
  publicKey: string;
}): string {
  return `https://${parsed.host}/api/${parsed.projectId}/envelope/?sentry_key=${parsed.publicKey}&sentry_version=7`;
}

export async function testSentryConnection(input: {
  dsn: string;
  authToken?: string | null;
  org?: string | null;
  project?: string | null;
}): Promise<SentryTestResult> {
  const dsn = (input.dsn ?? "").trim();
  if (!dsn) return { ok: false, reason: "dsn_required" };
  if (!isValidDsn(dsn)) return { ok: false, reason: "invalid_dsn_format" };

  const parsed = parseDsn(dsn);
  if (!parsed) return { ok: false, reason: "invalid_dsn_format" };

  // Step 1: invia un evento test al progetto Sentry.
  // Envelope = 3 righe NDJSON: header, item-header, item-payload.
  const eventId = crypto.randomUUID().replace(/-/g, "");
  const sentAt = new Date().toISOString();
  const envelope =
    JSON.stringify({ event_id: eventId, sent_at: sentAt, dsn }) +
    "\n" +
    JSON.stringify({ type: "event" }) +
    "\n" +
    JSON.stringify({
      event_id: eventId,
      timestamp: sentAt,
      platform: "javascript",
      level: "info",
      logger: "admin.services.sentry.test",
      message: {
        message: "Sentry connection test from /admin/services/sentry",
      },
      tags: { source: "connection_test" },
    });

  let response: Response;
  try {
    response = await fetch(envelopeEndpoint(parsed), {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope" },
      body: envelope,
      cache: "no-store",
    });
  } catch (err) {
    return {
      ok: false,
      reason: "network_error",
      detail: err instanceof Error ? err.message : "fetch failed",
    };
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, reason: "dsn_unauthorized" };
  }
  if (!response.ok) {
    return {
      ok: false,
      reason: "dsn_unknown_status",
      detail: String(response.status),
    };
  }

  // Step 2: se l'admin ha settato auth_token + org + project, validiamo
  // anche il token via API REST. Skip silenzioso se non tutti e tre.
  const token = input.authToken?.trim();
  const org = input.org?.trim();
  const project = input.project?.trim();
  if (!token || !org || !project) {
    return { ok: true, eventId };
  }

  let tokenResp: Response;
  try {
    tokenResp = await fetch(
      `https://sentry.io/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
  } catch {
    // DSN ok, token check di rete fallito → segnaliamo OK ma marchiamo
    // tokenValid undefined.
    return { ok: true, eventId };
  }

  if (tokenResp.status === 401) {
    return { ok: false, reason: "token_invalid" };
  }
  if (tokenResp.status === 403 || tokenResp.status === 404) {
    return { ok: false, reason: "token_forbidden" };
  }

  return { ok: true, eventId, tokenValid: tokenResp.ok };
}
