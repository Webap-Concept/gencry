"use client";

// Contenuto della guida "Come modificare un cron". Va passato come
// `children` di <AdminSectionInfo> (pattern standard admin per le
// guide sezione). Riusato in /admin/settings/cron e
// /admin/modules/<slug>/cron.
import { useTranslations } from "next-intl";

export function CronAdminGuide() {
  const t = useTranslations("admin.cron");

  return (
    <div className="space-y-4">
      <p>{t("guideIntro")}</p>

      <SectionTitle>{t("guideAlterTitle")}</SectionTitle>
      <p>{t("guideAlterIntro")}</p>
      <Code>{`SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'modules-prices-sync'),
  schedule := '* * * * *'
);`}</Code>

      <SectionTitle>{t("guideUnscheduleTitle")}</SectionTitle>
      <p>{t("guideUnscheduleIntro")}</p>
      <Code>{`SELECT cron.unschedule('modules-prices-sync');`}</Code>

      <SectionTitle>{t("guideTipsTitle")}</SectionTitle>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        <li style={{ marginBottom: 6 }}>{t("guideTip1")}</li>
        <li style={{ marginBottom: 6 }}>{t("guideTip2")}</li>
        <li>{t("guideTip3")}</li>
      </ul>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4
      style={{
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: "var(--admin-text-faint)",
        margin: "16px 0 8px",
      }}>
      {children}
    </h4>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre
      style={{
        background: "var(--admin-page-bg)",
        border: "1px solid var(--admin-input-border)",
        borderRadius: 8,
        padding: "10px 12px",
        fontSize: 11.5,
        lineHeight: 1.5,
        fontFamily: "var(--font-mono, monospace)",
        color: "var(--admin-text)",
        overflowX: "auto",
        margin: "0 0 12px",
      }}>
      {children}
    </pre>
  );
}
