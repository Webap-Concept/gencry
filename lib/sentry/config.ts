/**
 * Helper per caricare la config Sentry dalle app_settings DB.
 *
 * Convenzione: tutte le chiavi vivono in app_settings sotto il namespace
 * `sentry.*`. La sorgente di verità è la UI in /admin/services/sentry.
 * Le env var (es. SENTRY_AUTH_TOKEN per il build, SENTRY_DSN per debug
 * locale) sono ancora supportate ma il DB ha precedenza quando popolato.
 *
 * IMPORTANTE: questa lib è server-only. Sentry.init() per il client
 * riceve i valori via injection nel root layout (window.__SENTRY_CONFIG__),
 * non chiamando questa funzione (il client non può leggere il DB).
 */
import "server-only";

import { getAppSettings } from "@/lib/db/settings-queries";

export type SentryRuntimeConfig = {
  /** DSN pubblico Sentry. null = init no-op (Sentry disabilitato). */
  dsn: string | null;
  /** Environment tag (production/staging/development/custom). null = lascia che Sentry deduca. */
  environment: string | null;
  /** 0..1 — performance monitoring. 0 = off. */
  tracesSampleRate: number;
  /** 0..1 — session replay quando avviene un errore. 0 = off. */
  replaysOnErrorSampleRate: number;
  /** Se true, Sentry include IP/email/headers utente nei report. Default false (GDPR). */
  sendDefaultPii: boolean;
  /** Org slug Sentry (es. "acme-inc"). Usato dal build plugin per upload source maps. */
  org: string | null;
  /** Project slug Sentry (es. "gencry-web"). Usato dal build plugin. */
  project: string | null;
  /** Auth token per upload source maps (server-only). Build-time. */
  authToken: string | null;
};

function clampRate(raw: string | null | undefined): number {
  if (raw == null || raw === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Carica la config Sentry dal DB. Cached via React `cache()` di
 * getAppSettings — una sola query per request server.
 *
 * Fallback su env var per il caso "build/dev locale senza DB":
 *   - SENTRY_DSN (legacy, alcuni dev preferiscono ENV)
 *   - SENTRY_AUTH_TOKEN (il build di Vercel lo legge da env per il
 *     plugin webpack, anche se il valore è in DB lo leggiamo qui)
 */
export async function loadSentryConfig(): Promise<SentryRuntimeConfig> {
  let dbValues: {
    dsn: string | null;
    environment: string | null;
    tracesSampleRate: string;
    replaysOnErrorSampleRate: string;
    sendDefaultPii: string;
    org: string | null;
    project: string | null;
    authToken: string | null;
  };
  try {
    const settings = await getAppSettings();
    dbValues = {
      dsn: settings["sentry.dsn"] ?? null,
      environment: settings["sentry.environment"] ?? null,
      tracesSampleRate: settings["sentry.traces_sample_rate"] ?? "0",
      replaysOnErrorSampleRate:
        settings["sentry.replays_on_error_sample_rate"] ?? "0",
      sendDefaultPii: settings["sentry.send_default_pii"] ?? "false",
      org: settings["sentry.org"] ?? null,
      project: settings["sentry.project"] ?? null,
      authToken: settings["sentry.auth_token"] ?? null,
    };
  } catch {
    // Build/CI senza DB raggiungibile: fallback su env var.
    // In runtime serverless un fallimento DB è raro ma non vogliamo
    // che instrumentation.ts crashi e blocchi tutta l'app.
    dbValues = {
      dsn: null,
      environment: null,
      tracesSampleRate: "0",
      replaysOnErrorSampleRate: "0",
      sendDefaultPii: "false",
      org: null,
      project: null,
      authToken: null,
    };
  }

  return {
    dsn: dbValues.dsn || process.env.SENTRY_DSN || null,
    environment:
      dbValues.environment || process.env.SENTRY_ENVIRONMENT || null,
    tracesSampleRate: clampRate(dbValues.tracesSampleRate),
    replaysOnErrorSampleRate: clampRate(dbValues.replaysOnErrorSampleRate),
    sendDefaultPii: dbValues.sendDefaultPii === "true",
    org: dbValues.org || process.env.SENTRY_ORG || null,
    project: dbValues.project || process.env.SENTRY_PROJECT || null,
    authToken: dbValues.authToken || process.env.SENTRY_AUTH_TOKEN || null,
  };
}

/**
 * Subset safe-da-esporre-al-client. Mai includere authToken/PAT.
 * Iniettato nel root layout via <script> inline → window.__SENTRY_CONFIG__.
 */
export type SentryClientConfig = {
  dsn: string | null;
  environment: string | null;
  tracesSampleRate: number;
  replaysOnErrorSampleRate: number;
  sendDefaultPii: boolean;
};

export function toClientConfig(cfg: SentryRuntimeConfig): SentryClientConfig {
  return {
    dsn: cfg.dsn,
    environment: cfg.environment,
    tracesSampleRate: cfg.tracesSampleRate,
    replaysOnErrorSampleRate: cfg.replaysOnErrorSampleRate,
    sendDefaultPii: cfg.sendDefaultPii,
  };
}

/**
 * Valida il formato di un DSN. Accetta i formati ufficiali Sentry:
 *   https://<key>@<host>/<project_id>
 *   https://<key>@<host>:443/<project_id>
 */
export function isValidDsn(dsn: string): boolean {
  try {
    const url = new URL(dsn);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (!url.username) return false; // public key
    if (!url.pathname || url.pathname === "/") return false; // /<project_id>
    return true;
  } catch {
    return false;
  }
}
