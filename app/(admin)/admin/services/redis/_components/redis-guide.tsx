// Guide content shown inside the AdminSectionInfo modal on /admin/services/redis.
// Replaces the inline "Wifi" info-card that used to live in RedisTab so the
// configuration form stays focused on credentials only.

import {
  AlertTriangle,
  Database,
  Gauge,
  Key,
  ShieldCheck,
  Wrench,
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

export function RedisAdminGuide() {
  return (
    <div>
      <p style={{ margin: 0 }}>
        Upstash Redis backs four systems in the platform. Each one degrades
        gracefully if Redis is unreachable: nothing here is on the critical
        path of authentication or page rendering — Redis just makes things
        faster and lets us do things that would be too expensive against
        Postgres alone.
      </p>

      {/* ── Where Redis is used ─────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <H icon={Database}>Where Redis is used</H>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          <li>
            <b>Bloom filter</b> — sub-millisecond email / username
            availability check during sign-up. Two pre-allocated bitmaps of
            200,000 bits each, ~1% false-positive rate up to 20k entries.
            Falls back to a Postgres query on miss.
          </li>
          <li>
            <b>Rate limiting</b> — login, sign-up and availability-check
            attempts per IP / per email, plus a permanent IP blacklist. Fixed
            window counters via <Code>INCR</Code> + <Code>EXPIRE</Code>
            (sub-millisecond, no contention).
          </li>
          <li>
            <b>Session validation cache</b> — 60-second TTL per active
            session. Without it every authenticated request would hit the{" "}
            <Code>sessions</Code> table; with it the steady state is ~1 DB
            read per session per minute.
          </li>
          <li>
            <b>Suspicious-session detection</b> — the{" "}
            <Code>long_idle_resurrect</Code> heuristic snapshots{" "}
            <Code>last_seen_at</Code> per active session every 15 min and
            compares to the previous tick. Pipelined: 1 MGET + 1 batched
            SET-EX per 500 sessions instead of 2 round-trips per session.
          </li>
        </ol>
      </section>

      {/* ── Key namespaces ──────────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <H icon={Key}>Key namespaces</H>
        <p style={{ margin: "0 0 6px" }}>
          The system creates and prunes these keys automatically — never
          edit them manually unless you know what you're doing.
        </p>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            <Code>bloom:emails</Code>, <Code>bloom:usernames</Code> —{" "}
            String/Bitmap, no TTL. Re-built by{" "}
            <Code>pnpm bloom:seed</Code> if it ever drifts.
          </li>
          <li>
            <Code>rl:login:{`{ip}:{email}`}</Code>,{" "}
            <Code>rl:email:{`{email}`}</Code>,{" "}
            <Code>rl:signup:{`{ip}`}</Code>,{" "}
            <Code>rl:check:{`{ip}`}</Code> — counters, TTL = configured
            window minutes.
          </li>
          <li>
            <Code>rl:blacklist:{`{ip}`}</Code> — permanent flag, no TTL. Set
            from <Code>/admin/security/ip-rules</Code>.
          </li>
          <li>
            <Code>session:{`{sessionId}`}</Code> — JSON snapshot, 60 s TTL.
            Invalidated on revoke / sign-out.
          </li>
          <li>
            <Code>alert:lastseen:{`{sessionId}`}</Code> — last-seen
            timestamp, TTL = <Code>idleDays × 2</Code> days. Used only by
            the suspicious-session detector.
          </li>
        </ul>
      </section>

      {/* ── Failure modes ───────────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <H icon={ShieldCheck}>Failure modes — what happens if Redis is down</H>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            <b>Bloom filter</b> → falls back to a direct Postgres lookup on
            the <Code>users</Code> / <Code>user_profiles</Code> tables. Sign-up
            keeps working, just a few hundred milliseconds slower.
          </li>
          <li>
            <b>Rate limiting</b> → falls back to the DB-backed{" "}
            <Code>login_attempts</Code> table. Bruteforce protection still
            works, latency rises a bit.
          </li>
          <li>
            <b>Session cache</b> → every request goes straight to the DB.
            App keeps working, page render time goes up by ~10–30 ms per
            authenticated request.
          </li>
          <li>
            <b>Suspicious-session detector</b> →{" "}
            <Code>long_idle_resurrect</Code> returns <Code>[]</Code> for that
            tick (logged as a warning). The other 12 detectors keep running
            normally.
          </li>
        </ul>
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
            Translation: Redis being unavailable for a few minutes is a
            performance event, not an outage. Don't worry about wiring it
            into your alert pager.
          </span>
        </div>
      </section>

      {/* ── Performance characteristics ─────────────────────────────────── */}
      <section style={sectionStyle}>
        <H icon={Gauge}>Performance characteristics</H>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            All access via the Upstash <b>REST API</b> over HTTPS — typical
            round-trip 30–80 ms from Vercel.
          </li>
          <li>
            Hot paths (bloom filter, suspicious-session detector) use{" "}
            <Code>redisPipeline()</Code> so N commands cost 1 round-trip
            instead of N. Use this any time you'd otherwise loop{" "}
            <Code>redisCmd</Code>.
          </li>
          <li>
            Free Upstash tier: 10k commands/day, 256 MB. Most installations
            stay well under thanks to caching + bloom-filter compression.
            Watch the Upstash dashboard's "Daily Requests" once you cross
            ~1k MAU.
          </li>
        </ul>
      </section>

      {/* ── Operating tips ──────────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <H icon={Wrench}>Operating tips</H>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            <b>Test connection</b> — the button below issues a single{" "}
            <Code>PING</Code>. Use it after editing credentials, no app
            restart needed.
          </li>
          <li>
            <b>Reseed bloom</b> — run <Code>pnpm bloom:seed</Code> after a
            mass user import, or if the bloom filter shows odd
            false-positive behaviour. Idempotent.
          </li>
          <li>
            <b>Clear a stuck rate-limit</b> — find the user's IP / email and
            delete the <Code>rl:*</Code> key from Upstash Console. Or unban
            from <Code>/admin/security/bruteforce</Code>.
          </li>
          <li>
            <b>Force-refresh credentials</b> — saving here invalidates the
            in-memory credential cache automatically. No deploy needed.
          </li>
        </ul>
      </section>

      {/* ── When to dig deeper ──────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <H icon={AlertTriangle}>When to dig deeper</H>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            Repeated <Code>Missing Upstash credentials</Code> errors → REST
            URL or token not saved here, or env vars take precedence and
            differ.
          </li>
          <li>
            Upstash daily-request quota approaching limit → likely a noisy
            rate-limit key getting hammered, or a regression that loops a
            lookup. Check the Upstash analytics for the top key prefix.
          </li>
          <li>
            Bloom filter false-positive rate above ~1% on real signups →
            you've outgrown the pre-allocated bitmap (<Code>BLOOM_M</Code>{" "}
            in <Code>lib/bloom/bloom-filter.ts</Code>). Re-tune and reseed.
          </li>
          <li>
            <Code>[detect/long_idle_resurrect] Redis MGET failed</Code>{" "}
            warnings in Vercel logs → Upstash connectivity or quota issue.
            The detector self-skips that tick.
          </li>
        </ul>
      </section>
    </div>
  );
}
