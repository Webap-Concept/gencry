"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/lib/auth/middleware";
import { disableMfaAction } from "@/app/(protected)/settings/security/actions";

type Props = {
  onCancel: () => void;
};

export function AdminMfaDisableForm({ onCancel }: Props) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionState, FormData>(
    disableMfaAction,
    {},
  );

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

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
          Disabilita autenticazione a due fattori
        </h2>
        <p
          className="text-xs mt-1"
          style={{ color: "var(--admin-text-muted)" }}>
          Per sicurezza ti chiediamo di confermare con la password e con il
          codice corrente della tua app autenticatore. Tutti i recovery codes
          verranno invalidati.
        </p>
      </div>

      <form action={action} className="space-y-4">
        <div>
          <label
            htmlFor="admin-mfa-disable-password"
            className="text-xs font-semibold block"
            style={{ color: "var(--admin-text)" }}>
            Password
          </label>
          <input
            id="admin-mfa-disable-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="mt-1 w-full px-3 py-2 rounded-md text-sm"
            style={{
              background: "var(--admin-input-bg)",
              border: "1px solid var(--admin-input-border)",
              color: "var(--admin-text)",
            }}
          />
        </div>

        <div>
          <label
            htmlFor="admin-mfa-disable-token"
            className="text-xs font-semibold block"
            style={{ color: "var(--admin-text)" }}>
            Codice autenticatore
          </label>
          <input
            id="admin-mfa-disable-token"
            name="token"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
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
            style={{ background: "#dc2626" }}>
            {pending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Disabilito…
              </>
            ) : (
              "Disabilita"
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
