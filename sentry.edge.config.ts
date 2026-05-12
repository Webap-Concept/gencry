/**
 * Sentry init per l'edge runtime di Next 16 (proxy.ts + route handlers
 * con `runtime: "edge"`). Caricato da instrumentation.ts.register() solo
 * quando NEXT_RUNTIME==="edge".
 *
 * IMPORTANTE: questa config NON legge dal DB.
 * L'edge runtime non ha accesso a Node `net`/TCP, quindi non può
 * importare drizzle/postgres-js. Tirare `loadSentryConfig` da qui
 * romperebbe il bundle edge (proxy crasha all'init).
 *
 * Sorgenti di config per edge — solo env vars:
 *   SENTRY_DSN              — DSN (stessa stringa che metti in /admin/services/sentry)
 *   SENTRY_ENVIRONMENT      — environment tag (fallback: VERCEL_ENV)
 *   SENTRY_SEND_DEFAULT_PII — 'true' per inviare IP/email/headers (default 'false', GDPR)
 *
 * Se SENTRY_DSN non è settata → init no-op, nessun overhead, nessun
 * crash. Gli errori del proxy.ts in quel caso NON finiscono in Sentry,
 * ma il resto dell'app (Node runtime) continua a usare il DSN dal DB
 * via sentry.server.config.ts.
 *
 * Niente performance tracing in edge: in proxy.ts interessa solo
 * intercettare gli errori, traces è sempre 0.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN || null;
const environment =
  process.env.SENTRY_ENVIRONMENT || process.env.VERCEL_ENV || undefined;
const sendDefaultPii = process.env.SENTRY_SEND_DEFAULT_PII === "true";

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    tracesSampleRate: 0,
    sendDefaultPii,
  });
  // eslint-disable-next-line no-console
  console.info(`[sentry] edge init OK (env=${environment ?? "auto"})`);
} else {
  // eslint-disable-next-line no-console
  console.info(
    "[sentry] edge init skipped — SENTRY_DSN env var not set (DB-only DSN does not reach edge)",
  );
}
