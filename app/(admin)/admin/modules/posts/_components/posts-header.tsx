"use client";

import { AdminSectionInfo } from "@/app/(admin)/admin/_components/section-info";
import { CronAdminGuide } from "@/app/(admin)/admin/_components/cron-admin-guide";
import { AdminSectionTabs } from "@/app/(admin)/admin/_components/admin-section-tabs";
import type { LucideIcon } from "lucide-react";
import { Clock, Flag, MessageSquare, Settings, Trash2 } from "lucide-react";
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
  const Icon = section.icon;
  const base = `/${adminSlug}/modules/posts`;

  return (
    <header>
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background:
              "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))",
            border:
              "1px solid color-mix(in srgb, var(--admin-accent) 25%, transparent)",
          }}>
          <Icon size={18} style={{ color: "var(--admin-accent)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold" style={{ color: "var(--admin-text)" }}>
              Posts
            </h2>
            {section.guide === "cron" && (
              <AdminSectionInfo
                title={tCron("guideTitle")}
                ariaLabel={tCron("guideTriggerAria")}>
                <CronAdminGuide />
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
          { href: base, label: "Overview", exact: true },
          { href: `${base}/reports`, label: "Reports" },
          { href: `${base}/deleted`, label: "Deleted" },
          { href: `${base}/settings`, label: "Settings" },
          { href: `${base}/cron`, label: "Cron Jobs" },
        ]}
      />
    </header>
  );
}
