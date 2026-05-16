"use client";

import { AdminStickyHeader, type AdminStickyHeaderGuide } from "@/app/(admin)/admin/_components/admin-sticky-header";
import { CronAdminGuide } from "@/app/(admin)/admin/_components/cron-admin-guide";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { CacheAdminGuide } from "./cache-admin-guide";

export function PricesHeader({ adminSlug }: { adminSlug: string }) {
  const pathname = usePathname();
  const tCron = useTranslations("admin.cron");
  const segment = pathname.split("/").pop() ?? "";
  const base = `/${adminSlug}/modules/prices`;

  // Singolo info-button accanto alle tabs: cron tab → cron guide,
  // sezioni che mostrano dati cached → cache guide.
  let guide: AdminStickyHeaderGuide | undefined;
  if (segment === "cron") {
    guide = {
      title: tCron("guideTitle"),
      ariaLabel: tCron("guideTriggerAria"),
      content: <CronAdminGuide />,
    };
  } else if (segment === "prices" || segment === "coins" || segment === "settings") {
    guide = {
      title: "Cache e invalidazione del modulo prezzi",
      ariaLabel: "Apri guida cache",
      content: <CacheAdminGuide />,
    };
  }

  return (
    <AdminStickyHeader
      tabs={[
        { href: base,                   label: "Health",         exact: true },
        { href: `${base}/coins`,         label: "Coins Registry" },
        { href: `${base}/cron`,          label: "Cron Jobs" },
        { href: `${base}/settings`,      label: "Settings" },
        { href: `${base}/architecture`,  label: "Architettura" },
      ]}
      guide={guide}
    />
  );
}
