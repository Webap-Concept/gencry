// Guide content shown inside the AdminSectionInfo modal on
// /admin/security/ip-rules. Spiega i due layer di enforcement, la
// precedenza allow/deny, il supporto CIDR/IPv6 e il design perf-first.

import {
  Lock,
  Network,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from "lucide-react";
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

export async function IpRulesGuide() {
  const t = await getTranslations("admin.security.ipRules.guide");
  return (
    <div>
      <p style={{ margin: 0 }}>{t.rich("intro", richTags)}</p>

      <section style={sectionStyle}>
        <H icon={ShieldCheck}>{t("authHeading")}</H>
        <p style={{ margin: 0 }}>{t.rich("authBody", richTags)}</p>
      </section>

      <section style={sectionStyle}>
        <H icon={Lock}>{t("adminHeading")}</H>
        <p style={{ margin: 0 }}>{t.rich("adminBody", richTags)}</p>
      </section>

      <section style={sectionStyle}>
        <H icon={ShieldAlert}>{t("precedenceHeading")}</H>
        <p style={{ margin: 0 }}>{t.rich("precedenceBody", richTags)}</p>
      </section>

      <section style={sectionStyle}>
        <H icon={Network}>{t("cidrHeading")}</H>
        <p style={{ margin: 0 }}>{t.rich("cidrBody", richTags)}</p>
      </section>

      <section style={sectionStyle}>
        <H icon={Zap}>{t("perfHeading")}</H>
        <p style={{ margin: 0 }}>{t.rich("perfBody", richTags)}</p>
      </section>
    </div>
  );
}
