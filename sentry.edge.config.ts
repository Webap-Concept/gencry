/**
 * Sentry init per l'edge runtime di Next 16 (proxy.ts + route handlers
 * con `runtime: "edge"`). Caricato da instrumentation.ts.register() solo
 * quando NEXT_RUNTIME==="edge".
 *
 * L'edge runtime ha API limitata (no fs, no Node net diretto) ma il
 * client `@sentry/nextjs/edge` è già pensato per quei vincoli.
 *
 * Niente performance tracing in edge: in proxy.ts ci interessa solo
 * intercettare gli errori. Il sample rate ignora sempre traces.
 */
import * as Sentry from "@sentry/nextjs";
import { loadSentryConfig } from "@/lib/sentry/config";

const cfg = await loadSentryConfig();

if (cfg.dsn) {
  Sentry.init({
    dsn: cfg.dsn,
    environment: cfg.environment ?? process.env.VERCEL_ENV ?? undefined,
    tracesSampleRate: 0,
    sendDefaultPii: cfg.sendDefaultPii,
  });
  // eslint-disable-next-line no-console
  console.info(`[sentry] edge init OK (env=${cfg.environment ?? "auto"})`);
} else {
  // eslint-disable-next-line no-console
  console.info("[sentry] edge init skipped — DSN not configured");
}
