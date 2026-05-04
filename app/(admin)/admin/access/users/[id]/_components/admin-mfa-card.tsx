"use client";

import { useState, useTransition } from "react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import ConfirmModal from "@/app/(admin)/admin/_components/confirm-modal";
import type { MfaState } from "@/lib/auth/mfa/queries";
import { adminResetMfa } from "../actions";

type Props = {
  userId: string;
  userEmail: string;
  mfa: MfaState;
  isDeleted: boolean;
};

const dateFmt = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function AdminMfaCard({ userId, userEmail, mfa, isDeleted }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleReset() {
    setError(null);
    if (reason.trim().length < 3) {
      setError("Reason is required (min 3 chars).");
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
            Multi-factor authentication
          </h4>
          {mfa.enabled && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: "#dcfce7", color: "#16a34a" }}>
              <ShieldCheck size={10} /> Enabled
            </span>
          )}
          {!mfa.enabled && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{
                background: "var(--admin-hover-bg)",
                color: "var(--admin-text-faint)",
              }}>
              <ShieldOff size={10} /> Not configured
            </span>
          )}
        </div>

        {mfa.enabled && (
          <div className="space-y-2 mb-4">
            <Row label="Active since" value={mfa.enabledAt ? dateFmt.format(mfa.enabledAt) : "—"} />
            <Row
              label="Last used"
              value={mfa.lastUsedAt ? dateFmt.format(mfa.lastUsedAt) : "Never"}
            />
            <Row
              label="Recovery codes left"
              value={`${mfa.recoveryCodesRemaining} / 10`}
            />
          </div>
        )}

        {!mfa.enabled && !mfa.pendingSetup && (
          <p
            className="text-sm mb-2"
            style={{ color: "var(--admin-text-faint)" }}>
            This user has not configured a second factor.
          </p>
        )}

        {!mfa.enabled && mfa.pendingSetup && (
          <p
            className="text-sm mb-2"
            style={{ color: "var(--admin-text-muted)" }}>
            Setup started but not yet confirmed.
          </p>
        )}

        {mfa.enabled && !isDeleted && (
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white"
            style={{ background: "#dc2626" }}>
            Reset MFA
          </button>
        )}
      </div>

      {showModal && (
        <ConfirmModal
          open={showModal}
          variant="danger"
          title="Reset MFA for this user"
          confirmLabel={pending ? "Resetting…" : "Reset MFA"}
          loading={pending}
          message={
            <div className="space-y-3">
              <p>
                This will wipe the TOTP secret and all recovery codes for{" "}
                <strong>{userEmail}</strong>. They'll fall back to email +
                password at the next login. The user will receive an email
                notification with the reason below.
              </p>
              <div>
                <label
                  className="block text-xs font-medium mb-1"
                  style={{ color: "var(--admin-text-muted)" }}>
                  Reason (visible to the user)
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder="e.g. Lost phone and recovery codes — verified identity via support ticket #123"
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
