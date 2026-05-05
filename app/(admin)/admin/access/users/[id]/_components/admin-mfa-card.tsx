"use client";

import { useState, useTransition } from "react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import ConfirmModal from "@/app/(admin)/admin/_components/confirm-modal";
import type { MfaState } from "@/lib/auth/mfa/queries";
import { adminResetMfa } from "../actions";

type Props = {
  userId: string;
  userEmail: string;
  mfa: MfaState;
  isDeleted: boolean;
};

export function AdminMfaCard({ userId, userEmail, mfa, isDeleted }: Props) {
  const t = useTranslations("admin.access.users.detail");
  const locale = useLocale();
  const dateFmt = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const [showModal, setShowModal] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleReset() {
    setError(null);
    if (reason.trim().length < 3) {
      setError(t("mfaReasonRequired"));
      return;
    }
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("reason", reason.trim());

    startTransition(async () => {
      const res = await adminResetMfa(fd);
      if (res.error) {
        setError(res.error);
        return;
      }
      setShowModal(false);
      setReason("");
    });
  }

  return (
    <>
      <div
        className="rounded-xl shadow-sm p-5"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}>
        <div className="flex items-center justify-between mb-4">
          <h4
            className="text-sm font-semibold"
            style={{ color: "var(--admin-text)" }}>
            {t("mfaHeading")}
          </h4>
          {mfa.enabled && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: "#dcfce7", color: "#16a34a" }}>
              <ShieldCheck size={10} /> {t("mfaEnabledBadge")}
            </span>
          )}
          {!mfa.enabled && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{
                background: "var(--admin-hover-bg)",
                color: "var(--admin-text-faint)",
              }}>
              <ShieldOff size={10} /> {t("mfaNotConfiguredBadge")}
            </span>
          )}
        </div>

        {mfa.enabled && (
          <div className="space-y-2 mb-4">
            <Row
              label={t("mfaActiveSince")}
              value={mfa.enabledAt ? dateFmt.format(mfa.enabledAt) : "—"}
            />
            <Row
              label={t("mfaLastUsed")}
              value={
                mfa.lastUsedAt
                  ? dateFmt.format(mfa.lastUsedAt)
                  : t("mfaLastUsedNever")
              }
            />
            <Row
              label={t("mfaRecoveryCodesLeft")}
              value={`${mfa.recoveryCodesRemaining} / 10`}
            />
          </div>
        )}

        {!mfa.enabled && !mfa.pendingSetup && (
          <p
            className="text-sm mb-2"
            style={{ color: "var(--admin-text-faint)" }}>
            {t("mfaNotConfiguredText")}
          </p>
        )}

        {!mfa.enabled && mfa.pendingSetup && (
          <p
            className="text-sm mb-2"
            style={{ color: "var(--admin-text-muted)" }}>
            {t("mfaPendingSetupText")}
          </p>
        )}

        {mfa.enabled && !isDeleted && (
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white"
            style={{ background: "#dc2626" }}>
            {t("mfaResetButton")}
          </button>
        )}
      </div>

      {showModal && (
        <ConfirmModal
          open={showModal}
          variant="danger"
          title={t("mfaResetTitle")}
          confirmLabel={pending ? t("mfaResetting") : t("mfaResetButton")}
          loading={pending}
          message={
            <div className="space-y-3">
              <p>
                {t.rich("mfaResetMessage", {
                  email: userEmail,
                  em: (chunks) => <strong>{chunks}</strong>,
                })}
              </p>
              <div>
                <label
                  className="block text-xs font-medium mb-1"
                  style={{ color: "var(--admin-text-muted)" }}>
                  {t("mfaReasonLabel")}
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder={t("mfaReasonPlaceholder")}
                  className="w-full px-3 py-2 text-sm rounded-lg outline-none border focus:ring-2"
                  style={{
                    background: "var(--admin-bg)",
                    borderColor: "var(--admin-card-border)",
                    color: "var(--admin-text)",
                  }}
                />
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
          }
          onConfirm={handleReset}
          onCancel={() => {
            if (pending) return;
            setShowModal(false);
            setReason("");
            setError(null);
          }}
        />
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span style={{ color: "var(--admin-text-faint)" }}>{label}</span>
      <span style={{ color: "var(--admin-text)" }} className="font-medium">
        {value}
      </span>
    </div>
  );
}
