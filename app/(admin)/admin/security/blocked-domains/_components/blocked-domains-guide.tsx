// Guide content shown inside the AdminSectionInfo modal on
// /admin/security/blocked-domains. Spiega cosa fa il blocco, dove viene
// applicato, e quali dipendenze esterne richiede (nessuna oltre Postgres).

import { Database, Globe2, Mail, ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";

const sectionStyle: React.CSSProperties = { marginTop: 18 };
const headingStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  fontWeight: 600,
  color: "var(--admin-text)",
  margin: "0 0 8px",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};
const codeStyle: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12,
  background: "var(--admin-hover-bg)",
  padding: "1px 5px",
  borderRadius: 4,
  color: "var(--admin-text)",
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
  c: (chunks: React.ReactNode) => <Code>{chunks}</Code>,
};

export async function BlockedDomainsGuide() {
  const t = await getTranslations("admin.security.blockedDomains.guide");
  return (
    <div>
      <p style={{ margin: 0 }}>{t.rich("intro", richTags)}</p>

      <section style={sectionStyle}>
        <H icon={Mail}>{t("howHeading")}</H>
        <p style={{ margin: 0 }}>{t.rich("howBody", richTags)}</p>
      </section>

      <section style={sectionStyle}>
        <H icon={ShieldCheck}>{t("whenHeading")}</H>
        <p style={{ margin: 0 }}>{t.rich("whenBody", richTags)}</p>
      </section>

      <section style={sectionStyle}>
        <H icon={Globe2}>{t("examplesHeading")}</H>
        <p style={{ margin: 0 }}>{t.rich("examplesBody", richTags)}</p>
      </section>

      <section style={sectionStyle}>
        <H icon={Database}>{t("dependenciesHeading")}</H>
        <p style={{ margin: 0 }}>{t.rich("dependenciesBody", richTags)}</p>
      </section>
    </div>
  );
}
