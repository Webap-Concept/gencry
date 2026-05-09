/**
 * Avvia Sentry sul client al primo mount usando i valori che il server
 * ha iniettato in window.__SENTRY_CONFIG__ dal root layout.
 *
 * Splittato dal root layout per due motivi:
 *  - mantenere `app/layout.tsx` server-only (questo deve essere client)
 *  - lazy import di `sentry.client.config`: il chunk Sentry (~30KB)
 *    viene scaricato solo quando il componente monta, dopo l'idratazione.
 *    Se DSN è null nel config, il boot esce subito senza scaricare nulla.
 */
"use client";

import { useEffect } from "react";

export function SentryClientBoot() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const cfg = window.__SENTRY_CONFIG__;
    if (!cfg || !cfg.dsn) return;
    // Lazy import: caricato solo quando DSN è effettivamente settato.
    import("../sentry.client.config").then((mod) => mod.bootSentryClient());
  }, []);
  return null;
}
