import { AdminSectionInfo } from "@/app/(admin)/admin/_components/section-info";
import { getAppSettings } from "@/lib/db/settings-queries";
import {
  getGdprDashboardStats,
  getGdprHealthChecks,
} from "@/lib/account/gdpr-stats";
import { ScrollText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ConsentStatusDashboard } from "./_components/consent-status-dashboard";
import { GdprLegendGuide } from "./_components/gdpr-legend-guide";
import { GdprSettingsForm } from "./_components/gdpr-settings-form";

export const metadata: Metadata = { title: "Compliance / GDPR" };

export const dynamic = "force-dynamic";

export default async function GdprCompliancePage() {
  const [settings, stats, health] = await Promise.all([
    getAppSettings(),
    getGdprDashboardStats(),
    getGdprHealthChecks(),
  ]);

  return (
    <div className="space-y-8">
      <header className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background:
              "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))",
            border:
              "1px solid color-mix(in srgb, var(--admin-accent) 25%, transparent)",
          }}>
          <ScrollText size={18} style={{ color: "var(--admin-accent)" }} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2
              className="text-lg font-bold"
              style={{ color: "var(--admin-text)" }}>
              <span style={{ color: "var(--admin-text-muted)" }}>
                Compliance
              </span>
              <span style={{ color: "var(--admin-text-faint)" }}> / </span>
              <span>GDPR &amp; Consents</span>
            </h2>
            <AdminSectionInfo
              title="GDPR settings — operator's guide"
              ariaLabel="Show GDPR settings guide">
              <GdprLegendGuide />
            </AdminSectionInfo>
          </div>
          <p
            className="text-sm mt-0.5"
            style={{ color: "var(--admin-text-faint)" }}>
            Compliance dashboard and runtime configuration for consent
            management, data retention and right-to-be-forgotten flows.
          </p>
        </div>
      </header>

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
          Settings
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
            "gdpr.deletion.grace_days": settings["gdpr.deletion.grace_days"],
            "gdpr.export.rate_limit_days":
              settings["gdpr.export.rate_limit_days"],
            "gdpr.policy.force_reconsent_on_change":
              settings["gdpr.policy.force_reconsent_on_change"],
            "gdpr.cookie_banner.enabled":
              settings["gdpr.cookie_banner.enabled"],
          }}
        />
      </section>

      {/* Section 3 — tools */}
      <section>
        <h2
          className="text-sm font-semibold mb-3"
          style={{ color: "var(--admin-text)" }}>
          Tools
        </h2>
        <div
          className="rounded-xl shadow-sm p-6 space-y-3"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          <ToolRow
            title="Edit policy texts"
            description="Open the CMS editor for Terms, Privacy and Marketing pages. Saving a new content version automatically snapshots the previous one in page_versions."
            href="/admin/content/pages"
            cta="Open Pages →"
          />
          <ToolRow
            title="Export consent ledger (CSV)"
            description="Download every row of consent_records as a UTF-8 CSV (BOM-prefixed for Excel) for offline audit. Includes user email when still available."
            href="/admin/compliance/gdpr/export"
            cta="Download CSV →"
            download
          />
          <ToolRow
            title="View activity logs"
            description="Sign-in / sign-up / delete-account events with IP and timestamps."
            href="/admin/logs"
            cta="Open Activity Logs →"
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
