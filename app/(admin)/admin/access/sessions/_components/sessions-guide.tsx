// Guide content shown inside the AdminSectionInfo modal on the Sessions
// admin page. Static markup only — no state, no fetches. Lives next to
// the page so a future redesign can update it without touching the
// reusable info-modal scaffold.

import {
  Activity,
  AlertTriangle,
  Database,
  Gauge,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

const sectionStyle: React.CSSProperties = {
  marginTop: 18,
};

const headingStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  fontWeight: 600,
  color: "var(--admin-text, #cdccca)",
  margin: "0 0 8px",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const codeStyle: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12,
  background: "var(--admin-hover-bg, rgba(255,255,255,0.06))",
  padding: "1px 5px",
  borderRadius: 4,
  color: "var(--admin-text, #cdccca)",
};

const calloutStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  padding: "10px 12px",
  borderRadius: 8,
  background:
    "color-mix(in srgb, var(--admin-accent) 8%, var(--admin-card-bg))",
  border:
    "1px solid color-mix(in srgb, var(--admin-accent) 25%, transparent)",
  marginTop: 6,
};

function H({
  icon: Icon,
  children,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <h3 style={headingStyle}>
      <Icon size={13} style={{ color: "var(--admin-accent)" }} />
      {children}
    </h3>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code style={codeStyle}>{children}</code>;
}

const richTags = {
  b: (chunks: React.ReactNode) => <b>{chunks}</b>,
  i: (chunks: React.ReactNode) => <i>{chunks}</i>,
  c: (chunks: React.ReactNode) => <Code>{chunks}</Code>,
};

export async function SessionsAdminGuide() {
  const t = await getTranslations("admin.access.sessions.guide");
  return (
    <div>
      <p style={{ margin: 0 }}>{t("intro")}</p>

      {/* ── Performance impact ─────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <H icon={Gauge}>{t("perfHeading")}</H>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>{t.rich("perfPublic", richTags)}</li>
          <li>{t.rich("perfAdmin", richTags)}</li>
          <li>{t.rich("perfCron", richTags)}</li>
        </ul>
      </section>

      {/* ── What to monitor ────────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <H icon={Activity}>{t("monitorHeading")}</H>
        <p style={{ margin: "0 0 6px" }}>{t.rich("monitorIntro", richTags)}</p>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>{t.rich("monitorGreen", richTags)}</li>
          <li>{t.rich("monitorYellow", richTags)}</li>
          <li>{t.rich("monitorRed", richTags)}</li>
        </ul>
      </section>

      {/* ── Heavy detectors ───────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <H icon={Database}>{t("detectorsHeading")}</H>
        <p style={{ margin: "0 0 6px" }}>{t("detectorsIntro")}</p>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          <li>{t.rich("detectorLongIdle", richTags)}</li>
          <li>{t.rich("detectorOffBaseline", richTags)}</li>
          <li>{t.rich("detectorNewSubnet", richTags)}</li>
        </ol>
      </section>

      {/* ── Mitigations ───────────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <H icon={Settings}>{t("mitigationsHeading")}</H>
        <p style={{ margin: "0 0 6px" }}>
          {t.rich("mitigationsIntro", richTags)}
        </p>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>{t.rich("mitDisable", richTags)}</li>
          <li>{t.rich("mitTune", richTags)}</li>
          <li>{t.rich("mitDryRun", richTags)}</li>
          <li>{t.rich("mitEmailOff", richTags)}</li>
          <li>{t.rich("mitSeverity", richTags)}</li>
        </ul>
      </section>

      {/* ── Indicators of trouble ─────────────────────────────────────── */}
      <section style={sectionStyle}>
        <H icon={AlertTriangle}>{t("troubleHeading")}</H>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>{t.rich("troubleCron", richTags)}</li>
          <li>{t.rich("troubleAlertsGrowing", richTags)}</li>
          <li>{t.rich("troubleSqlMissing", richTags)}</li>
          <li>{t.rich("troubleRedisErr", richTags)}</li>
        </ul>
      </section>

      {/* ── How the alert/notification flow works ──────────────────────── */}
      <section style={sectionStyle}>
        <H icon={ShieldCheck}>{t("flowHeading")}</H>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          <li>{t.rich("flowDetect", richTags)}</li>
          <li>{t.rich("flowInsert", richTags)}</li>
          <li>{t("flowEmail")}</li>
          <li>{t("flowDispatcher")}</li>
          <li>{t("flowReview")}</li>
        </ol>
        <div style={calloutStyle}>
          <ShieldCheck
            size={14}
            style={{
              color: "var(--admin-accent)",
              flexShrink: 0,
              marginTop: 2,
            }}
          />
          <span style={{ fontSize: 12.5, lineHeight: 1.55 }}>
            {t("flowCallout")}
          </span>
        </div>
      </section>
    </div>
  );
}
