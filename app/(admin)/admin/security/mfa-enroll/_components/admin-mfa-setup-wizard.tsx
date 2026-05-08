"use client";

import Image from "next/image";
import { Loader2 } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import {
  type MfaConfirmState,
  type MfaStartState,
  confirmMfaSetupAction,
  startMfaSetupAction,
} from "@/app/(protected)/settings/security/actions";

type Props = {
  onSuccess: (recoveryCodes: string[]) => void;
  onCancel: () => void;
};

export function AdminMfaSetupWizard({ onSuccess, onCancel }: Props) {
  const [startState, startAction, starting] = useActionState<
    MfaStartState,
    FormData
  >(startMfaSetupAction, {});

  const [confirmState, confirmAction, confirming] = useActionState<
    MfaConfirmState,
    FormData
  >(confirmMfaSetupAction, {});

  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (started) return;
    setStarted(true);
    startAction(new FormData());
  }, [started, startAction]);

  useEffect(() => {
    if (confirmState.recoveryCodes && confirmState.recoveryCodes.length > 0) {
      onSuccess(confirmState.recoveryCodes);
    }
  }, [confirmState.recoveryCodes, onSuccess]);

  const isLoadingQr = starting || (!startState.qrCodeDataUrl && !startState.error);
  const startError = startState.error;

  return (
    <section
      className="rounded-xl p-5 space-y-5"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <div>
        <h2
          className="text-sm font-semibold"
          style={{ color: "var(--admin-text)" }}>
          Attiva l'autenticazione a due fattori
        </h2>
        <p
          className="text-xs mt-1"
          style={{ color: "var(--admin-text-muted)" }}>
          Aggiunge un secondo passaggio al login. Ti suggeriamo Google
          Authenticator, 1Password o Authy.
        </p>
      </div>

      {isLoadingQr && (
        <div className="flex items-center justify-center py-12">
          <Loader2
            className="w-5 h-5 animate-spin"
            style={{ color: "var(--admin-text-muted)" }}
          />
        </div>
      )}

      {startError && (
        <p className="text-sm" style={{ color: "#dc2626" }}>
          {startError}
        </p>
      )}

      {!isLoadingQr && startState.qrCodeDataUrl && startState.manualKey && (
        <>
          <div>
            <p
              className="text-xs font-semibold mb-2"
              style={{ color: "var(--admin-text)" }}>
              1. Scansiona il QR code
            </p>
            <p
              className="text-xs mb-3"
              style={{ color: "var(--admin-text-muted)" }}>
              Apri la tua app autenticatore e aggiungi un nuovo account
              scansionando questo codice.
            </p>
            <div className="flex justify-center bg-white rounded-lg p-4 w-fit border"
                 style={{ borderColor: "var(--admin-card-border)" }}>
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
            <p
              className="text-xs font-semibold mb-2"
              style={{ color: "var(--admin-text)" }}>
              Non puoi scansionare?
            </p>
            <p
              className="text-xs mb-2"
              style={{ color: "var(--admin-text-muted)" }}>
              Inserisci manualmente questa chiave nell'app:
            </p>
            <code
              className="block font-mono text-sm p-3 rounded-md break-all tracking-wider"
              style={{
                background: "var(--admin-page-bg)",
                border: "1px solid var(--admin-card-border)",
                color: "var(--admin-text)",
              }}>
              {startState.manualKey}
            </code>
          </div>

          <form
            action={confirmAction}
            className="space-y-3 pt-4"
            style={{ borderTop: "1px solid var(--admin-divider)" }}>
            <div>
              <label
                htmlFor="admin-mfa-confirm-token"
                className="text-xs font-semibold block"
                style={{ color: "var(--admin-text)" }}>
                2. Inserisci il codice generato
              </label>
              <p
                className="text-xs mt-1 mb-2"
                style={{ color: "var(--admin-text-muted)" }}>
                Apri l'app e digita il codice di 6 cifre che vedi adesso per
                confermare il setup.
              </p>
              <input
                id="admin-mfa-confirm-token"
                name="token"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                required
                autoFocus
                placeholder="000000"
                className="w-48 px-3 py-2 rounded-md font-mono text-lg tracking-widest text-center"
                style={{
                  background: "var(--admin-input-bg)",
                  border: "1px solid var(--admin-input-border)",
                  color: "var(--admin-text)",
                }}
              />
            </div>

            {confirmState.error && (
              <p className="text-sm" style={{ color: "#dc2626" }}>
                {confirmState.error}
              </p>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="submit"
                disabled={confirming}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                style={{ background: "var(--admin-accent)" }}>
                {confirming ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Verifico…
                  </>
                ) : (
                  "Attiva"
                )}
              </button>
              <button
                type="button"
                onClick={onCancel}
                disabled={confirming}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
                style={{
                  background: "transparent",
                  color: "var(--admin-text-muted)",
                }}>
                Annulla
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
