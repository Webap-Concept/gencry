"use client";

import type { LucideIcon } from "lucide-react";
import { Activity, Clock, Coins, LineChart, Settings } from "lucide-react";
import { usePathname } from "next/navigation";

type SectionMeta = {
  label: string;
  description: string;
  icon: LucideIcon;
};

const SECTIONS: Record<string, SectionMeta> = {
  prices: {
    label: "Health",
    description: "Live status of the price ingestion pipeline and recent runs.",
    icon: Activity,
  },
  coins: {
    label: "Coins Registry",
    description: "Tracked coins, last seen, force re-fetch metadata.",
    icon: Coins,
  },
  cron: {
    label: "Cron Jobs",
    description: "pg_cron jobs owned by the Prices Engine module.",
    icon: Clock,
  },
  settings: {
    label: "Settings",
    description: "Cron interval, active universe window, thresholds.",
    icon: Settings,
  },
};

const DEFAULT: SectionMeta = {
  label: "",
  description: "Crypto prices ingestion pipeline.",
  icon: LineChart,
};

export function PricesHeader() {
  const pathname = usePathname();
  const segment = pathname.split("/").pop() ?? "";
  const section = SECTIONS[segment] ?? DEFAULT;
  const Icon = section.icon;

  return (
    <div className="flex items-center gap-3">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{
          background: "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))",
          border: "1px solid color-mix(in srgb, var(--admin-accent) 25%, transparent)",
        }}>
        <Icon size={18} style={{ color: "var(--admin-accent)" }} />
      </div>
      <div>
        <h2 className="text-lg font-bold" style={{ color: "var(--admin-text)" }}>
          {section.label ? (
            <>
              <span style={{ color: "var(--admin-text-muted)" }}>Prices Engine</span>
              <span style={{ color: "var(--admin-text-faint)" }}> / </span>
              <span>{section.label}</span>
            </>
          ) : (
            "Prices Engine"
          )}
        </h2>
        <p className="text-sm mt-0.5" style={{ color: "var(--admin-text-faint)" }}>
          {section.description}
        </p>
      </div>
    </div>
  );
}
