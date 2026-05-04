"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MfaState } from "@/lib/auth/mfa/queries";
import { MfaDisableForm } from "./mfa-disable-form";
import { MfaRecoveryCodesDisplay } from "./mfa-recovery-codes-display";
import { MfaRegenerateForm } from "./mfa-regenerate-form";
import { MfaSetupWizard } from "./mfa-setup-wizard";

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

export function MfaSection({ initialState }: { initialState: MfaState }) {
  const router = useRouter();
  // Se la pagina si carica con un setup pendente lasciato a metà, ripartiamo
  // dal wizard — l'utente deve completare o annullare.
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
      <MfaRecoveryCodesDisplay
        codes={view.codes}
        context={view.context}
        onAcknowledged={acknowledgeRecoveryCodes}
      />
    );
  }

  if (view.kind === "setup") {
    return (
      <MfaSetupWizard
        onSuccess={(codes) => showRecoveryCodes(codes, "setup")}
        onCancel={backToIdle}
      />
    );
  }

  if (view.kind === "disable") {
    return <MfaDisableForm onCancel={backToIdle} />;
  }

  if (view.kind === "regenerate") {
    return (
      <MfaRegenerateForm
        onSuccess={(codes) => showRecoveryCodes(codes, "regenerate")}
        onCancel={backToIdle}
      />
    );
  }

  // view.kind === "idle"
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
    <section className="space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold text-gc-fg">
          Autenticazione a due fattori
        </h2>
        <p className="text-[12.5px] text-gc-fg-3 mt-0.5">
          Aggiunge un secondo passaggio al login: oltre alla password serve un
          codice generato da un'app autenticatore (Google Authenticator,
          1Password, Authy…). Anche se qualcuno ti rubasse la password, non
          potrebbe entrare senza il tuo telefono.
        </p>
      </div>

      <div className="rounded-2xl border border-gc-line bg-gc-bg-2 p-5 flex items-start gap-4">
        <div className="flex-1">
          <p className="text-[13.5px] text-gc-fg-3">
            Non hai ancora attivato la verifica a due fattori.
          </p>
        </div>
        <Button onClick={onEnable}>Abilita</Button>
      </div>
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
    <section className="space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold text-gc-fg">
          Autenticazione a due fattori
        </h2>
        <p className="text-[12.5px] text-gc-fg-3 mt-0.5">
          Al login ti chiediamo un codice generato dalla tua app autenticatore
          oltre alla password.
        </p>
      </div>

      <div className="rounded-2xl border border-gc-line bg-gc-bg-2 p-5 space-y-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="size-5 text-accent shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-[13.5px] font-semibold text-gc-fg">
              Verifica a due fattori attiva
            </p>
            {state.enabledAt && (
              <p className="text-[12.5px] text-gc-fg-3 mt-0.5">
                Dal {dateFmt.format(state.enabledAt)}
              </p>
            )}
          </div>
        </div>

        <div className="text-[12.5px] text-gc-fg-3 space-y-1 pt-3 border-t border-gc-line">
          <p>
            Recovery codes:{" "}
            <span className="font-semibold text-gc-fg">
              {state.recoveryCodesRemaining} su 10 disponibili
            </span>
          </p>
          {state.lastUsedAt && (
            <p>Ultimo uso codice: {dateFmt.format(state.lastUsedAt)}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onRegenerate}>
            Rigenera recovery codes
          </Button>
          <Button variant="destructive" size="sm" onClick={onDisable}>
            Disabilita
          </Button>
        </div>
      </div>
    </section>
  );
}
