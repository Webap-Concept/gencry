"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MfaState } from "@/lib/auth/mfa/queries";
import { MfaDisableForm } from "./mfa-disable-form";
import { MfaRegenerateForm } from "./mfa-regenerate-form";
import { MfaSetupWizard } from "./mfa-setup-wizard";

type View =
  | { kind: "idle" }
  | { kind: "setup" }
  | { kind: "disable" }
  | { kind: "regenerate" };

// Niente view "recovery-codes" qui: dopo confirm/regenerate il server fa
// redirect a /settings/security/codes con i codici nel cookie firmato. Il
// rendering avviene su quella page dedicata, non come stato dell'orchestrator.

const RECOVERY_CODES_TOTAL = 10;

export function MfaSection({ initialState }: { initialState: MfaState }) {
  // Se la pagina si carica con un setup pendente lasciato a metà, ripartiamo
  // dal wizard — l'utente deve completare o annullare.
  const [view, setView] = useState<View>(
    initialState.pendingSetup ? { kind: "setup" } : { kind: "idle" },
  );

  function backToIdle() {
    setView({ kind: "idle" });
  }

  if (view.kind === "setup") {
    return <MfaSetupWizard onCancel={backToIdle} />;
  }

  if (view.kind === "disable") {
    return <MfaDisableForm onCancel={backToIdle} />;
  }

  if (view.kind === "regenerate") {
    return <MfaRegenerateForm onCancel={backToIdle} />;
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
  const t = useTranslations("core.settings.security.mfa");
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold text-gc-fg">{t("title")}</h2>
        <p className="text-[12.5px] text-gc-fg-3 mt-0.5">
          {t("descriptionInactive")}
        </p>
      </div>

      <div className="rounded-2xl border border-gc-line bg-gc-bg-2 p-5 flex items-start gap-4">
        <div className="flex-1">
          <p className="text-[13.5px] text-gc-fg-3">{t("inactiveNotice")}</p>
        </div>
        <Button onClick={onEnable}>{t("enable")}</Button>
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
  const t = useTranslations("core.settings.security.mfa");
  const locale = useLocale();
  const dateFmt = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold text-gc-fg">{t("title")}</h2>
        <p className="text-[12.5px] text-gc-fg-3 mt-0.5">
          {t("descriptionActive")}
        </p>
      </div>

      <div className="rounded-2xl border border-gc-line bg-gc-bg-2 p-5 space-y-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="size-5 text-accent shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-[13.5px] font-semibold text-gc-fg">
              {t("activeStatus")}
            </p>
            {state.enabledAt && (
              <p className="text-[12.5px] text-gc-fg-3 mt-0.5">
                {t("enabledOn", { date: dateFmt.format(state.enabledAt) })}
              </p>
            )}
          </div>
        </div>

        <div className="text-[12.5px] text-gc-fg-3 space-y-1 pt-3 border-t border-gc-line">
          <p>
            {t("recoveryCodesLabel")}{" "}
            <span className="font-semibold text-gc-fg">
              {t("recoveryCodesRemaining", {
                remaining: state.recoveryCodesRemaining,
                total: RECOVERY_CODES_TOTAL,
              })}
            </span>
          </p>
          {state.lastUsedAt && (
            <p>{t("lastUsedCode", { date: dateFmt.format(state.lastUsedAt) })}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onRegenerate}>
            {t("regenerate")}
          </Button>
          <Button variant="destructive" size="sm" onClick={onDisable}>
            {t("disable")}
          </Button>
        </div>
      </div>
    </section>
  );
}
