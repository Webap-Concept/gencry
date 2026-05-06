"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import { Loader2, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import { saveGdprSettingsAction, type ActionState } from "../actions";
import {
  RequirementBadge,
  type RequirementLevel,
} from "./requirement-badge";

export type GdprSettingsValues = {
  "gdpr.consent_log.enabled": string;
  "gdpr.consent_log.capture_ip": string;
  "gdpr.consent_log.ip_strategy": string;
  "gdpr.consent_log.capture_user_agent": string;
  "gdpr.consent_log.hash_policy_text": string;
  "gdpr.consent_log.retention_after_deletion_days": string;
  "gdpr.backup.tier": string;
  "gdpr.backup.notes": string | null;
  "gdpr.deletion.grace_days": string;
  "gdpr.export.rate_limit_days": string;
  "gdpr.policy.force_reconsent_on_change": string;
  "gdpr.policy.reconsent_grace_days": string;
  "gdpr.policy.notifications_cron_minutes": string;
};

const cardStyle: React.CSSProperties = {
  background: "var(--admin-card-bg)",
  border: "1px solid var(--admin-card-border)",
};
const inputStyle: React.CSSProperties = {
  background: "var(--admin-page-bg)",
  border: "1px solid var(--admin-input-border)",
  color: "var(--admin-text)",
};

function Bool({
  name,
  defaultChecked,
  title,
  hint,
  requirement,
}: {
  name: keyof GdprSettingsValues;
  defaultChecked: boolean;
  title: string;
  hint: string;
  requirement: RequirementLevel;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer select-none">
      <input
        type="checkbox"
        name={name}
        value="true"
        defaultChecked={defaultChecked}
        className="mt-0.5 w-4 h-4 rounded cursor-pointer"
        style={{ accentColor: "var(--admin-accent)" }}
      />
      <span>
        <span
          className="flex items-center gap-2 text-sm font-medium"
          style={{ color: "var(--admin-text)" }}>
          {title}
          <RequirementBadge level={requirement} />
        </span>
        <span
          className="block text-[11px] mt-0.5"
          style={{ color: "var(--admin-text-faint)" }}>
          {hint}
        </span>
      </span>
    </label>
  );
}

function NumberField({
  name,
  label,
  hint,
  min,
  max,
  defaultValue,
  suffix,
  requirement,
}: {
  name: keyof GdprSettingsValues;
  label: string;
  hint: string;
  min: number;
  max: number;
  defaultValue: string;
  suffix?: string;
  requirement: RequirementLevel;
}) {
  return (
    <div>
      <label
        className="flex items-center gap-2 text-xs font-medium mb-1.5"
        style={{ color: "var(--admin-text-muted)" }}>
        {label}
        <RequirementBadge level={requirement} />
      </label>
      <div className="flex items-center gap-2">
        <input
          name={name}
          type="number"
          min={min}
          max={max}
          step="1"
          required
          defaultValue={defaultValue}
          className="w-40 px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors font-mono"
          style={inputStyle}
        />
        {suffix && (
          <span
            className="text-xs"
            style={{ color: "var(--admin-text-faint)" }}>
            {suffix}
          </span>
        )}
      </div>
      <p
        className="text-[11px] mt-1"
        style={{ color: "var(--admin-text-faint)" }}>
        {hint}
      </p>
    </div>
  );
}

function SelectField({
  name,
  label,
  hint,
  defaultValue,
  options,
  requirement,
}: {
  name: keyof GdprSettingsValues;
  label: string;
  hint: string;
  defaultValue: string;
  options: Array<{ value: string; label: string }>;
  requirement: RequirementLevel;
}) {
  return (
    <div>
      <label
        className="flex items-center gap-2 text-xs font-medium mb-1.5"
        style={{ color: "var(--admin-text-muted)" }}>
        {label}
        <RequirementBadge level={requirement} />
      </label>
      <select
        name={name}
        defaultValue={defaultValue}
        className="w-full max-w-md px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors"
        style={inputStyle}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <p
        className="text-[11px] mt-1"
        style={{ color: "var(--admin-text-faint)" }}>
        {hint}
      </p>
    </div>
  );
}

export function GdprSettingsForm({ initial }: { initial: GdprSettingsValues }) {
  const t = useTranslations("admin.compliance.gdpr.settings");
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    saveGdprSettingsAction,
    {},
  );
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const lastTs = useRef<number>(0);

  useEffect(() => {
    if (!("timestamp" in state)) return;
    if (state.timestamp === lastTs.current) return;
    lastTs.current = state.timestamp;
    if ("success" in state && state.success)
      setToast({ message: state.success, type: "success" });
    if ("error" in state && state.error)
      setToast({ message: state.error, type: "error" });
  }, [state]);

  return (
    <>
      <form action={formAction} className="space-y-5">
        {/* Consent Logging */}
        <div className="rounded-xl shadow-sm p-6" style={cardStyle}>
          <h3
            className="text-sm font-semibold mb-1"
            style={{ color: "var(--admin-text)" }}>
            {t("consentLogHeading")}
          </h3>
          <p
            className="text-[11px] mb-5"
            style={{ color: "var(--admin-text-faint)" }}>
            {t("consentLogIntro")}
          </p>
          <div className="space-y-4 max-w-2xl">
            <Bool
              name="gdpr.consent_log.enabled"
              defaultChecked={initial["gdpr.consent_log.enabled"] === "true"}
              title={t("enabledTitle")}
              hint={t("enabledHint")}
              requirement="required"
            />
            <Bool
              name="gdpr.consent_log.capture_ip"
              defaultChecked={initial["gdpr.consent_log.capture_ip"] === "true"}
              title={t("captureIpTitle")}
              hint={t("captureIpHint")}
              requirement="required"
            />
            <SelectField
              name="gdpr.consent_log.ip_strategy"
              label={t("ipStrategyLabel")}
              defaultValue={initial["gdpr.consent_log.ip_strategy"]}
              options={[
                { value: "full", label: t("ipStrategyFull") },
                { value: "mask_last_octet", label: t("ipStrategyMask") },
                { value: "hash_only", label: t("ipStrategyHash") },
              ]}
              hint={t("ipStrategyHint")}
              requirement="required"
            />
            <Bool
              name="gdpr.consent_log.capture_user_agent"
              defaultChecked={
                initial["gdpr.consent_log.capture_user_agent"] === "true"
              }
              title={t("uaTitle")}
              hint={t("uaHint")}
              requirement="optional"
            />
            <Bool
              name="gdpr.consent_log.hash_policy_text"
              defaultChecked={
                initial["gdpr.consent_log.hash_policy_text"] === "true"
              }
              title={t("hashPolicyTitle")}
              hint={t("hashPolicyHint")}
              requirement="recommended"
            />
            <NumberField
              name="gdpr.consent_log.retention_after_deletion_days"
              label={t("retentionLabel")}
              defaultValue={
                initial["gdpr.consent_log.retention_after_deletion_days"]
              }
              min={0}
              max={3650}
              suffix={t("daysSuffix")}
              hint={t("retentionHint")}
              requirement="unused"
            />
          </div>
        </div>

        {/* Backup assurance */}
        <div className="rounded-xl shadow-sm p-6" style={cardStyle}>
          <h3
            className="text-sm font-semibold mb-1"
            style={{ color: "var(--admin-text)" }}>
            {t("backupHeading")}
          </h3>
          <p
            className="text-[11px] mb-5"
            style={{ color: "var(--admin-text-faint)" }}>
            {t("backupIntro")}
          </p>
          <div className="space-y-4 max-w-2xl">
            <SelectField
              name="gdpr.backup.tier"
              label={t("backupTierLabel")}
              defaultValue={initial["gdpr.backup.tier"]}
              options={[
                { value: "none", label: t("backupTierNone") },
                { value: "supabase_pitr", label: t("backupTierPitr") },
                { value: "external", label: t("backupTierExternal") },
              ]}
              hint={t("backupTierHint")}
              requirement="recommended"
            />
            <div>
              <label
                className="flex items-center gap-2 text-xs font-medium mb-1.5"
                style={{ color: "var(--admin-text-muted)" }}>
                {t("backupNotesLabel")}
                <RequirementBadge level="optional" />
              </label>
              <textarea
                name="gdpr.backup.notes"
                rows={3}
                maxLength={2000}
                defaultValue={initial["gdpr.backup.notes"] ?? ""}
                placeholder={t("backupNotesPlaceholder")}
                className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors"
                style={inputStyle}
              />
              <p
                className="text-[11px] mt-1"
                style={{ color: "var(--admin-text-faint)" }}>
                {t("backupNotesHint")}
              </p>
            </div>
          </div>
        </div>

        {/* Lifecycle */}
        <div className="rounded-xl shadow-sm p-6" style={cardStyle}>
          <h3
            className="text-sm font-semibold mb-1"
            style={{ color: "var(--admin-text)" }}>
            {t("lifecycleHeading")}
          </h3>
          <p
            className="text-[11px] mb-5"
            style={{ color: "var(--admin-text-faint)" }}>
            {t("lifecycleIntro")}
          </p>
          <div className="space-y-4 max-w-2xl">
            <NumberField
              name="gdpr.deletion.grace_days"
              label={t("deletionGraceLabel")}
              defaultValue={initial["gdpr.deletion.grace_days"]}
              min={0}
              max={365}
              suffix={t("daysSuffix")}
              hint={t("deletionGraceHint")}
              requirement="required"
            />
            <NumberField
              name="gdpr.export.rate_limit_days"
              label={t("exportRateLabel")}
              defaultValue={initial["gdpr.export.rate_limit_days"]}
              min={0}
              max={365}
              suffix={t("daysSuffix")}
              hint={t("exportRateHint")}
              requirement="optional"
            />
          </div>
        </div>

        {/* Policy enforcement */}
        <div className="rounded-xl shadow-sm p-6" style={cardStyle}>
          <h3
            className="text-sm font-semibold mb-1"
            style={{ color: "var(--admin-text)" }}>
            {t("policyHeading")}
          </h3>
          <p
            className="text-[11px] mb-5"
            style={{ color: "var(--admin-text-faint)" }}>
            {t("policyIntro")}
          </p>
          <div className="space-y-4 max-w-2xl">
            <Bool
              name="gdpr.policy.force_reconsent_on_change"
              defaultChecked={
                initial["gdpr.policy.force_reconsent_on_change"] === "true"
              }
              title={t("forceReconsentTitle")}
              hint={t("forceReconsentHint")}
              requirement="recommended"
            />
            <NumberField
              name="gdpr.policy.reconsent_grace_days"
              label={t("reconsentGraceLabel")}
              defaultValue={initial["gdpr.policy.reconsent_grace_days"]}
              min={0}
              max={365}
              suffix={t("daysSuffix")}
              hint={t("reconsentGraceHint")}
              requirement="optional"
            />
            <NumberField
              name="gdpr.policy.notifications_cron_minutes"
              label={t("cronMinutesLabel")}
              defaultValue={initial["gdpr.policy.notifications_cron_minutes"]}
              min={1}
              max={1440}
              suffix={t("minutesSuffix")}
              hint={t("cronMinutesHint")}
              requirement="optional"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="flex items-center gap-2 px-5 py-2.5 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ background: "var(--admin-accent)" }}>
          {isPending ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Save size={15} />
          )}
          {isPending ? t("savingButton") : t("saveButton")}
        </button>
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
