"use client";

import { AdminStickyHeader, type AdminStickyHeaderGuide } from "@/app/(admin)/admin/_components/admin-sticky-header";
import { CronAdminGuide } from "@/app/(admin)/admin/_components/cron-admin-guide";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";

export function PostsHeader({ adminSlug }: { adminSlug: string }) {
  const pathname = usePathname();
  const tCron = useTranslations("admin.cron");
  const segment = pathname.split("/").pop() ?? "";
  const base = `/${adminSlug}/modules/posts`;

  // Singolo info-button accanto alle tabs: per ora solo sul cron tab.
  const guide: AdminStickyHeaderGuide | undefined =
    segment === "cron"
      ? {
          title: tCron("guideTitle"),
          ariaLabel: tCron("guideTriggerAria"),
          content: <CronAdminGuide />,
        }
      : undefined;

  return (
    <AdminStickyHeader
      tabs={[
        { href: base, label: "Overview", exact: true },
        { href: `${base}/reports`, label: "Reports" },
        { href: `${base}/deleted`, label: "Deleted" },
        { href: `${base}/settings`, label: "Settings" },
        { href: `${base}/cron`, label: "Cron Jobs" },
        { href: `${base}/architecture`, label: "Architettura" },
      ]}
      guide={guide}
    />
  );
}
