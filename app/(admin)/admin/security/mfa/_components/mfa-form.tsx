"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import { Loader2, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { saveMfaSettings, type ActionState } from "../actions";
import { MFA_MODES, type MfaMode } from "./mfa-modes";

interface MfaFormProps {
  initial: {
    enabled: boolean;
    mode: MfaMode;
    gracePeriodDays: number;
    issuerLabel: string;
    appName: string;
  };
}

export function MfaForm({ initial }: MfaFormProps) {
  const t = useTranslations("admin.security.mfa.form");
  const router = useRouter();

  const [enabled, setEnabled] = useState(initial.enabled);
  const [mode, setMode] = useState<MfaMode>(initial.mode);
  const [grace, setGrace] = useState<number>(initial.gracePeriodDays);
  const [issuer, setIssuer] = useState(initial.issuerLabel);

  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    saveMfaSettings,
    {},
  );

  useEffect(() => {
    if ("success" in state) {
      setToast({ message: state.success, type: "success" });
      router.refresh();
    } else if ("error" in state) {
      setToast({ message: state.error, type: "error" });
    }
  }, [state, router]);

  const isRequired = mode !== "optional";

  return (
    <>
      <form
        action={formAction}
        className="rounded-xl shadow-sm p-5 space-y-5"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}>
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--admin-text)" }}>
          {t("heading")}
        </h3>

        {/* Master switch */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <label
              htmlFor="mfa-enabled"
              className="text-sm font-medium"
              style={{ color: "var(--admin-text)" }}>
              {t("enabledLabel")}
            </label>
            <p
              className="text-xs mt-1"
              style={{ color: "var(--admin-text-muted)" }}>
              {t("enabledHint")}
            </p>
          </div>
          <Toggle
            id="mfa-enabled"
            name="mfa.enabled"
            checked={enabled}
            onChange={setEnabled}
          />
        </div>

        {/* Nota: il warning "cannot disable while users enrolled" è ora
            solo lato server (toast dopo il dispatch). Lato client non
            chiediamo più la count enrolled, perché blocca il page render
            quando il DB stats si impalla — vedi suspense in page.tsx. */}

        {/* Mode */}
        <div
          className={`space-y-1 ${enabled ? "" : "opacity-50 pointer-events-none"}`}>
          <label
            htmlFor="mfa-mode"
            className="text-sm font-medium block"
            style={{ color: "var(--admin-text)" }}>
            {t("modeLabel")}
          </label>
          <select
            id="mfa-mode"
            name="mfa.mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as MfaMode)}
            disabled={!enabled}
            className="w-full px-3 py-2 rounded-md text-sm"
            style={{
              background: "var(--admin-page-bg, var(--admin-card-bg))",
              border: "1px solid var(--admin-input-border, var(--admin-card-border))",
              color: "var(--admin-text)",
            }}>
            {MFA_MODES.map((m) => (
              <option key={m} value={m}>
                {t(`modeOption_${m}` as const)}
              </option>
            ))}
          </select>
          <p
            className="text-xs mt-1"
            style={{ color: "var(--admin-text-muted)" }}>
            {t(`modeHint_${mode}` as const)}
          </p>
        </div>

        {/* Grace period — solo se required */}
        {isRequired && enabled && (
          <div className="space-y-1">
            <label
              htmlFor="mfa-grace"
              className="text-sm font-medium block"
              style={{ color: "var(--admin-text)" }}>
              {t("graceLabel")}
            </label>
            <input
              id="mfa-grace"
              name="mfa.grace_period_days"
              type="number"
              min={0}
              max={90}
              value={grace}
              onChange={(e) => setGrace(Number(e.target.value))}
              className="w-32 px-3 py-2 rounded-md text-sm"
              style={{
                background: "var(--admin-page-bg, var(--admin-card-bg))",
                border: "1px solid var(--admin-input-border, var(--admin-card-border))",
                color: "var(--admin-text)",
              }}
            />
            <p
              className="text-xs mt-1"
              style={{ color: "var(--admin-text-muted)" }}>
              {t("graceHint")}
            </p>
          </div>
        )}
        {!isRequired && (
          <input
            type="hidden"
            name="mfa.grace_period_days"
            value={grace}
          />
        )}

        {/* Issuer label */}
        <div
          className={`space-y-1 ${enabled ? "" : "opacity-50 pointer-events-none"}`}>
          <label
            htmlFor="mfa-issuer"
            className="text-sm font-medium block"
            style={{ color: "var(--admin-text)" }}>
            {t("issuerLabel")}
          </label>
          <input
            id="mfa-issuer"
            name="mfa.issuer_label"
            type="text"
            value={issuer}
            maxLength={100}
            onChange={(e) => setIssuer(e.target.value)}
            placeholder={initial.appName || t("issuerPlaceholder")}
            disabled={!enabled}
            className="w-full px-3 py-2 rounded-md text-sm"
            style={{
              background: "var(--admin-page-bg, var(--admin-card-bg))",
              border: "1px solid var(--admin-input-border, var(--admin-card-border))",
              color: "var(--admin-text)",
            }}
          />
          <p
            className="text-xs mt-1"
            style={{ color: "var(--admin-text-muted)" }}>
            {t("issuerHint", { fallback: initial.appName || "—" })}
          </p>
        </div>

        {/* Save */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
            style={{ background: "var(--admin-accent)" }}>
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {t("save")}
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

function Toggle({
  id,
  name,
  checked,
  onChange,
}: {
  id: string;
  name: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <>
      <input type="hidden" name={name} value={checked ? "true" : "false"} />
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0"
        style={{
          background: checked
            ? "var(--admin-accent)"
            : "var(--admin-card-border)",
        }}>
        <span
          className="inline-block h-5 w-5 rounded-full bg-white transition-transform"
          style={{
            transform: checked ? "translateX(22px)" : "translateX(2px)",
          }}
        />
      </button>
    </>
  );
}
