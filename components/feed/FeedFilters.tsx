"use client";

import { Pill } from "@/components/shared/Pill";

export const FEED_FILTERS = [
  "Tutti",
  "Aggiunte",
  "Alert",
  "Nuove watchlist",
] as const;

export type FeedFilter = (typeof FEED_FILTERS)[number];

type FeedFiltersProps = {
  active: FeedFilter;
  onChange: (f: FeedFilter) => void;
};

export function FeedFilters({ active, onChange }: FeedFiltersProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      {FEED_FILTERS.map((f) => (
        <Pill key={f} active={active === f} onClick={() => onChange(f)}>
          {f}
        </Pill>
      ))}
    </div>
  );
}
