// Guide content shown inside the AdminSectionInfo modal next to the
// "Compliance / GDPR" page title. Explains the 4 requirement markers
// applied to each setting in the form below, with the GDPR article
// references that justify each label.

import { ScrollText, Sparkles, BookOpen } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { RequirementBadge } from "./requirement-badge";

const sectionStyle: React.CSSProperties = { marginTop: 18 };

const headingStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  fontWeight: 600,
  color: "var(--admin-text, #cdccca)",
  margin: "0 0 10px",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
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

function Row({
  level,
  description,
}: {
  level: "required" | "recommended" | "optional" | "unused";
  description: React.ReactNode;
}) {
  return (
    <li
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: "6px 0",
      }}>
      <span style={{ flexShrink: 0, marginTop: 1 }}>
        <RequirementBadge level={level} />
      </span>
      <span>{description}</span>
    </li>
  );
}

export async function GdprLegendGuide() {
  const t = await getTranslations("admin.compliance.gdpr.legendGuide");
  const richTags = {
    b: (chunks: React.ReactNode) => <b>{chunks}</b>,
  };
  return (
    <div>
      <p style={{ margin: 0 }}>{t("intro")}</p>

      <section style={sectionStyle}>
        <H icon={ScrollText}>{t("markersHeading")}</H>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          <Row level="required" description={t("requiredDesc")} />
          <Row level="recommended" description={t("recommendedDesc")} />
          <Row level="optional" description={t("optionalDesc")} />
          <Row level="unused" description={t("unusedDesc")} />
        </ul>
      </section>

      <section style={sectionStyle}>
        <H icon={BookOpen}>{t("articleHeading")}</H>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>{t.rich("art7", richTags)}</li>
          <li>{t.rich("art17", richTags)}</li>
          <li>{t.rich("eprivacy", richTags)}</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <H icon={Sparkles}>{t("caveatHeading")}</H>
        <div style={calloutStyle}>
          <ScrollText
            size={14}
            style={{
              color: "var(--admin-accent)",
              flexShrink: 0,
              marginTop: 2,
            }}
          />
          <span style={{ fontSize: 12.5, lineHeight: 1.55 }}>
            {t("caveatBody")}
          </span>
        </div>
      </section>
    </div>
  );
}
