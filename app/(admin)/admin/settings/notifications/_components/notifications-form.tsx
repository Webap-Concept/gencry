"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import {
  type AlertsConfig,
  SCHEDULES,
  SEVERITIES,
} from "@/lib/sessions/suspicious/config-types";
import {
  Activity,
  Bell,
  Loader2,
  Play,
  Save,
  Send,
  ShieldAlert,
} from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  type ActionState,
  runDetectionNowAction,
  saveNotificationsConfigAction,
  sendTestDigestAction,
} from "../actions";

const SCHEDULE_LABELS: Record<(typeof SCHEDULES)[number], string> = {
  instant: "Instant — one email per detection cycle",
  hourly_digest: "Hourly digest (recommended)",
  daily_digest: "Daily digest",
  off: "Off — only panel notifications",
};

const SEVERITY_LABELS: Record<(typeof SEVERITIES)[number], string> = {
  info: "Info",
  warning: "Warning",
  critical: "Critical",
};

const RULE_META: Record<
  keyof AlertsConfig["rules"],
  { label: string; help: string }
> = {
  multiple_ips: {
    label: "Multiple IPs",
    help: "Same user logging in from N+ distinct IP addresses within a time window.",
  },
  concurrent_devices: {
    label: "Concurrent devices",
    help: "User has N+ active sessions open at the same time.",
  },
  burst_creation: {
    label: "Burst creation",
    help: "Unusually high number of new sessions opened by the user in a short window.",
  },
  bot_user_agent: {
    label: "Bot User-Agent",
    help: "User-Agent string matches a regex of common bots / scrapers / headless browsers.",
  },
  long_idle_resurrect: {
    label: "Long idle resurrect",
    help: "Old session newly active after being idle for at least N days. Requires Redis.",
  },
  failed_then_success: {
    label: "Failed → success login",
    help: "N+ failed login attempts followed by a successful login (likely brute-force success).",
  },
  sensitive_action_new_ip: {
    label: "Sensitive action on new IP",
    help: "Account-impacting action (password change, deletion, …) right after a session from a never-seen IP.",
  },
  new_subnet: {
    label: "New subnet",
    help: "Login from a /16 (IPv4) or /64 (IPv6) prefix never seen for that user in the lookback window.",
  },
  ua_churn: {
    label: "User-Agent churn",
    help: "Same user with N+ different User-Agents in a short window — often indicates cookie theft.",
  },
  cross_user_campaign: {
    label: "Cross-user campaign",
    help: "Same IP creating sessions for N+ different users in a short window — credential stuffing pattern.",
  },
  off_baseline_hours: {
    label: "Off-baseline hours",
    help: "Login at an hour outside the user's typical activity window (computed from history).",
  },
  admin_off_hours: {
    label: "Admin off-hours",
    help: "Admin user logging in outside the configured business window (UTC hours).",
  },
  trusted_device_from_fresh_session: {
    label: "Trusted device from fresh session",
    help: "A trusted device added within minutes of a new session — attacker persisting access.",
  },
};

const TABS = [
  { id: "sessions", label: "Sessions", icon: Activity },
] as const;
type TabId = (typeof TABS)[number]["id"];

// ---------------------------------------------------------------------------
// Reusable atoms
// ---------------------------------------------------------------------------

function Section({
  title,
  subtitle,
  children,
  icon: Icon,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  icon?: React.ElementType;
}) {
  return (
    <section
      className="rounded-xl shadow-sm p-5 space-y-4"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <div className="flex items-start gap-3">
        {Icon && (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background:
                "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))",
            }}>
            <Icon size={15} style={{ color: "var(--admin-accent)" }} />
          </div>
        )}
        <div>
          <h3
            className="text-sm font-semibold"
            style={{ color: "var(--admin-text)" }}>
            {title}
          </h3>
          {subtitle && (
            <p
              className="text-[12px] mt-0.5"
              style={{ color: "var(--admin-text-muted)" }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-xs font-medium uppercase tracking-wide"
      style={{ color: "var(--admin-text-muted)" }}>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--admin-input-bg)",
  border: "1px solid var(--admin-card-border)",
  color: "var(--admin-text)",
  outline: "none",
};

function NumberField({
  name,
  defaultValue,
  min = 1,
  max,
}: {
  name: string;
  defaultValue: number;
  min?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      name={name}
      defaultValue={defaultValue}
      min={min}
      max={max}
      className="w-full px-3 py-2 rounded-lg text-sm"
      style={inputStyle}
    />
  );
}

function SeveritySelect({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue: AlertsConfig["rules"]["multiple_ips"]["severity"];
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      className="w-full px-3 py-2 rounded-lg text-sm"
      style={inputStyle}>
      {SEVERITIES.map((s) => (
        <option key={s} value={s}>
          {SEVERITY_LABELS[s]}
        </option>
      ))}
    </select>
  );
}

function Checkbox({
  name,
  defaultChecked,
  label,
}: {
  name: string;
  defaultChecked: boolean;
  label: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="w-4 h-4 rounded"
        style={{ accentColor: "var(--admin-accent)" }}
      />
      <span style={{ color: "var(--admin-text)" }}>{label}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Per-rule block
// ---------------------------------------------------------------------------

function RuleBlock({
  reason,
  rule,
  children,
}: {
  reason: keyof AlertsConfig["rules"];
  rule: AlertsConfig["rules"][keyof AlertsConfig["rules"]];
  children: React.ReactNode;
}) {
  const meta = RULE_META[reason];
  return (
    <div
      className="rounded-lg p-4 space-y-3"
      style={{
        background: "var(--admin-page-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <Checkbox
            name={`rule_${reason}_enabled`}
            defaultChecked={rule.enabled}
            label={
              <span className="font-semibold" style={{ color: "var(--admin-text)" }}>
                {meta.label}
              </span>
            }
          />
          <p
            className="text-[12px] mt-1 ml-6"
            style={{ color: "var(--admin-text-muted)" }}>
            {meta.help}
          </p>
        </div>
        <div className="min-w-[140px]">
          <Label>Severity</Label>
          <SeveritySelect
            name={`rule_${reason}_severity`}
            defaultValue={rule.severity}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 ml-6">
        {children}
      </div>
    </div>
  );
}

function FieldGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main form
// ---------------------------------------------------------------------------

export function NotificationsSettingsForm({
  initialConfig,
}: {
  initialConfig: AlertsConfig;
}) {
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("sessions");

  const [saveState, saveAction, isSaving] = useActionState<
    ActionState,
    FormData
  >(saveNotificationsConfigAction, {});
  const [runState, runAction, isRunning] = useActionState<
    ActionState,
    FormData
  >(runDetectionNowAction, {});
  const [testState, testAction, isTesting] = useActionState<
    ActionState,
    FormData
  >(sendTestDigestAction, {});

  const lastSaveTs = useRef(0);
  const lastRunTs = useRef(0);
  const lastTestTs = useRef(0);

  useEffect(() => {
    if (!("timestamp" in saveState)) return;
    if (saveState.timestamp === lastSaveTs.current) return;
    lastSaveTs.current = saveState.timestamp;
    if ("success" in saveState) {
      setToast({ message: saveState.success, type: "success" });
    } else if ("error" in saveState) {
      setToast({ message: saveState.error, type: "error" });
    }
  }, [saveState]);

  useEffect(() => {
    if (!("timestamp" in runState)) return;
    if (runState.timestamp === lastRunTs.current) return;
    lastRunTs.current = runState.timestamp;
    if ("success" in runState) {
      setToast({ message: runState.success, type: "success" });
    } else if ("error" in runState) {
      setToast({ message: runState.error, type: "error" });
    }
  }, [runState]);

  useEffect(() => {
    if (!("timestamp" in testState)) return;
    if (testState.timestamp === lastTestTs.current) return;
    lastTestTs.current = testState.timestamp;
    if ("success" in testState) {
      setToast({ message: testState.success, type: "success" });
    } else if ("error" in testState) {
      setToast({ message: testState.error, type: "error" });
    }
  }, [testState]);

  const r = initialConfig.rules;

  return (
    <>
      <form action={saveAction} className="space-y-5">
        <Section
          icon={Bell}
          title="Recipients & schedule"
          subtitle="Who receives the email digest, how often, and the panel/email severity floor.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="recipients_emails">Recipient emails</Label>
              <textarea
                id="recipients_emails"
                name="recipients_emails"
                defaultValue={initialConfig.recipients.emails.join("\n")}
                placeholder="security@example.com&#10;admin@example.com"
                rows={4}
                className="w-full px-3 py-2 rounded-lg text-sm font-mono"
                style={inputStyle}
              />
              <p
                className="text-[12px]"
                style={{ color: "var(--admin-text-muted)" }}>
                One per line or comma-separated.
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="schedule">Email schedule</Label>
                <select
                  id="schedule"
                  name="schedule"
                  defaultValue={initialConfig.schedule}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={inputStyle}>
                  {SCHEDULES.map((s) => (
                    <option key={s} value={s}>
                      {SCHEDULE_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="severity_threshold">Severity threshold</Label>
                <select
                  id="severity_threshold"
                  name="severity_threshold"
                  defaultValue={initialConfig.severityThreshold}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={inputStyle}>
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {SEVERITY_LABELS[s]} or above
                    </option>
                  ))}
                </select>
                <p
                  className="text-[12px]"
                  style={{ color: "var(--admin-text-muted)" }}>
                  Alerts below this floor are silently logged for audit only.
                </p>
              </div>

              <Checkbox
                name="recipients_include_admin_users"
                defaultChecked={initialConfig.recipients.includeAdminUsers}
                label={
                  <>
                    Also email all users with{" "}
                    <code
                      className="px-1 rounded text-[11px]"
                      style={{
                        background: "var(--admin-hover-bg)",
                        color: "var(--admin-text)",
                      }}>
                      admin:access
                    </code>
                  </>
                }
              />

              <div
                className="rounded-lg p-3 flex items-start gap-2"
                style={{
                  background:
                    "color-mix(in srgb, #f59e0b 8%, var(--admin-card-bg))",
                  border:
                    "1px solid color-mix(in srgb, #f59e0b 30%, transparent)",
                }}>
                <Checkbox
                  name="dry_run"
                  defaultChecked={initialConfig.dryRun}
                  label={
                    <span style={{ color: "#92400e", fontWeight: 600 }}>
                      Dry-run — log alerts only, never email or notify
                    </span>
                  }
                />
              </div>
            </div>
          </div>
        </Section>

        <div
          className="flex items-center gap-1 p-1 rounded-xl w-fit"
          style={{ background: "var(--admin-hover-bg)" }}>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg font-medium transition-all"
                style={{
                  background: isActive ? "var(--admin-accent)" : "transparent",
                  color: isActive ? "#fff" : "var(--admin-text-muted)",
                  boxShadow: isActive ? "0 1px 3px oklch(0 0 0 / 0.15)" : "none",
                }}>
                <Icon size={13} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === "sessions" && (
          <>
            <Section
              icon={ShieldAlert}
              title="Detection rules"
              subtitle="13 heuristics, all using internal data only — no external geo / VPN services. Tune thresholds per rule.">
              <div className="space-y-3">
                <RuleBlock reason="multiple_ips" rule={r.multiple_ips}>
                  <FieldGroup label="Min distinct IPs">
                    <NumberField
                      name="rule_multiple_ips_count"
                      defaultValue={r.multiple_ips.count}
                    />
                  </FieldGroup>
                  <FieldGroup label="Window (hours)">
                    <NumberField
                      name="rule_multiple_ips_window_hours"
                      defaultValue={r.multiple_ips.windowHours}
                    />
                  </FieldGroup>
                </RuleBlock>

                <RuleBlock
                  reason="concurrent_devices"
                  rule={r.concurrent_devices}>
                  <FieldGroup label="Min concurrent active sessions">
                    <NumberField
                      name="rule_concurrent_devices_count"
                      defaultValue={r.concurrent_devices.count}
                    />
                  </FieldGroup>
                </RuleBlock>

                <RuleBlock reason="burst_creation" rule={r.burst_creation}>
                  <FieldGroup label="Min sessions in window">
                    <NumberField
                      name="rule_burst_creation_count"
                      defaultValue={r.burst_creation.count}
                    />
                  </FieldGroup>
                  <FieldGroup label="Window (minutes)">
                    <NumberField
                      name="rule_burst_creation_window_minutes"
                      defaultValue={r.burst_creation.windowMinutes}
                    />
                  </FieldGroup>
                </RuleBlock>

                <RuleBlock reason="bot_user_agent" rule={r.bot_user_agent}>
                  <div className="col-span-full">
                    <Label>UA regex pattern (case-insensitive, |-joined)</Label>
                    <input
                      type="text"
                      name="rule_bot_user_agent_pattern"
                      defaultValue={r.bot_user_agent.pattern}
                      className="w-full px-3 py-2 rounded-lg text-sm font-mono"
                      style={inputStyle}
                    />
                  </div>
                </RuleBlock>

                <RuleBlock
                  reason="long_idle_resurrect"
                  rule={r.long_idle_resurrect}>
                  <FieldGroup label="Idle days threshold">
                    <NumberField
                      name="rule_long_idle_resurrect_idle_days"
                      defaultValue={r.long_idle_resurrect.idleDays}
                    />
                  </FieldGroup>
                </RuleBlock>

                <RuleBlock
                  reason="failed_then_success"
                  rule={r.failed_then_success}>
                  <FieldGroup label="Min failed attempts">
                    <NumberField
                      name="rule_failed_then_success_failed_count"
                      defaultValue={r.failed_then_success.failedCount}
                    />
                  </FieldGroup>
                  <FieldGroup label="Window (minutes)">
                    <NumberField
                      name="rule_failed_then_success_window_minutes"
                      defaultValue={r.failed_then_success.windowMinutes}
                    />
                  </FieldGroup>
                </RuleBlock>

                <RuleBlock
                  reason="sensitive_action_new_ip"
                  rule={r.sensitive_action_new_ip}>
                  <FieldGroup label="Within minutes of session creation">
                    <NumberField
                      name="rule_sensitive_action_new_ip_within_minutes"
                      defaultValue={r.sensitive_action_new_ip.withinMinutes}
                    />
                  </FieldGroup>
                  <div className="col-span-full">
                    <Label>ActivityType values to monitor (one per line)</Label>
                    <textarea
                      name="rule_sensitive_action_new_ip_actions"
                      defaultValue={r.sensitive_action_new_ip.actions.join("\n")}
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg text-sm font-mono"
                      style={inputStyle}
                    />
                  </div>
                </RuleBlock>

                <RuleBlock reason="new_subnet" rule={r.new_subnet}>
                  <FieldGroup label="History lookback (days)">
                    <NumberField
                      name="rule_new_subnet_lookback_days"
                      defaultValue={r.new_subnet.lookbackDays}
                    />
                  </FieldGroup>
                </RuleBlock>

                <RuleBlock reason="ua_churn" rule={r.ua_churn}>
                  <FieldGroup label="Min distinct UAs">
                    <NumberField
                      name="rule_ua_churn_count"
                      defaultValue={r.ua_churn.count}
                    />
                  </FieldGroup>
                  <FieldGroup label="Window (minutes)">
                    <NumberField
                      name="rule_ua_churn_window_minutes"
                      defaultValue={r.ua_churn.windowMinutes}
                    />
                  </FieldGroup>
                </RuleBlock>

                <RuleBlock
                  reason="cross_user_campaign"
                  rule={r.cross_user_campaign}>
                  <FieldGroup label="Min distinct users">
                    <NumberField
                      name="rule_cross_user_campaign_min_users"
                      defaultValue={r.cross_user_campaign.minUsers}
                    />
                  </FieldGroup>
                  <FieldGroup label="Window (minutes)">
                    <NumberField
                      name="rule_cross_user_campaign_window_minutes"
                      defaultValue={r.cross_user_campaign.windowMinutes}
                    />
                  </FieldGroup>
                </RuleBlock>

                <RuleBlock
                  reason="off_baseline_hours"
                  rule={r.off_baseline_hours}>
                  <FieldGroup label="Min historical samples">
                    <NumberField
                      name="rule_off_baseline_hours_min_samples"
                      defaultValue={r.off_baseline_hours.minSamples}
                    />
                  </FieldGroup>
                  <FieldGroup label="Deviation tolerance (hours)">
                    <NumberField
                      name="rule_off_baseline_hours_deviation_hours"
                      defaultValue={r.off_baseline_hours.deviationHours}
                    />
                  </FieldGroup>
                  <FieldGroup label="Lookback (days)">
                    <NumberField
                      name="rule_off_baseline_hours_lookback_days"
                      defaultValue={r.off_baseline_hours.lookbackDays}
                    />
                  </FieldGroup>
                </RuleBlock>

                <RuleBlock reason="admin_off_hours" rule={r.admin_off_hours}>
                  <FieldGroup label="Allowed start hour (UTC)">
                    <NumberField
                      name="rule_admin_off_hours_start_utc_hour"
                      defaultValue={r.admin_off_hours.startUtcHour}
                      min={0}
                      max={23}
                    />
                  </FieldGroup>
                  <FieldGroup label="Allowed end hour (UTC)">
                    <NumberField
                      name="rule_admin_off_hours_end_utc_hour"
                      defaultValue={r.admin_off_hours.endUtcHour}
                      min={1}
                      max={24}
                    />
                  </FieldGroup>
                </RuleBlock>

                <RuleBlock
                  reason="trusted_device_from_fresh_session"
                  rule={r.trusted_device_from_fresh_session}>
                  <FieldGroup label="Within minutes of session">
                    <NumberField
                      name="rule_trusted_device_from_fresh_session_within_minutes"
                      defaultValue={
                        r.trusted_device_from_fresh_session.withinMinutes
                      }
                    />
                  </FieldGroup>
                </RuleBlock>
              </div>
            </Section>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={isRunning}
                onClick={() => runAction(new FormData())}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg disabled:opacity-60"
                style={{
                  background: "var(--admin-hover-bg)",
                  color: "var(--admin-text)",
                  border: "1px solid var(--admin-card-border)",
                }}>
                {isRunning ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Play size={15} />
                )}
                {isRunning ? "Running…" : "Run detection now"}
              </button>

              <button
                type="button"
                disabled={isTesting}
                onClick={() => testAction(new FormData())}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg disabled:opacity-60"
                style={{
                  background: "var(--admin-hover-bg)",
                  color: "var(--admin-text)",
                  border: "1px solid var(--admin-card-border)",
                }}>
                {isTesting ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Send size={15} />
                )}
                {isTesting ? "Sending…" : "Send test digest"}
              </button>
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center gap-3 sticky bottom-3">
          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-60"
            style={{ background: "var(--admin-accent)" }}>
            {isSaving ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Save size={15} />
            )}
            {isSaving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </form>

      {toast && (
        <AdminToast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </>
  );
}
