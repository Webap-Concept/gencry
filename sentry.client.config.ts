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

    // Filtri "noise da extensions browser": Sentry intercetta gli error
    // globali della finestra, e i password manager / ad-blocker /
    // traduttori iniettano script che lanciano errori loro propri. Senza
    // questi filtri il dashboard si riempie di issue che NON sono bug
    // dell'app — vedi la lista canonica Sentry su browser noise:
    // https://docs.sentry.io/platforms/javascript/configuration/filtering/
    ignoreErrors: [
      // Stream API errors da extensions di decompressione (es. password
      // manager con auto-fill che intercettano response bodies)
      "Error in input stream",
      // Loop di ResizeObserver: noto false positive di Chrome — è un
      // warning, non un errore che impatta l'utente
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      // Errori senza stack utilizzabile: di solito cross-origin script
      // bloccato da CORS, niente di azionabile
      "Script error.",
      "Non-Error promise rejection captured",
    ],
    denyUrls: [
      // Stack frame che originano dalle extensions del browser
      /^chrome-extension:\/\//i,
      /^moz-extension:\/\//i,
      /^safari-extension:\/\//i,
      /^safari-web-extension:\/\//i,
      /^edge:\/\//i,
    ],

    /**
     * Filtra "Failed to fetch" / "Load failed" generati da:
     *   1. Lighthouse / PageSpeed Insights audit (User-Agent contiene
     *      `Nexus 5X Build/MMB29P` o `HeadlessChrome` o `Chrome-Lighthouse`).
     *      Lighthouse chiude il browser context prima che fetch lunghe
     *      completino → falso positivo.
     *   2. Beacon GTM (`?gtm_latency=...`) cancellato dal browser quando
     *      l'utente naviga via prima del completamento. Anche questi
     *      sono frequenti su Vercel Preview con PageSpeed auto-check.
     *
     * Combo AND: drop SOLO se "Failed to fetch" + (Lighthouse UA OR
     * gtm_latency nei breadcrumbs). Veri "Failed to fetch" applicativi
     * (es. nostra Server Action down) NON vengono droppati.
     */
    beforeSend(event, hint) {
      const message =
        hint?.originalException instanceof Error
          ? hint.originalException.message
          : event.exception?.values?.[0]?.value ?? "";

      const isFetchFail =
        /failed to fetch|load failed|networkerror when attempting to fetch/i.test(
          message,
        );
      if (!isFetchFail) return event;

      // Condition 1: User-Agent Lighthouse / PageSpeed / HeadlessChrome
      const headers = event.request?.headers as Record<string, string> | undefined;
      const ua = headers?.["User-Agent"] ?? headers?.["user-agent"] ?? "";
      if (
        /Nexus 5X Build\/MMB29P|HeadlessChrome|Chrome-Lighthouse|Lighthouse/i.test(
          ua,
        )
      ) {
        return null;
      }

      // Condition 2: ultimo breadcrumb fetch ha URL con gtm_latency
      const breadcrumbs = event.breadcrumbs ?? [];
      for (let i = breadcrumbs.length - 1; i >= 0; i--) {
        const b = breadcrumbs[i];
        if (b.category !== "fetch") continue;
        const url = b.data?.url ? String(b.data.url) : "";
        if (/gtm_latency/i.test(url)) return null;
        break; // solo l'ultimo fetch, non scandiamo tutta la timeline
      }

      return event;
    },
  });
}
