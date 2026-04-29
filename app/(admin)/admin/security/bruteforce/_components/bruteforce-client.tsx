"use client";

import { useTransition, useState } from "react";
import {
  actionUnblockIp,
  actionBlacklistIp,
  actionRemoveFromBlacklist,
  actionUpdateBruteforceConfig,
} from "../actions";
import type { BruteforceEntry } from "@/lib/auth/rate-limit";
import type { InferSelectModel } from "drizzle-orm";
import type { ipBlacklist } from "@/lib/db/schema";

type BlacklistRow = InferSelectModel<typeof ipBlacklist>;

type Config = {
  signinMax:      number;
  signupMax:      number;
  checkMax:       number;
  checkWindow:    number;
  windowMinutes:  number;
  lockoutMinutes: number;
  alertThreshold: number;
};

type Props = {
  offenders: BruteforceEntry[];
  blacklist: BlacklistRow[];
  config: Config;
};

function Badge({ blocked }: { blocked: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 9999,
        padding: "2px 8px",
        fontSize: 11,
        fontWeight: 500,
        background: blocked
          ? "color-mix(in srgb, #ef4444 15%, var(--admin-card-bg))"
          : "color-mix(in srgb, #f59e0b 15%, var(--admin-card-bg))",
        color: blocked ? "#ef4444" : "#d97706",
        border: `1px solid ${blocked ? "#fca5a5" : "#fcd34d"}`,
      }}
    >
      {blocked ? "Blacklisted" : "Suspicious"}
    </span>
  );
}

const btnBase: React.CSSProperties = {
  borderRadius: 6,
  padding: "3px 10px",
  fontSize: 12,
  cursor: "pointer",
  border: "1px solid var(--admin-border)",
  background: "var(--admin-card-bg)",
  color: "var(--admin-text)",
  transition: "opacity 0.15s",
};

const btnDanger: React.CSSProperties = {
  ...btnBase,
  background: "color-mix(in srgb, #ef4444 12%, var(--admin-card-bg))",
  color: "#ef4444",
  border: "1px solid color-mix(in srgb, #ef4444 30%, transparent)",
};

// Sezione configurazione con titolo e descrizione contestuale
function ConfigSection({ title, description, children }: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      borderRadius: 8,
      border: "1px solid var(--admin-border)",
      padding: "14px 16px",
      display: "flex",
      flexDirection: "column",
      gap: 12,
    }}>
      <div>
        <p style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-text)", marginBottom: 2 }}>{title}</p>
        <p style={{ fontSize: 11, color: "var(--admin-text-faint)" }}>{description}</p>
      </div>
      {children}
    </div>
  );
}

function NumberField({ label, desc, fieldKey, value, min, max, onChange }: {
  label: string;
  desc: string;
  fieldKey: string;
  value: number;
  min: number;
  max: number;
  onChange: (key: string, val: number) => void;
}) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--admin-text)", marginBottom: 4 }}>
        {label}
      </label>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(fieldKey, parseInt(e.target.value, 10) || value)}
        style={{
          width: "100%",
          borderRadius: 6,
          border: "1px solid var(--admin-border)",
          background: "var(--admin-page-bg)",
          color: "var(--admin-text)",
          padding: "7px 10px",
          fontSize: 13,
          outline: "none",
        }}
      />
      <p style={{ marginTop: 3, fontSize: 11, color: "var(--admin-text-faint)" }}>{desc}</p>
    </div>
  );
}

export function BruteforceClient({ offenders, blacklist, config }: Props) {
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<"offenders" | "blacklist" | "config">("offenders");
  const [configValues, setConfigValues] = useState(config);
  const [feedback, setFeedback] = useState<string | null>(null);

  function showFeedback(msg: string) {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3000);
  }

  function handleFieldChange(key: string, val: number) {
    setConfigValues((prev) => ({ ...prev, [key]: val }));
  }

  function handleUnblock(ip: string) {
    const fd = new FormData();
    fd.set("ip", ip);
    startTransition(async () => {
      const res = await actionUnblockIp(fd);
      if (res.ok) showFeedback(`IP ${ip} unblocked`);
    });
  }

  function handleBlacklist(ip: string) {
    const reason = window.prompt(`Blacklist reason for ${ip} (optional):`) ?? undefined;
    const fd = new FormData();
    fd.set("ip", ip);
    if (reason) fd.set("reason", reason);
    startTransition(async () => {
      const res = await actionBlacklistIp(fd);
      if (res.ok) showFeedback(`IP ${ip} added to blacklist`);
    });
  }

  function handleRemoveBlacklist(ip: string) {
    const fd = new FormData();
    fd.set("ip", ip);
    startTransition(async () => {
      const res = await actionRemoveFromBlacklist(fd);
      if (res.ok) showFeedback(`IP ${ip} removed from blacklist`);
    });
  }

  function handleConfigSave() {
    const fd = new FormData();
    fd.set("bf_signin_max",      String(configValues.signinMax));
    fd.set("bf_signup_max",      String(configValues.signupMax));
    fd.set("bf_check_max",       String(configValues.checkMax));
    fd.set("bf_check_window",    String(configValues.checkWindow));
    fd.set("bf_window_minutes",  String(configValues.windowMinutes));
    fd.set("bf_lockout_minutes", String(configValues.lockoutMinutes));
    fd.set("bf_alert_threshold", String(configValues.alertThreshold));
    startTransition(async () => {
      const res = await actionUpdateBruteforceConfig(fd);
      if (res.ok) showFeedback("Configuration saved");
      else showFeedback("Error: " + (res as { ok: false; error: string }).error);
    });
  }

  const tabs = [
    { key: "offenders" as const, label: `Attempts (${offenders.length})` },
    { key: "blacklist" as const, label: `Blacklist (${blacklist.length})` },
    { key: "config" as const, label: "Configuration" },
  ];

  const thStyle: React.CSSProperties = {
    padding: "10px 14px",
    textAlign: "left",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "var(--admin-text-faint)",
    background: "var(--admin-sidebar-bg)",
    borderBottom: "1px solid var(--admin-border)",
  };

  const tdStyle: React.CSSProperties = {
    padding: "10px 14px",
    borderBottom: "1px solid var(--admin-border)",
    color: "var(--admin-text)",
    fontSize: 13,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {feedback && (
        <div style={{
          borderRadius: 8,
          background: "color-mix(in srgb, #22c55e 12%, var(--admin-card-bg))",
          border: "1px solid color-mix(in srgb, #22c55e 30%, transparent)",
          padding: "10px 14px",
          fontSize: 13,
          color: "#16a34a",
        }}>
          {feedback}
        </div>
      )}

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
        {[
          { label: "Suspicious IPs (24h)",    value: offenders.length },
          { label: "Blacklisted IPs",       value: blacklist.length },
          { label: "Max login (signin)",    value: configValues.signinMax },
          { label: "Max signup",            value: configValues.signupMax },
          { label: "Max check (5 min)",     value: configValues.checkMax },
          { label: "Login window (min)",  value: configValues.windowMinutes },
        ].map((s) => (
          <div key={s.label} style={{
            borderRadius: 10,
            border: "1px solid var(--admin-border)",
            background: "var(--admin-card-bg)",
            padding: "12px 16px",
          }}>
            <p style={{ fontSize: 11, color: "var(--admin-text-faint)", marginBottom: 4 }}>{s.label}</p>
            <p style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--admin-text)" }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: "1px solid var(--admin-border)", display: "flex", gap: 24 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              paddingBottom: 10,
              fontSize: 13,
              fontWeight: 500,
              background: "none",
              border: "none",
              borderBottom: tab === t.key ? "2px solid var(--admin-accent)" : "2px solid transparent",
              color: tab === t.key ? "var(--admin-accent)" : "var(--admin-text-faint)",
              cursor: "pointer",
              transition: "color 0.15s",
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Tentativi */}
      {tab === "offenders" && (
        <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid var(--admin-border)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["IP", "Email", "Attempts (24h)", "Last", "Status", "Actions"].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {offenders.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ ...tdStyle, textAlign: "center", padding: 32, color: "var(--admin-text-faint)" }}>
                    No suspicious IPs in the last 24h
                  </td>
                </tr>
              )}
              {offenders.map((o) => (
                <tr key={`${o.ip}-${o.email}`}>
                  <td style={tdStyle}><code style={{ fontSize: 11 }}>{o.ip}</code></td>
                  <td style={{ ...tdStyle, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.email}</td>
                  <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{o.attempts}</td>
                  <td style={{ ...tdStyle, color: "var(--admin-text-faint)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {new Date(o.lastAttempt).toLocaleString("it-IT")}
                  </td>
                  <td style={tdStyle}><Badge blocked={o.isBlacklisted} /></td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 6 }}>
                      {!o.isBlacklisted && (
                        <>
                          <button disabled={pending} onClick={() => handleUnblock(o.ip)} style={{ ...btnBase, opacity: pending ? 0.5 : 1 }}>Unblock</button>
                          <button disabled={pending} onClick={() => handleBlacklist(o.ip)} style={{ ...btnDanger, opacity: pending ? 0.5 : 1 }}>Blacklist</button>
                        </>
                      )}
                      {o.isBlacklisted && (
                        <button disabled={pending} onClick={() => handleRemoveBlacklist(o.ip)} style={{ ...btnBase, opacity: pending ? 0.5 : 1 }}>Remove</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab: Blacklist */}
      {tab === "blacklist" && (
        <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid var(--admin-border)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["IP", "Reason", "Added on", "Actions"].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {blacklist.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ ...tdStyle, textAlign: "center", padding: 32, color: "var(--admin-text-faint)" }}>
                    No IPs in blacklist
                  </td>
                </tr>
              )}
              {blacklist.map((b) => (
                <tr key={b.ip}>
                  <td style={tdStyle}><code style={{ fontSize: 11 }}>{b.ip}</code></td>
                  <td style={{ ...tdStyle, color: "var(--admin-text-faint)" }}>{b.reason ?? "—"}</td>
                  <td style={{ ...tdStyle, color: "var(--admin-text-faint)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {new Date(b.createdAt).toLocaleString("it-IT")}
                  </td>
                  <td style={tdStyle}>
                    <button disabled={pending} onClick={() => handleRemoveBlacklist(b.ip)} style={{ ...btnBase, opacity: pending ? 0.5 : 1 }}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab: Configuration */}
      {tab === "config" && (
        <div style={{
          maxWidth: 600,
          borderRadius: 10,
          border: "1px solid var(--admin-border)",
          background: "var(--admin-card-bg)",
          padding: "24px 28px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}>

          <p style={{ fontSize: 12, color: "var(--admin-text-faint)" }}>
            Changes apply immediately to new attempts.
          </p>

          {/* Login */}
          <ConfigSection
            title="🔐 Login"
            description="Failed login attempts per IP + email pair before blocking."
          >
            <NumberField label="Max login attempts" desc="Block after N incorrect passwords" fieldKey="signinMax" value={configValues.signinMax} min={1} max={100} onChange={handleFieldChange} />
          </ConfigSection>

          {/* Registration */}
          <ConfigSection
            title="📝 Registration"
            description="Registration form submissions per IP before blocking."
          >
            <NumberField label="Max registration attempts" desc="Block after N signup form submissions" fieldKey="signupMax" value={configValues.signupMax} min={1} max={100} onChange={handleFieldChange} />
          </ConfigSection>

          {/* Availability check */}
          <ConfigSection
            title="🔍 Email / username check"
            description="Availability checks in registration form (on-blur). High threshold to not penalize real users."
          >
            <NumberField label="Max checks per window" desc="Block after N checks in bf_check_window minutes" fieldKey="checkMax" value={configValues.checkMax} min={5} max={500} onChange={handleFieldChange} />
            <NumberField label="Check window (minutes)" desc="Duration of the check counting window" fieldKey="checkWindow" value={configValues.checkWindow} min={1} max={60} onChange={handleFieldChange} />
          </ConfigSection>

          {/* Common */}
          <ConfigSection
            title="⚙️ Common parameters"
            description="Window and lockout duration shared between login and registration. Email alert triggers when an IP exceeds threshold in 24h."
          >
            <NumberField label="Login/signup window (minutes)" desc="Interval in which attempts are counted" fieldKey="windowMinutes" value={configValues.windowMinutes} min={1} max={1440} onChange={handleFieldChange} />
            <NumberField label="Lockout duration (minutes)" desc="How long the IP remains blocked" fieldKey="lockoutMinutes" value={configValues.lockoutMinutes} min={1} max={10080} onChange={handleFieldChange} />
            <NumberField label="Email alert threshold" desc="Total attempts (24h) to trigger Resend email alert" fieldKey="alertThreshold" value={configValues.alertThreshold} min={1} max={1000} onChange={handleFieldChange} />
          </ConfigSection>

          <button
            disabled={pending}
            onClick={handleConfigSave}
            style={{
              borderRadius: 7,
              background: "var(--admin-accent)",
              color: "#fff",
              border: "none",
              padding: "8px 18px",
              fontSize: 13,
              fontWeight: 500,
              cursor: pending ? "not-allowed" : "pointer",
              opacity: pending ? 0.6 : 1,
              alignSelf: "flex-start",
              transition: "opacity 0.15s",
            }}
          >
            {pending ? "Saving…" : "Save configuration"}
          </button>
        </div>
      )}
    </div>
  );
}
