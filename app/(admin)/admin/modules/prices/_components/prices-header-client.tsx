"use client";
// Client component delle tabs Prices Engine. Riceve tabs già pronte
// dal server (vedi prices-header.tsx) e sceglie l'info-button guide
// in base al segment corrente. CronAdminGuide e CacheAdminGuide sono
// JSX, non serializzabili nel manifest, quindi vivono qui.
import {
  AdminStickyHeader,
  type AdminStickyHeaderGuide,
} from "@/app/(admin)/admin/_components/admin-sticky-header";
import { CronAdminGuide } from "@/app/(admin)/admin/_components/cron-admin-guide";
import type { AdminSectionTab } from "@/app/(admin)/admin/_components/admin-section-tabs";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { CacheAdminGuide } from "./cache-admin-guide";

export function PricesHeaderClient({ tabs }: { tabs: AdminSectionTab[] }) {
  const pathname = usePathname();
  const tCron = useTranslations("admin.cron");
  const segment = pathname.split("/").pop() ?? "";

  let guide: AdminStickyHeaderGuide | undefined;
  if (segment === "cron") {
    guide = {
      title: tCron("guideTitle"),
      ariaLabel: tCron("guideTriggerAria"),
      content: <CronAdminGuide />,
    };
  } else if (
    segment === "prices" ||
    segment === "coins" ||
    segment === "settings"
  ) {
    guide = {
      title: "Cache e invalidazione del modulo prezzi",
      ariaLabel: "Apri guida cache",
      content: <CacheAdminGuide />,
    };
  }

  return <AdminStickyHeader tabs={tabs} guide={guide} />;
}
