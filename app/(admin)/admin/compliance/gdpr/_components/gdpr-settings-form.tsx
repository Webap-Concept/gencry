"use client";

import {
  BackupConfig,
  type BackupConfigFieldNames,
  type BackupConfigInitial,
  type BackupConfigLabels,
  type BackupTier,
  type BackupFrequency,
} from "@/app/(admin)/admin/_components/backup-config";
import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import { Loader2, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  saveGdprSettingsAction,
  verifyPitrAction,
  verifyS3Action,
  type ActionState,
} from "../actions";
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
  "gdpr.backup.pitr.last_verified_at": string | null;
  "gdpr.backup.pitr.last_verified_tier": string | null;
  "gdpr.backup.s3.last_verified_at": string | null;
  "gdpr.backup.s3.last_verified_status": string | null;
  "gdpr.backup.external.provider": string | null;
  "gdpr.backup.external.frequency": string | null;
  "gdpr.backup.external.retention_days": string | null;
  "gdpr.backup.external.last_verified_at": string | null;
  "gdpr.backup.external.last_verified_by": string | null;
  "gdpr.backup.external.recovery_test_notes": string | null;
  "gdpr.deletion.grace_days": string;
  "gdpr.export.rate_limit_days": string;
  "gdpr.policy.force_reconsent_on_change": string;
  "gdpr.policy.reconsent_grace_days": string;
  "gdpr.policy.notifications_cron_minutes": string;
};

/**
 * Stato dei servizi a cui i tier backup possono agganciarsi. Calcolato
 * server-side e passato come prop perché il form non dovrebbe leggere
 * da getAppSettings via fetch client.
 */
export type BackupServiceStatus = {
  /** PAT + project_ref configurati per il servizio Supabase. */
  supabaseConfigured: boolean;
  /** Endpoint + region + bucket + access key + secret per S3-compatible. */
  s3Configured: boolean;
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

// Mappa fissa dei `name` HTML per la sezione backup GDPR. Il componente
// `BackupConfig` accetta `fieldNames` come prop così la stessa UI può
// agganciarsi a setting keys diverse in altre sezioni admin (es. una
// futura "Application backup" generale).
const GDPR_BACKUP_FIELD_NAMES = {
  tier: "gdpr.backup.tier",
  notes: "gdpr.backup.notes",
  externalProvider: "gdpr.backup.external.provider",
  externalFrequency: "gdpr.backup.external.frequency",
  externalRetentionDays: "gdpr.backup.external.retention_days",
  externalLastVerifiedAt: "gdpr.backup.external.last_verified_at",
  externalLastVerifiedBy: "gdpr.backup.external.last_verified_by",
  externalRecoveryTestNotes: "gdpr.backup.external.recovery_test_notes",
} as const satisfies BackupConfigFieldNames;

/**
 * Costruisce l'object labels per `BackupConfig` dal namespace i18n
 * GDPR. Estratta come funzione pura così l'host non duplica le chiavi
 * inline nel JSX.
 */
function buildBackupLabels(
  t: ReturnType<typeof useTranslations>,
): BackupConfigLabels {
  return {
    sectionTitle: t("backupHeading"),
    sectionIntro: t("backupIntro"),
    monitoringOnlyBanner: t("backupMonitoringOnlyBanner"),
    tierLabel: t("backupTierLabel"),
    tierHint: t("backupTierHint"),
    tierNone: t("backupTierNone"),
    tierPitr: t("backupTierPitr"),
    tierS3: t("backupTierS3"),
    tierExternal: t("backupTierExternal"),
    noneWarningTitle: t("backupNoneWarningTitle"),
    noneWarningBody: t("backupNoneWarningBody"),
    pitrPaneTitle: t("backupPitrPaneTitle"),
    pitrPaneIntro: t("backupPitrPaneIntro"),
    pitrServiceUnconfiguredTitle: t("backupPitrServiceUnconfiguredTitle"),
    pitrServiceUnconfiguredBody: t("backupPitrServiceUnconfiguredBody"),
    pitrServiceConfigureCta: t("backupPitrServiceConfigureCta"),
    pitrVerifyButton: t("backupPitrVerifyButton"),
    pitrVerifyingButton: t("backupPitrVerifyingButton"),
    pitrLastCheckLabel: t("backupPitrLastCheckLabel"),
    pitrNeverChecked: t("backupPitrNeverChecked"),
    pitrSupportedBadge: t("backupPitrSupportedBadge"),
    pitrUnsupportedBadge: t("backupPitrUnsupportedBadge"),
    pitrUnknownBadge: t("backupPitrUnknownBadge"),
    s3PaneTitle: t("backupS3PaneTitle"),
    s3PaneIntro: t("backupS3PaneIntro"),
    s3ServiceUnconfiguredTitle: t("backupS3ServiceUnconfiguredTitle"),
    s3ServiceUnconfiguredBody: t("backupS3ServiceUnconfiguredBody"),
    s3ServiceConfigureCta: t("backupS3ServiceConfigureCta"),
    s3VerifyButton: t("backupS3VerifyButton"),
    s3VerifyingButton: t("backupS3VerifyingButton"),
    s3LastCheckLabel: t("backupS3LastCheckLabel"),
    s3NeverChecked: t("backupS3NeverChecked"),
    s3StatusOk: t("backupS3StatusOk"),
    s3StatusForbidden: t("backupS3StatusForbidden"),
    s3StatusNotFound: t("backupS3StatusNotFound"),
    s3StatusInvalidCredentials: t("backupS3StatusInvalidCredentials"),
    s3StatusNetworkError: t("backupS3StatusNetworkError"),
    s3StatusUnknown: t("backupS3StatusUnknown"),
    externalPaneTitle: t("backupExternalPaneTitle"),
    externalPaneIntro: t("backupExternalPaneIntro"),
    externalProviderLabel: t("backupExternalProviderLabel"),
    externalProviderPlaceholder: t("backupExternalProviderPlaceholder"),
    externalFrequencyLabel: t("backupExternalFrequencyLabel"),
    externalFrequencyOptions: {
      hourly: t("backupExternalFreqHourly"),
      daily: t("backupExternalFreqDaily"),
      weekly: t("backupExternalFreqWeekly"),
      monthly: t("backupExternalFreqMonthly"),
      custom: t("backupExternalFreqCustom"),
    },
    externalRetentionLabel: t("backupExternalRetentionLabel"),
    externalRetentionHint: t("backupExternalRetentionHint"),
    externalLastVerifiedLabel: t("backupExternalLastVerifiedLabel"),
    externalLastVerifiedHint: t("backupExternalLastVerifiedHint"),
    externalLastVerifiedByLabel: t("backupExternalLastVerifiedByLabel"),
    externalLastVerifiedByPlaceholder: t("backupExternalLastVerifiedByPlaceholder"),
    externalRecoveryNotesLabel: t("backupExternalRecoveryNotesLabel"),
    externalRecoveryNotesPlaceholder: t("backupExternalRecoveryNotesPlaceholder"),
    notesLabel: t("backupNotesLabel"),
    notesPlaceholder: t("backupNotesPlaceholder"),
    notesHint: t("backupNotesHint"),
  };
}

export function GdprSettingsForm({
  initial,
  backupServices,
}: {
  initial: GdprSettingsValues;
  backupServices: BackupServiceStatus;
}) {
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
              requirement="recommended"
            />
          </div>
        </div>

        {/* Backup assurance — componente riusabile */}
        <BackupConfig
          initial={{
            tier: initial["gdpr.backup.tier"] as BackupTier,
            notes: initial["gdpr.backup.notes"],
            pitrLastVerifiedAt: initial["gdpr.backup.pitr.last_verified_at"],
            pitrLastVerifiedTier: initial["gdpr.backup.pitr.last_verified_tier"],
            s3LastVerifiedAt: initial["gdpr.backup.s3.last_verified_at"],
            s3LastVerifiedStatus: initial["gdpr.backup.s3.last_verified_status"],
            externalProvider: initial["gdpr.backup.external.provider"],
            externalFrequency:
              (initial["gdpr.backup.external.frequency"] as BackupFrequency | null) ?? null,
            externalRetentionDays: initial["gdpr.backup.external.retention_days"],
            externalLastVerifiedAt: initial["gdpr.backup.external.last_verified_at"],
            externalLastVerifiedBy: initial["gdpr.backup.external.last_verified_by"],
            externalRecoveryTestNotes:
              initial["gdpr.backup.external.recovery_test_notes"],
          } satisfies BackupConfigInitial}
          fieldNames={GDPR_BACKUP_FIELD_NAMES}
          labels={buildBackupLabels(t)}
          pitrServiceConfigured={backupServices.supabaseConfigured}
          pitrServiceConfigureHref="/admin/services/supabase"
          onVerifyPitr={async () => {
            const res = await verifyPitrAction();
            if ("success" in res) return { ok: true, message: res.success };
            if ("error" in res) return { ok: false, message: res.error };
            return { ok: false };
          }}
          s3ServiceConfigured={backupServices.s3Configured}
          s3ServiceConfigureHref="/admin/services/storage/s3"
          onVerifyS3={async () => {
            const res = await verifyS3Action();
            if ("success" in res) return { ok: true, message: res.success };
            if ("error" in res) return { ok: false, message: res.error };
            return { ok: false };
          }}
          cardStyle={cardStyle}
          inputStyle={inputStyle}
        />

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
