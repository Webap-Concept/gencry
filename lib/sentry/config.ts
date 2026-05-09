/**
 * Helper per caricare la config Sentry runtime dalle app_settings DB.
 *
 * Convenzione: tutte le chiavi runtime vivono in app_settings sotto il
 * namespace `sentry.*`. La sorgente di verità è la UI in
 * /admin/services/sentry. La env var SENTRY_DSN è supportata come
 * fallback per debug locale ma il DB ha precedenza quando popolato.
 *
 * BUILD-TIME (non gestito qui): SENTRY_ORG / SENTRY_PROJECT /
 * SENTRY_AUTH_TOKEN servono al plugin @sentry/nextjs per l'upload
 * source maps. Vivono SOLO come env vars del progetto Vercel —
 * `next.config.ts` gira al build, prima che la funzione serverless
 * esista, e non può leggere il DB.
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
 * Carica la config Sentry runtime dal DB. Cached via React `cache()` di
 * getAppSettings — una sola query per request server.
 *
 * Fallback su SENTRY_DSN env var per il caso "build/dev locale senza DB"
 * o quando l'admin non ha ancora salvato nulla.
 */
export async function loadSentryConfig(): Promise<SentryRuntimeConfig> {
  let dbValues: {
    dsn: string | null;
    environment: string | null;
    tracesSampleRate: string;
    replaysOnErrorSampleRate: string;
    sendDefaultPii: string;
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
    };
  }

  return {
    dsn: dbValues.dsn || process.env.SENTRY_DSN || null,
    environment:
      dbValues.environment || process.env.SENTRY_ENVIRONMENT || null,
    tracesSampleRate: clampRate(dbValues.tracesSampleRate),
    replaysOnErrorSampleRate: clampRate(dbValues.replaysOnErrorSampleRate),
    sendDefaultPii: dbValues.sendDefaultPii === "true",
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
