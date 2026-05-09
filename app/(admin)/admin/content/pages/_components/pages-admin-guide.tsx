// Guide content shown inside the AdminSectionInfo modal on
// /admin/content/pages. Documents the two-tab split (user CMS pages vs
// system pages), what's editable on each, and the slug-lock policy for
// system pages bound to a hardcoded route handler.

import {
  AlertTriangle,
  FileCode,
  Layers,
  Link2,
  Lock,
  PenLine,
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

export async function PagesAdminGuide() {
  const t = await getTranslations("admin.content.pages.guide");
  return (
    <div>
      <p style={{ margin: 0 }}>{t.rich("intro", richTags)}</p>

      <section style={sectionStyle}>
        <H icon={Layers}>{t("flavorsHeading")}</H>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>{t.rich("flavorsEditorial", richTags)}</li>
          <li>{t.rich("flavorsMetaOnly", richTags)}</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <H icon={PenLine}>{t("editHeading")}</H>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>{t.rich("editTitle", richTags)}</li>
          <li>{t.rich("editSlug", richTags)}</li>
          <li>{t.rich("editContent", richTags)}</li>
          <li>{t.rich("editVisibility", richTags)}</li>
          <li>{t.rich("editSeo", richTags)}</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <H icon={Lock}>{t("lockedHeading")}</H>
        <p style={{ margin: 0 }}>{t.rich("lockedBody", richTags)}</p>
      </section>

      <section style={sectionStyle}>
        <H icon={Link2}>{t("placeholdersHeading")}</H>
        <p style={{ margin: 0 }}>{t("placeholdersIntro")}</p>
        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
          <li>{t.rich("placeholdersAppVars", richTags)}</li>
          <li>{t.rich("placeholdersEmail", richTags)}</li>
          <li>{t.rich("placeholdersYear", richTags)}</li>
        </ul>
        <p style={{ margin: "6px 0 0" }}>
          {t.rich("placeholdersExample", richTags)}
        </p>
      </section>

      <section style={sectionStyle}>
        <H icon={FileCode}>{t("dataHeading")}</H>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>{t.rich("dataPagesTable", richTags)}</li>
          <li>{t.rich("dataSeoTable", richTags)}</li>
          <li>{t.rich("dataWhitelist", richTags)}</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <H icon={AlertTriangle}>{t("mistakesHeading")}</H>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>{t.rich("mistakesSeoConflict", richTags)}</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <H icon={ShieldCheck}>{t("schemaHeading")}</H>
        <p style={{ margin: 0 }}>{t.rich("schemaBody", richTags)}</p>
      </section>
    </div>
  );
}
