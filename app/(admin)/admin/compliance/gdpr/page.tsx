import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { AdminSectionInfo } from "@/app/(admin)/admin/_components/section-info";
import { getAppSettings } from "@/lib/db/settings-queries";
import {
  getGdprDashboardStats,
  getGdprHealthChecks,
} from "@/lib/account/gdpr-stats";
import { ScrollText } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ConsentStatusDashboard } from "./_components/consent-status-dashboard";
import { GdprLegendGuide } from "./_components/gdpr-legend-guide";
import { GdprSettingsForm } from "./_components/gdpr-settings-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.compliance.gdpr");
  return { title: t("metaTitle") };
}

export const dynamic = "force-dynamic";

export default async function GdprCompliancePage() {
  const t = await getTranslations("admin.compliance");
  const tG = await getTranslations("admin.compliance.gdpr");
  const tTools = await getTranslations("admin.compliance.gdpr.tools");
  const [settings, stats, health] = await Promise.all([
    getAppSettings(),
    getGdprDashboardStats(),
    getGdprHealthChecks(),
  ]);

  return (
    <div className="space-y-8">
      <AdminSectionHeader
        icon={ScrollText}
        breadcrumbLabel={t("breadcrumb")}
        title={tG("pageTitle")}
        subtitle={tG("pageSubtitle")}
        infoSlot={
          <AdminSectionInfo
            title={tG("guideTitle")}
            ariaLabel={tG("guideAriaLabel")}>
            <GdprLegendGuide />
          </AdminSectionInfo>
        }
      />

      {/* Section 1 — current consent status */}
      <ConsentStatusDashboard
        stats={stats}
        health={health}
        consentLogEnabled={settings["gdpr.consent_log.enabled"] === "true"}
        backupTier={settings["gdpr.backup.tier"]}
        pagesAdminPath="/admin/content/pages"
      />

      {/* Section 2 — settings */}
      <section>
        <h2
          className="text-sm font-semibold mb-3"
          style={{ color: "var(--admin-text)" }}>
          {tG("sectionSettings")}
        </h2>
        <GdprSettingsForm
          initial={{
            "gdpr.consent_log.enabled": settings["gdpr.consent_log.enabled"],
            "gdpr.consent_log.capture_ip":
              settings["gdpr.consent_log.capture_ip"],
            "gdpr.consent_log.ip_strategy":
              settings["gdpr.consent_log.ip_strategy"],
            "gdpr.consent_log.capture_user_agent":
              settings["gdpr.consent_log.capture_user_agent"],
            "gdpr.consent_log.hash_policy_text":
              settings["gdpr.consent_log.hash_policy_text"],
            "gdpr.consent_log.retention_after_deletion_days":
              settings["gdpr.consent_log.retention_after_deletion_days"],
            "gdpr.backup.tier": settings["gdpr.backup.tier"],
            "gdpr.backup.notes": settings["gdpr.backup.notes"],
            "gdpr.backup.pitr.last_verified_at":
              settings["gdpr.backup.pitr.last_verified_at"],
            "gdpr.backup.pitr.last_verified_tier":
              settings["gdpr.backup.pitr.last_verified_tier"],
            "gdpr.backup.s3.last_verified_at":
              settings["gdpr.backup.s3.last_verified_at"],
            "gdpr.backup.s3.last_verified_status":
              settings["gdpr.backup.s3.last_verified_status"],
            "gdpr.backup.external.provider":
              settings["gdpr.backup.external.provider"],
            "gdpr.backup.external.frequency":
              settings["gdpr.backup.external.frequency"],
            "gdpr.backup.external.retention_days":
              settings["gdpr.backup.external.retention_days"],
            "gdpr.backup.external.last_verified_at":
              settings["gdpr.backup.external.last_verified_at"],
            "gdpr.backup.external.last_verified_by":
              settings["gdpr.backup.external.last_verified_by"],
            "gdpr.backup.external.recovery_test_notes":
              settings["gdpr.backup.external.recovery_test_notes"],
            "gdpr.deletion.grace_days": settings["gdpr.deletion.grace_days"],
            "gdpr.export.rate_limit_days":
              settings["gdpr.export.rate_limit_days"],
            "gdpr.policy.force_reconsent_on_change":
              settings["gdpr.policy.force_reconsent_on_change"],
            "gdpr.policy.reconsent_grace_days":
              settings["gdpr.policy.reconsent_grace_days"],
            "gdpr.policy.notifications_cron_minutes":
              settings["gdpr.policy.notifications_cron_minutes"],
          }}
          backupServices={{
            supabaseConfigured:
              !!settings.supabase_pat?.trim() &&
              !!settings.supabase_project_ref?.trim(),
            s3Configured:
              !!settings["s3.endpoint"]?.trim() &&
              !!settings["s3.region"]?.trim() &&
              !!settings["s3.bucket"]?.trim() &&
              !!settings["s3.access_key_id"]?.trim() &&
              !!settings["s3.secret_access_key"]?.trim(),
          }}
        />
      </section>

      {/* Section 3 — tools */}
      <section>
        <h2
          className="text-sm font-semibold mb-3"
          style={{ color: "var(--admin-text)" }}>
          {tG("sectionTools")}
        </h2>
        <div
          className="rounded-xl shadow-sm p-6 space-y-3"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          <ToolRow
            title={tTools("editPolicyTitle")}
            description={tTools("editPolicyDesc")}
            href="/admin/content/pages"
            cta={tTools("editPolicyCta")}
          />
          <ToolRow
            title={tTools("exportCsvTitle")}
            description={tTools("exportCsvDesc")}
            href="/admin/compliance/gdpr/export"
            cta={tTools("exportCsvCta")}
            download
          />
          <ToolRow
            title={tTools("activityLogsTitle")}
            description={tTools("activityLogsDesc")}
            href="/admin/logs"
            cta={tTools("activityLogsCta")}
          />
          <ToolRow
            title={tTools("cookieSettingsTitle")}
            description={tTools("cookieSettingsDesc")}
            href="/admin/compliance/cookies"
            cta={tTools("cookieSettingsCta")}
          />
        </div>
      </section>
    </div>
  );
}

function ToolRow({
  title,
  description,
  href,
  cta,
  disabled,
  download,
}: {
  title: string;
  description: string;
  href?: string;
  cta: string;
  disabled?: boolean;
  /** True per link a route handler che scaricano file (CSV / PDF / ecc.):
   *  rendiamo un <a> normale invece di next/link, così niente prefetch di
   *  un endpoint che restituisce il file vero. */
  download?: boolean;
}) {
  const ctaClass = "text-xs px-3 py-1.5 rounded-lg shrink-0";
  const ctaStyle: React.CSSProperties = {
    background: "var(--admin-page-bg)",
    color: "var(--admin-text-muted)",
    border: "1px solid var(--admin-input-border)",
  };
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <div
          className="text-sm font-medium"
          style={{ color: "var(--admin-text)" }}>
          {title}
        </div>
        <div
          className="text-[11px] mt-0.5"
          style={{ color: "var(--admin-text-faint)" }}>
          {description}
        </div>
      </div>
      {disabled || !href ? (
        <span
          className={ctaClass}
          style={{
            ...ctaStyle,
            color: "var(--admin-text-faint)",
            border: "1px solid var(--admin-card-border)",
          }}>
          {cta}
        </span>
      ) : download ? (
        <a href={href} className={ctaClass} style={ctaStyle}>
          {cta}
        </a>
      ) : (
        <Link href={href} className={ctaClass} style={ctaStyle}>
          {cta}
        </Link>
      )}
    </div>
  );
}
