"use client";
// Client component delle tabs News. Riceve tabs già pronte dal server
// (vedi news-header.tsx) e si occupa solo di:
//   - active state (via AdminStickyHeader → AdminSectionTabs)
//   - selezione del guide info-button per il segment corrente (Cron)
import {
  AdminStickyHeader,
  type AdminStickyHeaderGuide,
} from "@/app/(admin)/admin/_components/admin-sticky-header";
import { CronAdminGuide } from "@/app/(admin)/admin/_components/cron-admin-guide";
import type { AdminSectionTab } from "@/app/(admin)/admin/_components/admin-section-tabs";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";

export function NewsHeaderClient({ tabs }: { tabs: AdminSectionTab[] }) {
  const pathname = usePathname();
  const tCron = useTranslations("admin.cron");
  const segment = pathname.split("/").pop() ?? "";

  const guide: AdminStickyHeaderGuide | undefined =
    segment === "cron"
      ? {
          title: tCron("guideTitle"),
          ariaLabel: tCron("guideTriggerAria"),
          content: <CronAdminGuide />,
        }
      : undefined;

  return <AdminStickyHeader tabs={tabs} guide={guide} />;
}
