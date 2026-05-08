"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useEffect } from "react";
import {
  type MfaRegenerateState,
  regenerateRecoveryCodesAction,
} from "@/app/(protected)/settings/security/actions";

type Props = {
  onSuccess: (recoveryCodes: string[]) => void;
  onCancel: () => void;
};

export function AdminMfaRegenerateForm({ onSuccess, onCancel }: Props) {
  const [state, action, pending] = useActionState<MfaRegenerateState, FormData>(
    regenerateRecoveryCodesAction,
    {},
  );

  useEffect(() => {
    if (state.recoveryCodes && state.recoveryCodes.length > 0) {
      onSuccess(state.recoveryCodes);
    }
  }, [state.recoveryCodes, onSuccess]);

  return (
    <section
      className="rounded-xl p-5 space-y-4"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <div>
        <h2
          className="text-sm font-semibold"
          style={{ color: "var(--admin-text)" }}>
          Rigenera recovery codes
        </h2>
        <p
          className="text-xs mt-1"
          style={{ color: "var(--admin-text-muted)" }}>
          I 10 codici precedenti verranno invalidati e te ne mostreremo 10
          nuovi. Per confermare ti chiediamo il codice corrente dell'app
          autenticatore.
        </p>
      </div>

      <form action={action} className="space-y-4">
        <div>
          <label
            htmlFor="admin-mfa-regen-token"
            className="text-xs font-semibold block"
            style={{ color: "var(--admin-text)" }}>
            Codice autenticatore
          </label>
          <input
            id="admin-mfa-regen-token"
            name="token"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            autoFocus
            placeholder="000000"
            className="mt-1 w-48 px-3 py-2 rounded-md font-mono text-lg tracking-widest text-center"
            style={{
              background: "var(--admin-input-bg)",
              border: "1px solid var(--admin-input-border)",
              color: "var(--admin-text)",
            }}
          />
        </div>

        {state.error && (
          <p className="text-sm" style={{ color: "#dc2626" }}>
            {state.error}
          </p>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
            style={{ background: "var(--admin-accent)" }}>
            {pending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Genero…
              </>
            ) : (
              "Rigenera"
            )}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
            style={{
              background: "transparent",
              color: "var(--admin-text-muted)",
            }}>
            Annulla
          </button>
        </div>
      </form>
    </section>
  );
}
