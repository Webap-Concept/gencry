"use client";

// Orchestrator client per /admin/security/mfa-enroll. Gestisce gli stati
// idle / setup / disable / regenerate / recovery-codes. Tutto admin-themed.

import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MfaState } from "@/lib/auth/mfa/queries";
import { AdminMfaDisableForm } from "./admin-mfa-disable-form";
import { AdminMfaRecoveryCodesDisplay } from "./admin-mfa-recovery-codes-display";
import { AdminMfaRegenerateForm } from "./admin-mfa-regenerate-form";
import { AdminMfaSetupWizard } from "./admin-mfa-setup-wizard";

type View =
  | { kind: "idle" }
  | { kind: "setup" }
  | { kind: "disable" }
  | { kind: "regenerate" }
  | {
      kind: "recovery-codes";
      codes: string[];
      context: "setup" | "regenerate";
    };

const dateFmt = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function AdminMfaSection({ initialState }: { initialState: MfaState }) {
  const router = useRouter();
  const [view, setView] = useState<View>(
    initialState.pendingSetup ? { kind: "setup" } : { kind: "idle" },
  );

  function backToIdle() {
    setView({ kind: "idle" });
  }

  function showRecoveryCodes(codes: string[], context: "setup" | "regenerate") {
    setView({ kind: "recovery-codes", codes, context });
  }

  function acknowledgeRecoveryCodes() {
    setView({ kind: "idle" });
    router.refresh();
  }

  if (view.kind === "recovery-codes") {
    return (
      <AdminMfaRecoveryCodesDisplay
        codes={view.codes}
        context={view.context}
        onAcknowledged={acknowledgeRecoveryCodes}
      />
    );
  }

  if (view.kind === "setup") {
    return (
      <AdminMfaSetupWizard
        onSuccess={(codes) => showRecoveryCodes(codes, "setup")}
        onCancel={backToIdle}
      />
    );
  }

  if (view.kind === "disable") {
    return <AdminMfaDisableForm onCancel={backToIdle} />;
  }

  if (view.kind === "regenerate") {
    return (
      <AdminMfaRegenerateForm
        onSuccess={(codes) => showRecoveryCodes(codes, "regenerate")}
        onCancel={backToIdle}
      />
    );
  }

  if (initialState.enabled) {
    return (
      <EnabledView
        state={initialState}
        onDisable={() => setView({ kind: "disable" })}
        onRegenerate={() => setView({ kind: "regenerate" })}
      />
    );
  }

  return <DisabledView onEnable={() => setView({ kind: "setup" })} />;
}

function DisabledView({ onEnable }: { onEnable: () => void }) {
  return (
    <section
      className="rounded-xl p-5 flex items-start gap-4"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <div className="flex-1">
        <h2
          className="text-sm font-semibold"
          style={{ color: "var(--admin-text)" }}>
          Autenticazione a due fattori
        </h2>
        <p
          className="text-xs mt-1"
          style={{ color: "var(--admin-text-muted)" }}>
          Non hai ancora attivato la verifica a due fattori sul tuo account
          staff.
        </p>
      </div>
      <button
        type="button"
        onClick={onEnable}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
        style={{ background: "var(--admin-accent)" }}>
        Abilita
      </button>
    </section>
  );
}

function EnabledView({
  state,
  onDisable,
  onRegenerate,
}: {
  state: MfaState;
  onDisable: () => void;
  onRegenerate: () => void;
}) {
  return (
    <section
      className="rounded-xl p-5 space-y-4"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <div className="flex items-start gap-3">
        <ShieldCheck
          className="w-5 h-5 flex-shrink-0 mt-0.5"
          style={{ color: "var(--admin-accent)" }}
        />
        <div className="flex-1">
          <p
            className="text-sm font-semibold"
            style={{ color: "var(--admin-text)" }}>
            Verifica a due fattori attiva
          </p>
          {state.enabledAt && (
            <p
              className="text-xs mt-0.5"
              style={{ color: "var(--admin-text-muted)" }}>
              Attiva dal {dateFmt.format(state.enabledAt)}
            </p>
          )}
        </div>
      </div>

      <div
        className="text-xs space-y-1 pt-3"
        style={{
          color: "var(--admin-text-muted)",
          borderTop: "1px solid var(--admin-divider)",
        }}>
        <p>
          Recovery codes:{" "}
          <strong style={{ color: "var(--admin-text)" }}>
            {state.recoveryCodesRemaining} su 10 disponibili
          </strong>
        </p>
        {state.lastUsedAt && (
          <p>Ultimo uso codice: {dateFmt.format(state.lastUsedAt)}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={onRegenerate}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium"
          style={{
            background: "var(--admin-input-bg)",
            border: "1px solid var(--admin-input-border)",
            color: "var(--admin-text)",
          }}>
          Rigenera recovery codes
        </button>
        <button
          type="button"
          onClick={onDisable}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium text-white"
          style={{ background: "#dc2626" }}>
          Disabilita
        </button>
      </div>
    </section>
  );
}
