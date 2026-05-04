// Guide content shown inside the AdminSectionInfo modal on
// /admin/compliance/cookies. Documents the registry pattern in
// lib/cookie-consent/services.ts and how to wire a new tracker so the
// admin matrix and the public banner stay in sync without code changes
// in the UI layer.

import {
  AlertTriangle,
  Code2,
  Cookie,
  FileCode,
  ListChecks,
  PlugZap,
} from "lucide-react";

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

export function CookiesAdminGuide() {
  return (
    <div>
      <p style={{ margin: 0 }}>
        The cookie banner respects four GDPR/ePrivacy categories:{" "}
        <Code>cookie_necessary</Code>, <Code>cookie_preferences</Code>,{" "}
        <Code>cookie_analytics</Code>, <Code>cookie_marketing</Code>. Every
        tracker the platform uses must be declared in a typed registry so
        this admin matrix, the user-facing banner copy, and the consent
        ledger stay aligned without scattered hardcoded checks.
      </p>

      {/* ── Where the registry lives ────────────────────────────────────── */}
      <section style={sectionStyle}>
        <H icon={FileCode}>Where the registry lives</H>
        <p style={{ margin: "0 0 6px" }}>
          The single source of truth is{" "}
          <Code>lib/cookie-consent/services.ts</Code>. It exports two
          arrays:
        </p>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            <Code>COOKIE_CATEGORIES</Code> — the four GDPR categories with
            their human label and description. Don't change unless the
            schema in <Code>lib/db/schema.ts</Code> changes too.
          </li>
          <li>
            <Code>COOKIE_SERVICES</Code> — one entry per service that
            depends on a category. This is the file you edit when you add
            a tracker.
          </li>
        </ul>
      </section>

      {/* ── How to add a new service ────────────────────────────────────── */}
      <section style={sectionStyle}>
        <H icon={PlugZap}>How to add a new service</H>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          <li>
            Pick the right category. Marketing pixels and ad retargeting go
            in <Code>cookie_marketing</Code>. Anonymous page-view counters go
            in <Code>cookie_analytics</Code>. UI persistence (theme, locale,
            saved filters) goes in <Code>cookie_preferences</Code>. Session,
            CSRF and consent storage go in <Code>cookie_necessary</Code>.
          </li>
          <li>
            Append a new entry to <Code>COOKIE_SERVICES</Code>:
            <pre style={blockStyle}>{`{
  id: "google_analytics",      // unique, lowercase_snake_case
  name: "Google Analytics 4",  // shown in admin + tooltips
  category: "cookie_analytics",
  description:
    "Anonymous page-view counter and UTM tracking. " +
    "Loaded only after explicit user opt-in.",
  firstParty: false,           // true if we own the cookie
  provider: "Google LLC",
  providerPolicyUrl:
    "https://policies.google.com/privacy",
}`}</pre>
          </li>
          <li>
            Gate the actual <i>script load</i> on the user's consent.
            Pattern (in <Code>app/layout.tsx</Code> or wherever the script
            is mounted):
            <pre style={blockStyle}>{`const cookieConsent = await readCookieConsent();
const gaAllowed =
  settings["gdpr.cookie_banner.enabled"] === "true" &&
  cookieConsent.prefs.analytics;
// ...
{gaAllowed && <Script src="..." />}`}</pre>
            Without this gate the registry is just documentation: the
            cookie would be set regardless of opt-in and the platform
            would be non-compliant.
          </li>
          <li>
            Reload <Code>/admin/compliance/cookies</Code>. The new service
            shows up automatically under the chosen category — no UI code
            changes are needed here.
          </li>
        </ol>
      </section>

      {/* ── First-party vs third-party ─────────────────────────────────── */}
      <section style={sectionStyle}>
        <H icon={Cookie}>First-party vs third-party</H>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            <b>First-party</b> (<Code>firstParty: true</Code>) — cookies we
            set ourselves, served from our domain. Examples: session cookie,
            CSRF token, consent state. Don't need a{" "}
            <Code>provider</Code> or <Code>providerPolicyUrl</Code>.
          </li>
          <li>
            <b>Third-party</b> (<Code>firstParty: false</Code>) — cookies
            set by an external SDK loaded on the page. Always fill in{" "}
            <Code>provider</Code> (legal entity name, not just the
            product) and <Code>providerPolicyUrl</Code> — both end up in
            the cookie policy page and in this admin view.
          </li>
        </ul>
      </section>

      {/* ── What this view shows ───────────────────────────────────────── */}
      <section style={sectionStyle}>
        <H icon={ListChecks}>How to read the matrix below</H>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            <b>Always on</b> — the category is technical (Art. 5(3)
            ePrivacy). It runs even with the banner disabled. Logged in the
            ledger as <Code>granted</Code> for audit completeness.
          </li>
          <li>
            <b>Blocked (banner OFF)</b> — the master switch is off, so this
            non-essential category can never opt in. Useful while you're
            still drafting the cookie policy.
          </li>
          <li>
            <b>User opt-in</b> — the master switch is on; whether the
            services run depends on each visitor's choice on the banner.
          </li>
        </ul>
      </section>

      {/* ── Common mistakes ────────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <H icon={AlertTriangle}>Common mistakes</H>
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
            Adding a service to the registry but forgetting to gate its
            script load is the most frequent regression. The registry is
            documentation — it does <b>not</b> automatically prevent the
            cookie from being set. Always pair the registry change with a
            consent check at the mount site.
          </div>
        </div>
        <ul style={{ margin: "10px 0 0", paddingLeft: 18 }}>
          <li>
            Don't reuse an <Code>id</Code> across services — it must be
            unique. The admin sorts services by category but uses{" "}
            <Code>id</Code> as React key.
          </li>
          <li>
            Don't put a tracker in <Code>cookie_necessary</Code> just because
            "the site needs it to work the way we want". Necessary means
            <i> the user requested </i> it (session, CSRF). Analytics never
            qualifies — even when business-critical.
          </li>
          <li>
            When you remove a service, remove the registry entry{" "}
            <i>and</i> the script-load site at the same commit. A leftover
            entry in the matrix that no longer ships any cookie misleads
            audits.
          </li>
        </ul>
      </section>

      {/* ── Schema reference ───────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <H icon={Code2}>Schema reference</H>
        <p style={{ margin: 0 }}>
          The four <Code>consent_type</Code> values come from{" "}
          <Code>CONSENT_TYPES</Code> in <Code>lib/db/schema.ts</Code> and
          are persisted in <Code>consent_records</Code> with{" "}
          <Code>source = &quot;cookie_banner&quot;</Code> and{" "}
          <Code>metadata.variant ∈ {`{accept_all, reject_all, custom}`}</Code>
          . Adding a fifth category is a schema change (new value in the
          enum, migration, type union, registry update) — not a UI change.
        </p>
      </section>
    </div>
  );
}
