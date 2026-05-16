import { buildAdminPath, getAdminPath } from "@/lib/admin-paths";
import { getAppSettings } from "@/lib/db/settings-queries";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";
import ConsentStatusDashboardLoader from "./_components/consent-status-dashboard-loader";
import { GdprSettingsForm } from "./_components/gdpr-settings-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.compliance.gdpr");
  return { title: t("metaTitle") };
}

export const dynamic = "force-dynamic";

export default async function GdprCompliancePage() {
  const tG = await getTranslations("admin.compliance.gdpr");
  const tTools = await getTranslations("admin.compliance.gdpr.tools");
  // We DON'T await stats/health here — they are the slowest leaf on the
  // page and we want the header + settings form + tools to paint before
  // the metrics section. The loader inside <Suspense> below owns those
  // calls. Settings + paths are cached/cheap and stay in the fast path.
  const [settings, pagesPath, exportPath, logsPath, cookiesPath] =
    await Promise.all([
      getAppSettings(),
      getAdminPath("content-pages"),
      buildAdminPath("/compliance/gdpr/export"),
      getAdminPath("logs"),
      getAdminPath("compliance-cookies"),
    ]);

  return (
    <div className="space-y-8">
      {/* Section 1 — current consent status. Behind its own Suspense
          boundary so the page paints header/settings/tools immediately
          and the metrics section streams in once the consolidated
          users aggregate lands. */}
      <Suspense fallback={<ConsentStatusSkeleton />}>
        <ConsentStatusDashboardLoader
          consentLogEnabled={settings["gdpr.consent_log.enabled"] === "true"}
          backupTier={settings["gdpr.backup.tier"]}
          pagesAdminPath="/admin/content/pages"
        />
      </Suspense>

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
          supabaseService={{
            configured:
              !!settings.supabase_pat?.trim() &&
              !!settings.supabase_project_ref?.trim(),
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
            href={pagesPath}
            cta={tTools("editPolicyCta")}
          />
          <ToolRow
            title={tTools("exportCsvTitle")}
            description={tTools("exportCsvDesc")}
            href={exportPath}
            cta={tTools("exportCsvCta")}
            download
          />
          <ToolRow
            title={tTools("activityLogsTitle")}
            description={tTools("activityLogsDesc")}
            href={logsPath}
            cta={tTools("activityLogsCta")}
          />
          <ToolRow
            title={tTools("cookieSettingsTitle")}
            description={tTools("cookieSettingsDesc")}
            href={cookiesPath}
            cta={tTools("cookieSettingsCta")}
          />
        </div>
      </section>
    </div>
  );
}

// Skeleton placeholder for the metrics section while the consolidated
// users aggregate is in flight. Same vertical rhythm and approximate
// tile count as the real <ConsentStatusDashboard> so the page doesn't
// jump when the data lands.
function ConsentStatusSkeleton() {
  const tile: React.CSSProperties = {
    background: "var(--admin-card-bg)",
    border: "1px solid var(--admin-card-border)",
  };
  const bar: React.CSSProperties = {
    background: "var(--admin-hover-bg)",
  };
  return (
    <div className="space-y-5 animate-pulse">
      <section>
        <div className="h-4 w-32 rounded mb-3" style={bar} />
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg p-3 h-14" style={tile} />
          ))}
        </div>
      </section>
      <section>
        <div className="h-4 w-40 rounded mb-3" style={bar} />
        <div className="grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg p-4 h-20" style={tile} />
          ))}
        </div>
      </section>
      <section>
        <div className="h-4 w-36 rounded mb-3" style={bar} />
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-lg p-4 h-20" style={tile} />
          ))}
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
