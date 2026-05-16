"use client";

import { AdminSectionInfo } from "@/app/(admin)/admin/_components/section-info";
import { CronAdminGuide } from "@/app/(admin)/admin/_components/cron-admin-guide";
import { AdminSectionTabs } from "@/app/(admin)/admin/_components/admin-section-tabs";
import type { LucideIcon } from "lucide-react";
import { Activity, BookOpen, Clock, Coins, LineChart, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { CacheAdminGuide } from "./cache-admin-guide";

type SectionMeta = {
  label: string;
  description: string;
  icon: LucideIcon;
  /** Key i18n della modal info, OR null se non c'è guida per la sezione. */
  guide?: "cache" | "cron";
};

const SECTIONS: Record<string, SectionMeta> = {
  prices: {
    label: "Health",
    description: "Live status of the price ingestion pipeline and recent runs.",
    icon: Activity,
    guide: "cache",
  },
  coins: {
    label: "Coins Registry",
    description: "Tracked coins, last seen, force re-fetch metadata.",
    icon: Coins,
    guide: "cache",
  },
  cron: {
    label: "Cron Jobs",
    description: "pg_cron jobs owned by the Prices Engine module.",
    icon: Clock,
    guide: "cron",
  },
  settings: {
    label: "Settings",
    description: "Cron interval, active universe window, thresholds.",
    icon: Settings,
    guide: "cache",
  },
  architecture: {
    label: "Architettura",
    description:
      "Documentazione architetturale: stack, schema DB, pipeline, hook, performance, roadmap.",
    icon: BookOpen,
  },
};

const DEFAULT: SectionMeta = {
  label: "",
  description: "Crypto prices ingestion pipeline.",
  icon: LineChart,
};

export function PricesHeader({ adminSlug }: { adminSlug: string }) {
  const pathname = usePathname();
  const tCron = useTranslations("admin.cron");
  const segment = pathname.split("/").pop() ?? "";
  const section = SECTIONS[segment] ?? DEFAULT;
  const Icon = section.icon;
  const base = `/${adminSlug}/modules/prices`;

  return (
    <header>
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))",
            border: "1px solid color-mix(in srgb, var(--admin-accent) 25%, transparent)",
          }}>
          <Icon size={18} style={{ color: "var(--admin-accent)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold" style={{ color: "var(--admin-text)" }}>
              Prices Engine
            </h2>
            {section.guide === "cron" && (
              <AdminSectionInfo
                title={tCron("guideTitle")}
                ariaLabel={tCron("guideTriggerAria")}>
                <CronAdminGuide />
              </AdminSectionInfo>
            )}
            {section.guide === "cache" && (
              <AdminSectionInfo
                title="Cache e invalidazione del modulo prezzi"
                ariaLabel="Apri guida cache">
                <CacheAdminGuide />
              </AdminSectionInfo>
            )}
          </div>
          <p className="text-sm mt-0.5" style={{ color: "var(--admin-text-faint)" }}>
            {section.description}
          </p>
        </div>
      </div>
      <AdminSectionTabs
        tabs={[
          { href: base,                  label: "Health",        exact: true },
          { href: `${base}/coins`,        label: "Coins Registry" },
          { href: `${base}/cron`,         label: "Cron Jobs" },
          { href: `${base}/settings`,     label: "Settings" },
          { href: `${base}/architecture`, label: "Architettura" },
        ]}
      />
    </header>
  );
}
