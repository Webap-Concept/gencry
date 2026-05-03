"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import { Loader2, Save } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { saveGdprSettingsAction, type ActionState } from "../actions";

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
  "gdpr.cookie_banner.enabled": string;
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
}: {
  name: keyof GdprSettingsValues;
  defaultChecked: boolean;
  title: string;
  hint: string;
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
          className="block text-sm font-medium"
          style={{ color: "var(--admin-text)" }}>
          {title}
        </span>
        <span
          className="block text-[11px]"
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
}: {
  name: keyof GdprSettingsValues;
  label: string;
  hint: string;
  min: number;
  max: number;
  defaultValue: string;
  suffix?: string;
}) {
  return (
    <div>
      <label
        className="block text-xs font-medium mb-1.5"
        style={{ color: "var(--admin-text-muted)" }}>
        {label}
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
}: {
  name: keyof GdprSettingsValues;
  label: string;
  hint: string;
  defaultValue: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label
        className="block text-xs font-medium mb-1.5"
        style={{ color: "var(--admin-text-muted)" }}>
        {label}
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
            Consent logging
          </h3>
          <p
            className="text-[11px] mb-5"
            style={{ color: "var(--admin-text-faint)" }}>
            Append-only audit trail of every consent event (granted / revoked).
            Required for GDPR Art. 7(1) — &ldquo;the controller shall be able
            to demonstrate that the data subject has consented&rdquo;.
          </p>
          <div className="space-y-4 max-w-2xl">
            <Bool
              name="gdpr.consent_log.enabled"
              defaultChecked={initial["gdpr.consent_log.enabled"] === "true"}
              title="Enable consent ledger (consent_records)"
              hint="Master switch. When ON, every consent action is written to a dedicated append-only table. Effective only after the migration creating the table is applied (delivered in a follow-up PR)."
            />
            <Bool
              name="gdpr.consent_log.capture_ip"
              defaultChecked={initial["gdpr.consent_log.capture_ip"] === "true"}
              title="Capture client IP at consent time"
              hint="Stores the IP from x-forwarded-for. Recommended for demonstrability; combine with the strategy below to limit retention exposure."
            />
            <SelectField
              name="gdpr.consent_log.ip_strategy"
              label="IP storage strategy"
              defaultValue={initial["gdpr.consent_log.ip_strategy"]}
              options={[
                { value: "full", label: "Full (raw IP)" },
                {
                  value: "mask_last_octet",
                  label: "Mask last octet (192.168.1.X)",
                },
                { value: "hash_only", label: "SHA-256 hash only (no raw IP)" },
              ]}
              hint="How the IP is stored. Hash-only is the most privacy-preserving but cannot prove the IP address itself, only equality between two records."
            />
            <Bool
              name="gdpr.consent_log.capture_user_agent"
              defaultChecked={
                initial["gdpr.consent_log.capture_user_agent"] === "true"
              }
              title="Capture browser user-agent"
              hint="Useful as additional evidence; truncated to 512 chars by the consent writer."
            />
            <Bool
              name="gdpr.consent_log.hash_policy_text"
              defaultChecked={
                initial["gdpr.consent_log.hash_policy_text"] === "true"
              }
              title="Hash policy text at acceptance"
              hint="Stores SHA-256 of the exact policy text the user saw. Protects against later tampering of pages.content / page_versions.content."
            />
            <NumberField
              name="gdpr.consent_log.retention_after_deletion_days"
              label="Retention after account deletion"
              defaultValue={
                initial["gdpr.consent_log.retention_after_deletion_days"]
              }
              min={0}
              max={3650}
              suffix="days"
              hint="How long consent_records are kept after the user is physically purged. 1825 = 5 years (typical Italian statute-of-limitations buffer for civil claims). 0 = delete immediately."
            />
          </div>
        </div>

        {/* Backup assurance */}
        <div className="rounded-xl shadow-sm p-6" style={cardStyle}>
          <h3
            className="text-sm font-semibold mb-1"
            style={{ color: "var(--admin-text)" }}>
            Backup assurance
          </h3>
          <p
            className="text-[11px] mb-5"
            style={{ color: "var(--admin-text-faint)" }}>
            Declare the backup tier protecting consent records. The dashboard
            shows a warning when consent logging is enabled but no backup tier
            is declared.
          </p>
          <div className="space-y-4 max-w-2xl">
            <SelectField
              name="gdpr.backup.tier"
              label="Backup tier"
              defaultValue={initial["gdpr.backup.tier"]}
              options={[
                { value: "none", label: "None — application defaults only" },
                {
                  value: "supabase_pitr",
                  label: "Supabase PITR (Pro plan, 7-day point-in-time)",
                },
                {
                  value: "external",
                  label: "External backup (custom cron / S3 dump)",
                },
              ]}
              hint="Informational only — declares the operational backup tier so it appears in the compliance dashboard and audit reports."
            />
            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: "var(--admin-text-muted)" }}>
                Backup setup notes
              </label>
              <textarea
                name="gdpr.backup.notes"
                rows={3}
                maxLength={2000}
                defaultValue={initial["gdpr.backup.notes"] ?? ""}
                placeholder="e.g. Supabase Pro PITR 7d + nightly pg_dump to s3://gencry-backup/"
                className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors"
                style={inputStyle}
              />
              <p
                className="text-[11px] mt-1"
                style={{ color: "var(--admin-text-faint)" }}>
                Free-text description of the backup setup. Visible to auditors
                in the export ledger CSV header.
              </p>
            </div>
          </div>
        </div>

        {/* Lifecycle */}
        <div className="rounded-xl shadow-sm p-6" style={cardStyle}>
          <h3
            className="text-sm font-semibold mb-1"
            style={{ color: "var(--admin-text)" }}>
            Lifecycle &amp; retention
          </h3>
          <p
            className="text-[11px] mb-5"
            style={{ color: "var(--admin-text-faint)" }}>
            Timing for account deletion grace period and data export
            cooldown.
          </p>
          <div className="space-y-4 max-w-2xl">
            <NumberField
              name="gdpr.deletion.grace_days"
              label="Account deletion — grace period"
              defaultValue={initial["gdpr.deletion.grace_days"]}
              min={0}
              max={365}
              suffix="days"
              hint="Days between soft-delete (user requests deletion) and physical purge. Persisted now; the deletion code reads a 30-day default until wired in a follow-up PR."
            />
            <NumberField
              name="gdpr.export.rate_limit_days"
              label="GDPR export — rate limit"
              defaultValue={initial["gdpr.export.rate_limit_days"]}
              min={0}
              max={365}
              suffix="days"
              hint="Minimum interval between two export requests for the same user. Persisted now; export code reads a 7-day default until wired in a follow-up PR."
            />
          </div>
        </div>

        {/* Policy enforcement */}
        <div className="rounded-xl shadow-sm p-6" style={cardStyle}>
          <h3
            className="text-sm font-semibold mb-1"
            style={{ color: "var(--admin-text)" }}>
            Policy enforcement
          </h3>
          <p
            className="text-[11px] mb-5"
            style={{ color: "var(--admin-text-faint)" }}>
            Behavior when policies (Terms / Privacy) are bumped to a new
            version, and cookie banner toggle.
          </p>
          <div className="space-y-4 max-w-2xl">
            <Bool
              name="gdpr.policy.force_reconsent_on_change"
              defaultChecked={
                initial["gdpr.policy.force_reconsent_on_change"] === "true"
              }
              title="Force re-consent on policy change"
              hint="When ON, users with an outdated terms/privacy version see a blocking modal at the next sign-in until they accept the new version. (Consumer wired in a follow-up PR.)"
            />
            <Bool
              name="gdpr.cookie_banner.enabled"
              defaultChecked={
                initial["gdpr.cookie_banner.enabled"] === "true"
              }
              title="Cookie banner enabled"
              hint="Master switch for the cookie consent banner on the public site. The banner UI itself is delivered in a follow-up PR — turning this ON now has no effect yet."
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
          {isPending ? "Saving..." : "Save GDPR settings"}
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
