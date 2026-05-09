/**
 * Next.js instrumentation hook (https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation).
 *
 * Eseguito UNA volta per cold start della funzione, prima che il primo
 * request handler giri. Qui inizializziamo Sentry per il runtime corrente
 * (node o edge), leggendo DSN + sample rates dalle app_settings DB.
 *
 * Niente Sentry.init() qui per il client: il bundle browser non passa
 * mai per questo file. Per il client vedi `sentry.client.config.ts`,
 * caricato da `app/(public)/_components/sentry-client-init.tsx` con i
 * valori iniettati nel root layout.
 *
 * Importante: NON throware da qui — un fallimento DB renderebbe la
 * funzione completamente unhealthy. `loadSentryConfig` ha già un
 * try/catch interno che ritorna defaults safe.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/**
 * Cattura errori dei React Server Components.
 * Senza questa export, gli errori RSC non finiscono in Sentry.
 */
export async function onRequestError(
  err: unknown,
  request: {
    path: string;
    method: string;
    headers: { [key: string]: string };
  },
  context: {
    routerKind: "Pages Router" | "App Router";
    routePath: string;
    routeType: "render" | "route" | "action" | "middleware";
    renderSource?: string;
    revalidateReason?: string;
    renderType?: string;
  },
) {
  // Lazy import: se Sentry non è stato init (DSN vuoto), captureException
  // è un no-op safe. Importiamo dinamicamente per evitare di tirare il
  // bundle Sentry quando non serve.
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureRequestError(err, request, context);
  } catch {
    /* noop */
  }
}
