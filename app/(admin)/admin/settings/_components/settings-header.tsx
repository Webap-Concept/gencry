"use client";

import { AdminSectionInfo } from "@/app/(admin)/admin/_components/section-info";
import type { LucideIcon } from "lucide-react";
import {
  Clock,
  Code2,
  Database,
  Globe,
  Languages,
  LogIn,
  Mail,
  Send,
  Settings,
  Shield,
  SlidersHorizontal,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { RedisAdminGuide } from "../redis/_components/redis-guide";

type SectionMeta = {
  /** Chiave del sotto-percorso (segment finale di /admin/settings/<segment>).
   *  Le label/description vengono risolte da admin.settings.sections.<key>.* */
  icon: LucideIcon;
  /** Operator's guide opzionale. Quando presente, un bottone info nel
   *  titolo apre il modale con questo contenuto e usa
   *  admin.settings.sections.<key>.guideTitle (se definito). */
  guide?: React.ReactNode;
  /** true se questa sezione ha una chiave dedicata `guideTitle` nel JSON. */
  hasGuideTitle?: boolean;
};

const SECTIONS: Record<string, SectionMeta> = {
  general: { icon: Globe },
  "operation-mode": { icon: SlidersHorizontal },
  signup: { icon: LogIn },
  resend: { icon: Send },
  email: { icon: Mail },
  snippets: { icon: Code2 },
  redis: { icon: Database, guide: <RedisAdminGuide />, hasGuideTitle: true },
  cloudflare: { icon: Shield },
  cron: { icon: Clock },
  languages: { icon: Languages },
};

const DEFAULT: SectionMeta = { icon: Settings };

export function SettingsHeader() {
  const t = useTranslations("admin.settings");
  const pathname = usePathname();
  const segment = pathname.split("/").pop() ?? "";
  const section = SECTIONS[segment] ?? DEFAULT;
  const Icon = section.icon;
  const isKnown = segment in SECTIONS;

  const sectionLabel = isKnown
    ? t(`sections.${segment}.label`)
    : "";
  const sectionDescription = isKnown
    ? t(`sections.${segment}.description`)
    : t("defaultDescription");

  // Il guideTitle vive sotto admin.settings.sections.<key>.guideTitle
  // SOLO per le sezioni che lo hanno (oggi solo "redis"). Per le altre
  // costruiamo `<label> — operator's guide` da chiavi i18n.
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
            <AdminSectionInfo
              title={guideTitle}
              ariaLabel={guideAriaLabel}>
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
