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

export function SessionsAdminGuide() {
  return (
    <div>
      <p style={{ margin: 0 }}>
        This page surfaces every active and historical login session, plus the
        suspicious-session alerts produced by the Tier-1 detection pipeline.
        Below is the operator's guide: how it performs, what to monitor, and
        how to tune it if anything ever drifts.
      </p>

      {/* ── Performance impact ─────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <H icon={Gauge}>Performance impact</H>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            <b>Public app:</b> zero. No detector touches user-facing requests
            — sign-in, page loads and session validation are unchanged.
          </li>
          <li>
            <b>Admin pages:</b> +1 indexed{" "}
            <Code>COUNT(*) GROUP BY severity</Code> when this page renders.
            Trivial cost (idx_session_alerts_unack).
          </li>
          <li>
            <b>Cron <Code>sessions-suspicious-detection</Code>:</b> runs every
            15 minutes out-of-band. ~14 SQL queries over short time windows
            (24h max) plus pipelined Redis ops. Never blocks user requests.
          </li>
        </ul>
      </section>

      {/* ── What to monitor ────────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <H icon={Activity}>What to monitor</H>
        <p style={{ margin: "0 0 6px" }}>
          One metric matters: the <Code>durationMs</Code> returned by the
          cron route. Inspect it in <Code>cron.job_run_details</Code> on
          Supabase, in Vercel function logs, or in{" "}
          <Code>/admin/settings/cron</Code>.
        </p>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            <b>&lt; 10 s</b> — green, no action.
          </li>
          <li>
            <b>10–30 s</b> — keep an eye, especially as sessions volume grows.
          </li>
          <li>
            <b>&gt; 30 s</b> — time to tune (see below).
          </li>
        </ul>
      </section>

      {/* ── Heavy detectors ───────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <H icon={Database}>Detectors that grow heavier at scale</H>
        <p style={{ margin: "0 0 6px" }}>
          Ten of the thirteen heuristics scan only the last 24h or current
          active sessions — they stay cheap. These three may need attention
          past a few thousand active sessions:
        </p>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          <li>
            <b><Code>long_idle_resurrect</Code></b> — keeps a Redis snapshot
            per active session.{" "}
            <i>Already pipelined</i>: one MGET + one batched SET-EX per tick,
            so the cost is ~2 round-trips per 500 sessions instead of 2× per
            session. If it ever creeps up, tighten the SQL window further.
          </li>
          <li>
            <b><Code>off_baseline_hours</Code></b> — recomputes a per-user
            hour percentile over 30 days each tick. Mitigation: cache the
            baseline in Redis with a 24h TTL (a future optimization).
          </li>
          <li>
            <b><Code>new_subnet</Code></b> — aggregates 90 days of session
            history per recently active user. Mitigation: lower{" "}
            <Code>lookbackDays</Code> in settings (default 90), or precompute
            a per-user "known subnets" set.
          </li>
        </ol>
      </section>

      {/* ── Mitigations ───────────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <H icon={Settings}>Mitigations available right now</H>
        <p style={{ margin: "0 0 6px" }}>
          All from <Code>/admin/settings/notifications</Code>, no code change:
        </p>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            <b>Disable a single rule</b> — the offending heuristic stops
            running, the rest keeps working.
          </li>
          <li>
            <b>Tune thresholds per rule</b> — raise <Code>count</Code>, lower{" "}
            <Code>windowHours</Code>, etc. Higher thresholds = fewer alerts.
          </li>
          <li>
            <b>Dry-run mode</b> — alerts are logged for audit but no email or
            panel notification is sent. Useful when tuning thresholds without
            spamming admins.
          </li>
          <li>
            <b>Email schedule = off</b> — silence the digest while still
            seeing alerts in the Alerts tab and the bell.
          </li>
          <li>
            <b>Severity threshold</b> — bump to <Code>warning</Code> or{" "}
            <Code>critical</Code> to suppress info-level noise.
          </li>
        </ul>
      </section>

      {/* ── Indicators of trouble ─────────────────────────────────────── */}
      <section style={sectionStyle}>
        <H icon={AlertTriangle}>When to dig deeper</H>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>Cron duration consistently &gt; 30 s.</li>
          <li>
            <Code>session_alerts</Code> growing fast → likely a noisy rule
            with thresholds too low.
          </li>
          <li>
            Many <Code>cron.job_run_details</Code> failures with{" "}
            <Code>relation "session_alerts" does not exist</Code> → SQL
            migration not applied.
          </li>
          <li>
            Redis errors in Vercel logs around{" "}
            <Code>[detect/long_idle_resurrect]</Code> → Upstash quota or
            connectivity issue. Detector fails closed (skips the tick).
          </li>
        </ul>
      </section>

      {/* ── How the alert/notification flow works ──────────────────────── */}
      <section style={sectionStyle}>
        <H icon={ShieldCheck}>How alerts flow through the system</H>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          <li>
            Cron runs the 13 detectors → each returns candidate alerts with a
            deterministic <Code>dedup_key</Code>.
          </li>
          <li>
            Insert into <Code>session_alerts</Code> with{" "}
            <Code>ON CONFLICT DO NOTHING</Code> — same incident never
            duplicates.
          </li>
          <li>
            If above the severity threshold and not in dry-run, an email
            digest is queued (instant / hourly / daily).
          </li>
          <li>
            The notifications dispatcher picks up unacknowledged alerts and
            shows them in the bell, grouped by severity.
          </li>
          <li>
            An admin reviews the Alerts tab, acknowledges or revokes the
            session — the panel notification auto-resolves when the bucket
            empties.
          </li>
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
            Detect-only by design: alerts never auto-revoke a session. Either
            an admin acts manually, or the existing session lifecycle (idle
            timeout, expiry, password change) takes over.
          </span>
        </div>
      </section>
    </div>
  );
}
