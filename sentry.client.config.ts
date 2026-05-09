/**
 * Sentry init per il browser. Caricato dal componente client
 * `<SentryClientInit />` nel root layout, che riceve la config dal
 * server (window.__SENTRY_CONFIG__) e chiama `bootSentryClient()`.
 *
 * Per via di Next 16 server components, questo file NON viene caricato
 * automaticamente — è il bootstrap esplicito a importarlo lazy. Così
 * evitiamo di tirare ~30KB di Sentry SDK nel bundle iniziale quando
 * il DSN non è configurato.
 */
"use client";

import * as Sentry from "@sentry/nextjs";

declare global {
  interface Window {
    /** Iniettato dal root layout server-side via <script>. */
    __SENTRY_CONFIG__?: {
      dsn: string | null;
      environment: string | null;
      tracesSampleRate: number;
      replaysOnErrorSampleRate: number;
      sendDefaultPii: boolean;
    };
  }
}

let booted = false;

export function bootSentryClient(): void {
  if (booted) return;
  if (typeof window === "undefined") return;
  const cfg = window.__SENTRY_CONFIG__;
  if (!cfg || !cfg.dsn) return;
  booted = true;

  // Replay integration carica il proprio chunk solo se il sample rate è
  // > 0. L'array `integrations` accetta valori condizionali (ma deve
  // essere un array, non null), quindi mappiamo a un'optional list.
  const integrations: ReturnType<typeof Sentry.replayIntegration>[] = [];
  if (cfg.replaysOnErrorSampleRate > 0) {
    integrations.push(
      Sentry.replayIntegration({
        maskAllText: !cfg.sendDefaultPii,
        blockAllMedia: !cfg.sendDefaultPii,
      }),
    );
  }

  Sentry.init({
    dsn: cfg.dsn,
    environment: cfg.environment ?? undefined,
    tracesSampleRate: cfg.tracesSampleRate,
    sendDefaultPii: cfg.sendDefaultPii,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: cfg.replaysOnErrorSampleRate,
    integrations,
  });
}
