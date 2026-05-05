"use client";

import { AdminSectionInfo } from "@/app/(admin)/admin/_components/section-info";
import type { LucideIcon } from "lucide-react";
import {
  Database,
  GitMerge,
  LogIn,
  Plug,
  Send,
  Shield,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { RedisAdminGuide } from "../redis/_components/redis-guide";

type SectionMeta = {
  /** Chiave del sotto-percorso (segment finale di /admin/services/<segment>).
   *  Le label/description vengono risolte da admin.services.sections.<key>.* */
  icon: LucideIcon;
  /** Operator's guide opzionale. Quando presente, un bottone info nel
   *  titolo apre il modale con questo contenuto e usa
   *  admin.services.sections.<key>.guideTitle (se definito). */
  guide?: React.ReactNode;
  /** true se questa sezione ha una chiave dedicata `guideTitle` nel JSON. */
  hasGuideTitle?: boolean;
};

const SECTIONS: Record<string, SectionMeta> = {
  cloudflare: { icon: Shield },
  github: { icon: GitMerge },
  "google-oauth": { icon: LogIn },
  redis: { icon: Database, guide: <RedisAdminGuide />, hasGuideTitle: true },
  resend: { icon: Send },
};

const DEFAULT: SectionMeta = { icon: Plug };

export function ServicesHeader() {
  const t = useTranslations("admin.services");
  const pathname = usePathname();
  const segment = pathname.split("/").pop() ?? "";
  const section = SECTIONS[segment] ?? DEFAULT;
  const Icon = section.icon;
  const isKnown = segment in SECTIONS;

  const sectionLabel = isKnown ? t(`sections.${segment}.label`) : "";
  const sectionDescription = isKnown
    ? t(`sections.${segment}.description`)
    : t("defaultDescription");

  const guideTitle = section.guide
    ? section.hasGuideTitle
      ? t(`sections.${segment}.guideTitle`)
      : `${sectionLabel} ${t("guideTitleSuffix")}`
    : undefined;

  const guideAriaLabel = `${t("guideAriaPrefix")} ${sectionLabel || segment}`;

  return (
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
      <div>
        <div className="flex items-center gap-2">
          <h2
            className="text-lg font-bold"
            style={{ color: "var(--admin-text)" }}>
            {sectionLabel ? (
              <>
                <span style={{ color: "var(--admin-text-muted)" }}>
                  {t("rootTitle")}
                </span>
                <span style={{ color: "var(--admin-text-faint)" }}> / </span>
                <span>{sectionLabel}</span>
              </>
            ) : (
              t("rootTitle")
            )}
          </h2>
          {section.guide && guideTitle && (
            <AdminSectionInfo title={guideTitle} ariaLabel={guideAriaLabel}>
              {section.guide}
            </AdminSectionInfo>
          )}
        </div>
        <p
          className="text-sm mt-0.5"
          style={{ color: "var(--admin-text-faint)" }}>
          {sectionDescription}
        </p>
      </div>
    </div>
  );
}
