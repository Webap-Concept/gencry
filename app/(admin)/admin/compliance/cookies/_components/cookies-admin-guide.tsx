// Guide content shown inside the AdminSectionInfo modal on
// /admin/compliance/cookies. Documents the registry pattern and how to
// wire a new tracker so the admin matrix and the public banner stay in
// sync without code changes in the UI layer.

import {
  AlertTriangle,
  Code2,
  Cookie,
  ListChecks,
  PlugZap,
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

const blockStyle: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12,
  background: "var(--admin-hover-bg, rgba(255,255,255,0.06))",
  padding: "10px 12px",
  borderRadius: 6,
  color: "var(--admin-text, #cdccca)",
  whiteSpace: "pre",
  overflowX: "auto",
  marginTop: 6,
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

export async function CookiesAdminGuide() {
  const t = await getTranslations("admin.compliance.cookies.guide");
  return (
    <div>
      <p style={{ margin: 0 }}>{t.rich("intro", richTags)}</p>

      {/* ── How to add a new service ────────────────────────────────────── */}
      <section style={sectionStyle}>
        <H icon={PlugZap}>{t("addServiceHeading")}</H>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          <li>{t.rich("addStep1", richTags)}</li>
          <li>{t.rich("addStep2", richTags)}</li>
          <li>
            {t.rich("addStep3Mid", richTags)}
            <pre style={blockStyle}>{`const cookieConsent = await readCookieConsent();
const gaAllowed =
  settings["gdpr.cookie_banner.enabled"] === "true" &&
  cookieConsent.prefs.analytics;
// ...
{gaAllowed && <Script src="..." />}`}</pre>
            {t("addStep3Footer")}
          </li>
        </ol>
      </section>

      {/* ── First-party vs third-party ─────────────────────────────────── */}
      <section style={sectionStyle}>
        <H icon={Cookie}>{t("partyHeading")}</H>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>{t.rich("firstPartyDesc", richTags)}</li>
          <li>{t.rich("thirdPartyDesc", richTags)}</li>
        </ul>
      </section>

      {/* ── What this view shows ───────────────────────────────────────── */}
      <section style={sectionStyle}>
        <H icon={ListChecks}>{t("matrixHeading")}</H>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>{t.rich("matrixAlwaysOn", richTags)}</li>
          <li>{t.rich("matrixBlocked", richTags)}</li>
          <li>{t.rich("matrixUserOptIn", richTags)}</li>
        </ul>
      </section>

      {/* ── Common mistakes ────────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <H icon={AlertTriangle}>{t("mistakesHeading")}</H>
        <div style={calloutStyle}>
          <AlertTriangle
            size={14}
            style={{
              color: "var(--admin-accent)",
              marginTop: 2,
              flexShrink: 0,
            }}
          />
          <div style={{ fontSize: 12 }}>
            {t.rich("mistakesCallout", richTags)}
          </div>
        </div>
        <ul style={{ margin: "10px 0 0", paddingLeft: 18 }}>
          <li>{t.rich("mistakeMisuse", richTags)}</li>
          <li>{t.rich("mistakeRemoval", richTags)}</li>
        </ul>
      </section>

      {/* ── Schema reference ───────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <H icon={Code2}>{t("schemaHeading")}</H>
        <p style={{ margin: 0 }}>
          {t.rich("schemaBody", {
            ...richTags,
            literalOpen: "{",
            literalClose: "}",
          })}
        </p>
      </section>
    </div>
  );
}
