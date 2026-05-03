// Guide content shown inside the AdminSectionInfo modal next to the
// "Compliance / GDPR" page title. Explains the 4 requirement markers
// applied to each setting in the form below, with the GDPR article
// references that justify each label.

import { ScrollText, Sparkles, BookOpen } from "lucide-react";
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

export function GdprLegendGuide() {
  return (
    <div>
      <p style={{ margin: 0 }}>
        Each setting below is tagged with one of four markers so it&apos;s
        clear at a glance what the law actually demands and what is just an
        operational preference. The mapping is conservative — if a setting
        could be argued either way, we lean toward the stricter label.
      </p>

      <section style={sectionStyle}>
        <H icon={ScrollText}>What the markers mean</H>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          <Row
            level="required"
            description={
              <>
                Mandatory for GDPR compliance. Disabling or misconfiguring
                puts you in a breach posture — you would not be able to meet a
                request from the data subject or the supervisory authority.
              </>
            }
          />
          <Row
            level="recommended"
            description={
              <>
                Strong best practice from EDPB / Garante guidance. Not strict
                law text, but if you deviate you should be able to justify
                why during an audit.
              </>
            }
          />
          <Row
            level="optional"
            description={
              <>
                Operational preference. Switching it does not affect GDPR
                compliance — it only changes the user experience or the
                operational bookkeeping.
              </>
            }
          />
          <Row
            level="unused"
            description={
              <>
                Setting is persisted for backward compatibility but no code
                path reads it any more. Will be removed in a future cleanup.
              </>
            }
          />
        </ul>
      </section>

      <section style={sectionStyle}>
        <H icon={BookOpen}>Article references behind &ldquo;Required&rdquo;</H>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            <b>Art. 7(1)</b> — &ldquo;the controller shall be able to
            demonstrate that the data subject has consented&rdquo;. This is
            why the consent ledger itself (and the metadata that make a
            record probative — IP, IP strategy) are Required.
          </li>
          <li>
            <b>Art. 17</b> — Right to erasure. A working deletion grace
            period and the ability to wipe consent records on request are
            Required; the specific number of days is operational.
          </li>
          <li>
            <b>ePrivacy Directive (2002/58/EC) + GDPR</b> — non-technical
            cookies require prior, opt-in consent collected through a banner.
            That makes the cookie banner master switch Required as soon as
            you ship to EU traffic.
          </li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <H icon={Sparkles}>Caveat</H>
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
            These markers are a pragmatic shortcut, not legal advice. For a
            GDPR audit, ground-truth is the regulation text and your DPO /
            legal counsel — the labels here help you focus their attention.
          </span>
        </div>
      </section>
    </div>
  );
}
