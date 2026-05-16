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
  Clock,
  Loader2,
  Play,
  Save,
  Send,
  ShieldAlert,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  type ActionState,
  runDetectionNowAction,
  saveNotificationsConfigAction,
  sendTestDigestAction,
} from "../actions";

type RuleKey = keyof AlertsConfig["sources"]["sessions"]["rules"];

const TABS = [
  { id: "sessions", label: "Sessions", icon: Activity },
  { id: "cron", label: "Cron", icon: Clock },
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
  severityLabels,
}: {
  name: string;
  defaultValue: AlertsConfig["sources"]["sessions"]["rules"]["multiple_ips"]["severity"];
  severityLabels: Record<(typeof SEVERITIES)[number], string>;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      className="w-full px-3 py-2 rounded-lg text-sm"
      style={inputStyle}>
      {SEVERITIES.map((s) => (
        <option key={s} value={s}>
          {severityLabels[s]}
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
  ruleLabel,
  ruleHelp,
  severityLabel,
  severityLabels,
  children,
}: {
  reason: RuleKey;
  rule: AlertsConfig["sources"]["sessions"]["rules"][RuleKey];
  ruleLabel: string;
  ruleHelp: string;
  severityLabel: string;
  severityLabels: Record<(typeof SEVERITIES)[number], string>;
  children: React.ReactNode;
}) {
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
                {ruleLabel}
              </span>
            }
          />
          <p
            className="text-[12px] mt-1 ml-6"
            style={{ color: "var(--admin-text-muted)" }}>
            {ruleHelp}
          </p>
        </div>
        <div className="min-w-[140px]">
          <Label>{severityLabel}</Label>
          <SeveritySelect
            name={`rule_${reason}_severity`}
            defaultValue={rule.severity}
            severityLabels={severityLabels}
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
  const t = useTranslations("admin.settings.notifications");
  const tRule = useTranslations("admin.settings.notifications.rules");
  const tField = useTranslations("admin.settings.notifications.fields");

  const SCHEDULE_LABELS: Record<(typeof SCHEDULES)[number], string> = {
    instant: t("scheduleInstant"),
    hourly_digest: t("scheduleHourlyDigest"),
    daily_digest: t("scheduleDailyDigest"),
    off: t("scheduleOff"),
  };

  const SEVERITY_LABELS: Record<(typeof SEVERITIES)[number], string> = {
    info: t("severityInfo"),
    warning: t("severityWarning"),
    critical: t("severityCritical"),
  };

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

  const r = initialConfig.sources.sessions.rules;
  const cronSrc = initialConfig.sources.cron;
  const sessionsSrc = initialConfig.sources.sessions;

  const ruleProps = (reason: RuleKey, rule: AlertsConfig["sources"]["sessions"]["rules"][RuleKey]) => ({
    reason,
    rule,
    ruleLabel: tRule(`${reason}.label`),
    ruleHelp: tRule(`${reason}.help`),
    severityLabel: t("severityFieldLabel"),
    severityLabels: SEVERITY_LABELS,
  });

  return (
    <>
      <form action={saveAction} className="space-y-5">
        <Section
          icon={Bell}
          title={t("recipientsScheduleTitle")}
          subtitle={t("recipientsScheduleSubtitle")}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="recipients_emails">{t("recipientsLabel")}</Label>
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
                {t("recipientsHint")}
              </p>
            </div>

            <div className="space-y-3">
              <Checkbox
                name="recipients_include_admin_users"
                defaultChecked={initialConfig.recipients.includeAdminUsers}
                label={
                  <>
                    {t("includeAdminUsersBefore")}{" "}
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
                      {t("dryRunLabel")}
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
              icon={Activity}
              title="Sessioni sospette"
              subtitle="Schedule email digest, soglia di severità e strumenti manuali per il modulo di rilevamento sessioni sospette.">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="sessions_schedule">{t("scheduleLabel")}</Label>
                    <select
                      id="sessions_schedule"
                      name="sessions_schedule"
                      defaultValue={sessionsSrc.schedule}
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
                    <Label htmlFor="sessions_severity_threshold">{t("severityThresholdLabel")}</Label>
                    <select
                      id="sessions_severity_threshold"
                      name="sessions_severity_threshold"
                      defaultValue={sessionsSrc.severityThreshold}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={inputStyle}>
                      {SEVERITIES.map((s) => (
                        <option key={s} value={s}>
                          {t("severityThresholdOption", { severity: SEVERITY_LABELS[s] })}
                        </option>
                      ))}
                    </select>
                    <p
                      className="text-[12px]"
                      style={{ color: "var(--admin-text-muted)" }}>
                      {t("severityThresholdHint")}
                    </p>
                  </div>
                </div>

                <div
                  className="flex flex-wrap items-center gap-3 pt-1 border-t"
                  style={{ borderColor: "var(--admin-card-border)" }}>
                  <div className="w-full -mb-1">
                    <p
                      className="text-[12px] uppercase tracking-wide font-semibold"
                      style={{ color: "var(--admin-text-muted)" }}>
                      Strumenti manuali (sessioni)
                    </p>
                  </div>
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
                    {isRunning ? t("runningDetection") : t("runDetectionNow")}
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
                    {isTesting ? t("sendingTestDigest") : t("sendTestDigest")}
                  </button>
                </div>
              </div>
            </Section>

            <Section
              icon={ShieldAlert}
              title={t("detectionRulesTitle")}
              subtitle={t("detectionRulesSubtitle")}>
              <div className="space-y-3">
                <RuleBlock {...ruleProps("multiple_ips", r.multiple_ips)}>
                  <FieldGroup label={tField("minDistinctIps")}>
                    <NumberField
                      name="rule_multiple_ips_count"
                      defaultValue={r.multiple_ips.count}
                    />
                  </FieldGroup>
                  <FieldGroup label={tField("windowHours")}>
                    <NumberField
                      name="rule_multiple_ips_window_hours"
                      defaultValue={r.multiple_ips.windowHours}
                    />
                  </FieldGroup>
                </RuleBlock>

                <RuleBlock {...ruleProps("concurrent_devices", r.concurrent_devices)}>
                  <FieldGroup label={tField("minConcurrentSessions")}>
                    <NumberField
                      name="rule_concurrent_devices_count"
                      defaultValue={r.concurrent_devices.count}
                    />
                  </FieldGroup>
                </RuleBlock>

                <RuleBlock {...ruleProps("burst_creation", r.burst_creation)}>
                  <FieldGroup label={tField("minSessionsInWindow")}>
                    <NumberField
                      name="rule_burst_creation_count"
                      defaultValue={r.burst_creation.count}
                    />
                  </FieldGroup>
                  <FieldGroup label={tField("windowMinutes")}>
                    <NumberField
                      name="rule_burst_creation_window_minutes"
                      defaultValue={r.burst_creation.windowMinutes}
                    />
                  </FieldGroup>
                </RuleBlock>

                <RuleBlock {...ruleProps("bot_user_agent", r.bot_user_agent)}>
                  <div className="col-span-full">
                    <Label>{tField("uaRegexPattern")}</Label>
                    <input
                      type="text"
                      name="rule_bot_user_agent_pattern"
                      defaultValue={r.bot_user_agent.pattern}
                      className="w-full px-3 py-2 rounded-lg text-sm font-mono"
                      style={inputStyle}
                    />
                  </div>
                </RuleBlock>

                <RuleBlock {...ruleProps("long_idle_resurrect", r.long_idle_resurrect)}>
                  <FieldGroup label={tField("idleDaysThreshold")}>
                    <NumberField
                      name="rule_long_idle_resurrect_idle_days"
                      defaultValue={r.long_idle_resurrect.idleDays}
                    />
                  </FieldGroup>
                </RuleBlock>

                <RuleBlock {...ruleProps("failed_then_success", r.failed_then_success)}>
                  <FieldGroup label={tField("minFailedAttempts")}>
                    <NumberField
                      name="rule_failed_then_success_failed_count"
                      defaultValue={r.failed_then_success.failedCount}
                    />
                  </FieldGroup>
                  <FieldGroup label={tField("windowMinutes")}>
                    <NumberField
                      name="rule_failed_then_success_window_minutes"
                      defaultValue={r.failed_then_success.windowMinutes}
                    />
                  </FieldGroup>
                </RuleBlock>

                <RuleBlock {...ruleProps("sensitive_action_new_ip", r.sensitive_action_new_ip)}>
                  <FieldGroup label={tField("withinMinutesOfSessionCreation")}>
                    <NumberField
                      name="rule_sensitive_action_new_ip_within_minutes"
                      defaultValue={r.sensitive_action_new_ip.withinMinutes}
                    />
                  </FieldGroup>
                  <div className="col-span-full">
                    <Label>{tField("activityTypeValues")}</Label>
                    <textarea
                      name="rule_sensitive_action_new_ip_actions"
                      defaultValue={r.sensitive_action_new_ip.actions.join("\n")}
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg text-sm font-mono"
                      style={inputStyle}
                    />
                  </div>
                </RuleBlock>

                <RuleBlock {...ruleProps("new_subnet", r.new_subnet)}>
                  <FieldGroup label={tField("historyLookbackDays")}>
                    <NumberField
                      name="rule_new_subnet_lookback_days"
                      defaultValue={r.new_subnet.lookbackDays}
                    />
                  </FieldGroup>
                </RuleBlock>

                <RuleBlock {...ruleProps("ua_churn", r.ua_churn)}>
                  <FieldGroup label={tField("minDistinctUAs")}>
                    <NumberField
                      name="rule_ua_churn_count"
                      defaultValue={r.ua_churn.count}
                    />
                  </FieldGroup>
                  <FieldGroup label={tField("windowMinutes")}>
                    <NumberField
                      name="rule_ua_churn_window_minutes"
                      defaultValue={r.ua_churn.windowMinutes}
                    />
                  </FieldGroup>
                </RuleBlock>

                <RuleBlock {...ruleProps("cross_user_campaign", r.cross_user_campaign)}>
                  <FieldGroup label={tField("minDistinctUsers")}>
                    <NumberField
                      name="rule_cross_user_campaign_min_users"
                      defaultValue={r.cross_user_campaign.minUsers}
                    />
                  </FieldGroup>
                  <FieldGroup label={tField("windowMinutes")}>
                    <NumberField
                      name="rule_cross_user_campaign_window_minutes"
                      defaultValue={r.cross_user_campaign.windowMinutes}
                    />
                  </FieldGroup>
                </RuleBlock>

                <RuleBlock {...ruleProps("off_baseline_hours", r.off_baseline_hours)}>
                  <FieldGroup label={tField("minHistoricalSamples")}>
                    <NumberField
                      name="rule_off_baseline_hours_min_samples"
                      defaultValue={r.off_baseline_hours.minSamples}
                    />
                  </FieldGroup>
                  <FieldGroup label={tField("deviationToleranceHours")}>
                    <NumberField
                      name="rule_off_baseline_hours_deviation_hours"
                      defaultValue={r.off_baseline_hours.deviationHours}
                    />
                  </FieldGroup>
                  <FieldGroup label={tField("lookbackDays")}>
                    <NumberField
                      name="rule_off_baseline_hours_lookback_days"
                      defaultValue={r.off_baseline_hours.lookbackDays}
                    />
                  </FieldGroup>
                </RuleBlock>

                <RuleBlock {...ruleProps("admin_off_hours", r.admin_off_hours)}>
                  <FieldGroup label={tField("allowedStartHourUtc")}>
                    <NumberField
                      name="rule_admin_off_hours_start_utc_hour"
                      defaultValue={r.admin_off_hours.startUtcHour}
                      min={0}
                      max={23}
                    />
                  </FieldGroup>
                  <FieldGroup label={tField("allowedEndHourUtc")}>
                    <NumberField
                      name="rule_admin_off_hours_end_utc_hour"
                      defaultValue={r.admin_off_hours.endUtcHour}
                      min={1}
                      max={24}
                    />
                  </FieldGroup>
                </RuleBlock>

                <RuleBlock {...ruleProps("trusted_device_from_fresh_session", r.trusted_device_from_fresh_session)}>
                  <FieldGroup label={tField("withinMinutesOfSession")}>
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
          </>
        )}

        {activeTab === "cron" && (
          <Section
            icon={Clock}
            title="Cron job failures"
            subtitle="Alert email quando un job pg_cron registrato fallisce di seguito. Sources monitorate automaticamente: core + tutti i moduli installati che dichiarano cronJobs[] nel manifest.">
            <div className="space-y-4">
              <Checkbox
                name="cron_enabled"
                defaultChecked={cronSrc.enabled}
                label={
                  <span style={{ color: "var(--admin-text)", fontWeight: 600 }}>
                    Abilita notifiche cron
                  </span>
                }
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="cron_schedule">Schedule digest</Label>
                  <select
                    id="cron_schedule"
                    name="cron_schedule"
                    defaultValue={cronSrc.schedule}
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
                  <Label htmlFor="cron_severity_threshold">Severity minima</Label>
                  <select
                    id="cron_severity_threshold"
                    name="cron_severity_threshold"
                    defaultValue={cronSrc.severityThreshold}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={inputStyle}>
                    {SEVERITIES.map((s) => (
                      <option key={s} value={s}>
                        {SEVERITY_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cron_escalate_after">Fallimenti consecutivi → critical</Label>
                  <NumberField
                    name="cron_escalate_after"
                    defaultValue={cronSrc.escalateAfterFailures}
                    min={1}
                    max={50}
                  />
                </div>
              </div>

              <p
                className="text-[12px]"
                style={{ color: "var(--admin-text-muted)" }}>
                Il dispatcher controlla <code>cron.job_run_details</code> ogni 5 min.
                Quando un job fallisce in modo persistente, viene creata una notifica admin (con la severity scelta) e
                inviata via email digest secondo lo schedule sopra. Dopo N fallimenti consecutivi la severity sale a{" "}
                <strong>critical</strong>.
              </p>
            </div>
          </Section>
        )}

        <div className="flex flex-wrap items-center gap-3">
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
            {isSaving ? t("savingSettings") : t("saveSettings")}
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
