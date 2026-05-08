"use client";

import Image from "next/image";
import { useActionState, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type MfaConfirmState,
  type MfaStartState,
  confirmMfaSetupAction,
  startMfaSetupAction,
} from "../actions";

type Props = {
  onCancel: () => void;
};

// Su success il server fa redirect a /settings/security/codes — niente
// callback onSuccess, niente useEffect su recoveryCodes. I codici
// viaggiano via cookie firmato (cfr. lib/auth/mfa/pending-codes-cookie.ts).
export function MfaSetupWizard({ onCancel }: Props) {
  const [startState, startAction, starting] = useActionState<
    MfaStartState,
    FormData
  >(startMfaSetupAction, {});

  const [confirmState, confirmAction, confirming] = useActionState<
    MfaConfirmState,
    FormData
  >(confirmMfaSetupAction, {});

  // Genera il secret automaticamente al mount, una sola volta.
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (started) return;
    setStarted(true);
    startAction(new FormData());
  }, [started, startAction]);

  const isLoadingQr = starting || (!startState.qrCodeDataUrl && !startState.error);
  const startError = startState.error;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold text-gc-fg">
          Attiva l'autenticazione a due fattori
        </h2>
        <p className="text-[12.5px] text-gc-fg-3 mt-0.5">
          Aggiunge un secondo passaggio al login: oltre alla password ti
          chiederemo un codice generato da un'app autenticatore. Ti suggeriamo
          Google Authenticator, 1Password o Authy.
        </p>
      </div>

      <div className="rounded-2xl border border-gc-line bg-gc-bg-2 p-6 space-y-5">
        {isLoadingQr && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-5 animate-spin text-gc-fg-3" />
          </div>
        )}

        {startError && (
          <p className="text-[13px] text-gc-neg">{startError}</p>
        )}

        {!isLoadingQr && startState.qrCodeDataUrl && startState.manualKey && (
          <>
            <div>
              <p className="text-[13px] font-semibold text-gc-fg mb-2">
                1. Scansiona il QR code
              </p>
              <p className="text-[12.5px] text-gc-fg-3 mb-3">
                Apri la tua app autenticatore e aggiungi un nuovo account
                scansionando questo codice.
              </p>
              <div className="flex justify-center bg-white rounded-xl p-4 border border-gc-line w-fit">
                <Image
                  src={startState.qrCodeDataUrl}
                  alt="QR code per app autenticatore"
                  width={192}
                  height={192}
                  unoptimized
                />
              </div>
            </div>

            <div>
              <p className="text-[13px] font-semibold text-gc-fg mb-2">
                Non puoi scansionare?
              </p>
              <p className="text-[12.5px] text-gc-fg-3 mb-2">
                Inserisci manualmente questa chiave nell'app:
              </p>
              <code className="block font-mono text-[13px] text-gc-fg bg-gc-bg p-3 rounded-lg border border-gc-line break-all tracking-wider">
                {startState.manualKey}
              </code>
            </div>

            <form action={confirmAction} className="space-y-3 pt-2 border-t border-gc-line">
              <input type="hidden" name="context" value="public" />
              <div>
                <Label
                  htmlFor="mfa-confirm-token"
                  className="text-[13px] font-semibold text-gc-fg"
                >
                  2. Inserisci il codice generato
                </Label>
                <p className="text-[12.5px] text-gc-fg-3 mt-1 mb-2">
                  Apri l'app e digita il codice di 6 cifre che vedi adesso per
                  confermare il setup.
                </p>
                <Input
                  id="mfa-confirm-token"
                  name="token"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  autoFocus
                  className="font-mono text-lg tracking-widest text-center max-w-[12rem]"
                  placeholder="000000"
                />
              </div>

              {confirmState.error && (
                <p className="text-[13px] text-gc-neg">{confirmState.error}</p>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="submit" disabled={confirming}>
                  {confirming ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Verifico…
                    </>
                  ) : (
                    "Attiva"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onCancel}
                  disabled={confirming}
                >
                  Annulla
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </section>
  );
}
