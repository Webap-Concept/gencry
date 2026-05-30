// Guide content shown inside the AdminSectionInfo modal on
// /admin/services/qstash. Same visual style as the Redis guide. Hardcoded
// English copy (operator-facing), consistent with the other service guides.

import { AlarmClock, Key, ShieldCheck, Wrench } from "lucide-react";

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

const calloutStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  padding: "10px 12px",
  borderRadius: 8,
  background: "color-mix(in srgb, var(--admin-accent) 8%, var(--admin-card-bg))",
  border: "1px solid color-mix(in srgb, var(--admin-accent) 25%, transparent)",
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

export function QstashAdminGuide() {
  return (
    <div>
      <p style={{ margin: 0 }}>
        QStash is Upstash's HTTP scheduler. It replaces the{" "}
        <Code>pg_cron + net.http_get()</Code> pattern: instead of the database
        calling our <Code>/api/cron/*</Code> endpoints (which generates pooler
        egress and has no retries), QStash calls them on a schedule from
        outside, with automatic retries, dead-letter queue and per-run logs.
      </p>

      <section style={sectionStyle}>
        <H icon={Key}>Credentials</H>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            <b>QStash token</b> — required. From the Upstash Console → QStash →
            "Details", the <Code>QSTASH_TOKEN</Code>. Used to create and manage
            schedules via the REST API.
          </li>
          <li>
            <b>Signing keys</b> (current / next) — optional. Used to verify the{" "}
            <Code>Upstash-Signature</Code> header on incoming requests, as
            defense-in-depth on top of the existing <Code>CRON_SECRET</Code>{" "}
            bearer check. Safe to leave empty for now.
          </li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <H icon={AlarmClock}>How scheduling will work</H>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            Each cron becomes a QStash <b>Schedule</b> (a cron expression + a
            target URL) pointing at the existing <Code>/api/cron/*</Code>{" "}
            endpoint — the endpoints themselves do not change.
          </li>
          <li>
            QStash sends <Code>Authorization: Bearer &lt;CRON_SECRET&gt;</Code>{" "}
            on every call, so <Code>isAuthorizedCron</Code> keeps working
            unchanged.
          </li>
          <li>
            Schedules are defined as versioned code (see the upcoming{" "}
            <Code>scripts/qstash-sync-schedules.ts</Code>) so they are
            reproducible across environments — not hand-edited in the
            dashboard.
          </li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <H icon={ShieldCheck}>Failure modes</H>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            A failed endpoint call is <b>retried automatically</b> by QStash
            (exponential backoff) and lands in the DLQ if it keeps failing —
            visible in the Upstash Console.
          </li>
          <li>
            All <Code>/api/cron/*</Code> endpoints are idempotent (advisory
            locks / SKIP LOCKED), so a retry or an overlapping run is safe.
          </li>
        </ul>
        <div style={calloutStyle}>
          <ShieldCheck
            size={14}
            style={{ color: "var(--admin-accent)", flexShrink: 0, marginTop: 2 }}
          />
          <span style={{ fontSize: 12.5, lineHeight: 1.55 }}>
            Migration is incremental and reversible: QStash and pg_cron can run
            in parallel during cutover (endpoints are idempotent), and you roll
            back by re-enabling the pg_cron job.
          </span>
        </div>
      </section>

      <section style={sectionStyle}>
        <H icon={Wrench}>Operating tips</H>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            <b>Test connection</b> — the button below issues a single
            authenticated <Code>GET /v2/schedules</Code>: <Code>200</Code>{" "}
            means the token is valid. No side effects.
          </li>
          <li>
            <b>Rotate the token</b> — saving here updates the stored value; the
            schedule sync script picks it up on its next run.
          </li>
        </ul>
      </section>
    </div>
  );
}
