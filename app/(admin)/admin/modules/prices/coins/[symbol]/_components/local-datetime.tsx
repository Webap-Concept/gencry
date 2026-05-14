"use client";

// Piccolo wrapper client per renderizzare un timestamp nel fuso del
// browser invece di quello del server (UTC su Vercel). Server SSR
// usa toLocaleString del runtime Node → vedi sempre UTC. Client
// runtime → usa il fuso utente.
//
// `value` può essere passato come Date o stringa ISO/numerica perché
// nei boundary RSC i Date possono finire serializzati a stringa.
import { useEffect, useState } from "react";

const DEFAULT_OPTIONS: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
};

export function LocalDateTime({
  value,
  options,
  locale,
}: {
  value: Date | string | number;
  options?: Intl.DateTimeFormatOptions;
  locale?: string;
}) {
  const date = value instanceof Date ? value : new Date(value);
  // Render iniziale: usa UTC per evitare hydration mismatch. Subito
  // dopo il mount sostituiamo con la locale del browser.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const fmt = options ?? DEFAULT_OPTIONS;
  if (!mounted) {
    return (
      <time dateTime={date.toISOString()} suppressHydrationWarning>
        {date.toLocaleString(locale ?? "it-IT", { ...fmt, timeZone: "UTC" })}
      </time>
    );
  }
  return (
    <time dateTime={date.toISOString()}>
      {date.toLocaleString(locale ?? "it-IT", fmt)}
    </time>
  );
}
