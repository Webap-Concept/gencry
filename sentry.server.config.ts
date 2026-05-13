/**
 * Sentry init per il Node.js server runtime di Next 16.
 * Caricato da instrumentation.ts.register() solo quando NEXT_RUNTIME==="nodejs".
 *
 * Config dinamica: legge dalle app_settings via lib/sentry/config.ts.
 * Se DSN è vuoto → init no-op (Sentry resta inattivo, nessun overhead).
 *
 * Modifiche al DSN/sample rate dalla UI si applicano al prossimo cold
 * start della funzione (Sentry.init è one-shot per processo). Su Vercel
 * questo significa "minuti dopo la modifica", oppure subito al prossimo
 * deploy.
 */
import * as Sentry from "@sentry/nextjs";
import { loadSentryConfig } from "@/lib/sentry/config";

const cfg = await loadSentryConfig();

if (cfg.dsn) {
  Sentry.init({
    dsn: cfg.dsn,
    environment: cfg.environment ?? process.env.VERCEL_ENV ?? undefined,
    // Performance: 0 di default = solo errori.
    tracesSampleRate: cfg.tracesSampleRate,
    // PII: per GDPR l'admin sceglie esplicitamente di attivarlo.
    sendDefaultPii: cfg.sendDefaultPii,
    // Opt-out della fetch instrumentation di undici. Sentry instrumenta
    // ogni outbound fetch (Supabase, R2, ecc.) creando un overhead per
    // request che non utilizziamo (non guardiamo le traces outbound).
    // Disabilitarla riduce CPU + memoria per request senza perdere
    // l'error capture su Sentry — perdiamo solo l'auto-tracing fetch.
    integrations: (defaults) =>
      defaults.filter((i) => i.name !== "NodeFetch"),
    // Filtra qui errori noti che NON vogliamo in Sentry. Esempio: il
    // pooler timeout su last_seen update è già demoted a warn nel
    // codice; lo lasciamo passare se mai diventasse un errore reale.
    // beforeSend(event, hint) { return event; },
  });
  // eslint-disable-next-line no-console
  console.info(
    `[sentry] server init OK (env=${cfg.environment ?? "auto"}, traces=${cfg.tracesSampleRate})`,
  );
} else {
  // eslint-disable-next-line no-console
  console.info("[sentry] server init skipped — DSN not configured");
}
