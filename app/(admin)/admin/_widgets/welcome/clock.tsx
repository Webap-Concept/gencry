"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";

/**
 * Live clock for the welcome widget. The server renders `initialNow` so
 * SSR and the first client render agree (no hydration mismatch); after
 * mount we re-sync to the client clock and tick every 30s. The minute
 * granularity makes a 30s tick rate plenty without burning re-renders.
 */
export default function WelcomeClock({ initialNow }: { initialNow: number }) {
  const locale = useLocale();
  const [now, setNow] = useState<number>(initialNow);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const date = new Date(now);
  const dateLabel = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  const timeLabel = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  return (
    <div className="flex items-baseline gap-3 mt-1">
      <span
        className="font-semibold tabular-nums"
        style={{
          fontSize: 22,
          lineHeight: 1.1,
          color: "var(--admin-accent)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {timeLabel}
      </span>
      <span
        className="text-xs truncate"
        style={{
          color: "var(--admin-text-muted)",
          textTransform: "capitalize",
        }}
      >
        {dateLabel}
      </span>
    </div>
  );
}
