// Guide content shown inside the AdminSectionInfo modal on
// /admin/services/dependencies. Spiega come leggere i segnali della
// dashboard e come si integra con Dependabot.

import { AlertTriangle, GitBranch, ShieldAlert, Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";

const sectionStyle: React.CSSProperties = { marginTop: 18 };
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

export async function DependenciesGuide() {
  const t = await getTranslations("admin.services.dependencies.guide");
  return (
    <div>
      <p style={{ margin: 0 }}>{t.rich("intro", richTags)}</p>

      <section style={sectionStyle}>
        <H icon={Sparkles}>{t("riskHeading")}</H>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>{t.rich("riskCurrent", richTags)}</li>
          <li>{t.rich("riskLow", richTags)}</li>
          <li>{t.rich("riskMedium", richTags)}</li>
          <li>{t.rich("riskHigh", richTags)}</li>
          <li>{t.rich("riskVulnerable", richTags)}</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <H icon={GitBranch}>{t("dependabotHeading")}</H>
        <p style={{ margin: 0 }}>{t.rich("dependabotBody", richTags)}</p>
      </section>

      <section style={sectionStyle}>
        <H icon={AlertTriangle}>{t("breakingHeading")}</H>
        <p style={{ margin: 0 }}>{t.rich("breakingBody", richTags)}</p>
      </section>

      <section style={sectionStyle}>
        <H icon={ShieldAlert}>{t("securityHeading")}</H>
        <p style={{ margin: 0 }}>{t.rich("securityBody", richTags)}</p>
      </section>
    </div>
  );
}
