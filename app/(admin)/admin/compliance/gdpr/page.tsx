import { getAppSettings } from "@/lib/db/settings-queries";
import {
  getGdprDashboardStats,
  getGdprHealthChecks,
} from "@/lib/account/gdpr-stats";
import type { Metadata } from "next";
import Link from "next/link";
import { ConsentStatusDashboard } from "./_components/consent-status-dashboard";
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
      <header>
        <h1
          className="text-xl font-semibold"
          style={{ color: "var(--admin-text)" }}>
          GDPR &amp; Consents
        </h1>
        <p
          className="text-xs mt-1 max-w-3xl"
          style={{ color: "var(--admin-text-faint)" }}>
          Compliance dashboard and runtime configuration for consent
          management, data retention and right-to-be-forgotten flows. Settings
          marked as &ldquo;follow-up PR&rdquo; are persisted now but their
          consumers ship in subsequent pull requests.
        </p>
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
            description="Dump all consent_records as a CSV for offline audit. Available once consent logging is enabled and the migration is applied."
            disabled
            cta="Coming in PR-1"
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
}: {
  title: string;
  description: string;
  href?: string;
  cta: string;
  disabled?: boolean;
}) {
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
          className="text-xs px-3 py-1.5 rounded-lg shrink-0"
          style={{
            background: "var(--admin-page-bg)",
            color: "var(--admin-text-faint)",
            border: "1px solid var(--admin-card-border)",
          }}>
          {cta}
        </span>
      ) : (
        <Link
          href={href}
          className="text-xs px-3 py-1.5 rounded-lg shrink-0"
          style={{
            background: "var(--admin-page-bg)",
            color: "var(--admin-text-muted)",
            border: "1px solid var(--admin-input-border)",
          }}>
          {cta}
        </Link>
      )}
    </div>
  );
}
