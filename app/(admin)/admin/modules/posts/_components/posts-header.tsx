"use client";

import { AdminSectionInfo } from "@/app/(admin)/admin/_components/section-info";
import { CronAdminGuide } from "@/app/(admin)/admin/_components/cron-admin-guide";
import { AdminStickyHeader } from "@/app/(admin)/admin/_components/admin-sticky-header";
import type { LucideIcon } from "lucide-react";
import { BookOpen, Clock, Flag, MessageSquare, Settings, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";

type SectionMeta = {
  description: string;
  icon: LucideIcon;
  guide?: "cron";
};

const SECTIONS: Record<string, SectionMeta> = {
  posts: {
    description: "Modulo social feed — composer, reactions, comments, moderation.",
    icon: MessageSquare,
  },
  reports: {
    description:
      "Coda di moderazione: segnalazioni utente con decisione dismiss / soft-delete del post.",
    icon: Flag,
  },
  deleted: {
    description:
      "Post soft-deleted dagli autori: ripristinabili entro la grace window, dopo l'hard-delete è definitivo.",
    icon: Trash2,
  },
  settings: {
    description: "Storage R2, motivi di segnalazione, opzioni di posting.",
    icon: Settings,
  },
  cron: {
    description: "pg_cron jobs di proprietà del modulo Posts.",
    icon: Clock,
    guide: "cron",
  },
  architecture: {
    description:
      "Documentazione architetturale: stack, schema DB, pipeline, hook, performance, roadmap.",
    icon: BookOpen,
  },
};

const DEFAULT: SectionMeta = {
  description: "Modulo social feed — composer, reactions, comments, moderation.",
  icon: MessageSquare,
};

export function PostsHeader({ adminSlug }: { adminSlug: string }) {
  const pathname = usePathname();
  const tCron = useTranslations("admin.cron");
  const segment = pathname.split("/").pop() ?? "";
  const section = SECTIONS[segment] ?? DEFAULT;
  const base = `/${adminSlug}/modules/posts`;

  return (
    <AdminStickyHeader
      icon={section.icon}
      title="Posts"
      description={section.description}
      rightExtras={
        section.guide === "cron" ? (
          <AdminSectionInfo
            title={tCron("guideTitle")}
            ariaLabel={tCron("guideTriggerAria")}>
            <CronAdminGuide />
          </AdminSectionInfo>
        ) : null
      }
      tabs={[
        { href: base, label: "Overview", exact: true },
        { href: `${base}/reports`, label: "Reports" },
        { href: `${base}/deleted`, label: "Deleted" },
        { href: `${base}/settings`, label: "Settings" },
        { href: `${base}/cron`, label: "Cron Jobs" },
        { href: `${base}/architecture`, label: "Architettura" },
      ]}
    />
  );
}
