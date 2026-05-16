"use client";
// Client component delle tabs Posts. Riceve tabs già pronte dal server
// (vedi posts-header.tsx) e si occupa solo di:
//   - active state (via AdminStickyHeader → AdminSectionTabs)
//   - selezione del guide info-button per il segment corrente
// I guide sono JSX (CronAdminGuide), non serializzabili nel manifest,
// quindi vivono qui hardcoded per segment.
import {
  AdminStickyHeader,
  type AdminStickyHeaderGuide,
} from "@/app/(admin)/admin/_components/admin-sticky-header";
import { CronAdminGuide } from "@/app/(admin)/admin/_components/cron-admin-guide";
import type { AdminSectionTab } from "@/app/(admin)/admin/_components/admin-section-tabs";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";

export function PostsHeaderClient({ tabs }: { tabs: AdminSectionTab[] }) {
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
