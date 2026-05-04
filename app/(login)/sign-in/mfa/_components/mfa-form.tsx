"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/auth/middleware";
import { verifyMfa } from "../actions";

type Mode = "totp" | "recovery";

export function MfaChallengeForm() {
  const [mode, setMode] = useState<Mode>("totp");
  const [state, action, pending] = useActionState<ActionState, FormData>(
    verifyMfa,
    {},
  );

  return (
    <div className="space-y-5 max-w-md">
      <div>
        <h1 className="text-xl font-semibold text-gc-fg">
          Verifica in due fattori
        </h1>
        <p className="text-[13px] text-gc-fg-3 mt-1">
          {mode === "totp"
            ? "Inserisci il codice generato dalla tua app autenticatore."
            : "Inserisci uno dei recovery codes che hai salvato. Ogni codice si può usare una sola volta."}
        </p>
      </div>

      <form action={action} className="space-y-4">
        <div>
          <Label
            htmlFor="mfa-challenge-code"
            className="text-[13px] font-semibold text-gc-fg"
          >
            {mode === "totp" ? "Codice a 6 cifre" : "Recovery code"}
          </Label>
          <Input
            id="mfa-challenge-code"
            name="code"
            type="text"
            inputMode={mode === "totp" ? "numeric" : "text"}
            autoComplete="one-time-code"
            pattern={mode === "totp" ? "[0-9]*" : undefined}
            maxLength={mode === "totp" ? 6 : 16}
            required
            autoFocus
            // Reset del valore quando si cambia mode: senza key l'input non si
            // rerenderizza e il pattern/inputMode possono confliggere col valore.
            key={mode}
            className={
              mode === "totp"
                ? "mt-1 font-mono text-lg tracking-widest text-center max-w-[12rem]"
                : "mt-1 font-mono text-base tracking-wider"
            }
            placeholder={mode === "totp" ? "000000" : "abcde-fghij"}
          />
        </div>

        {state.error && (
          <p className="text-[13px] text-gc-neg">{state.error}</p>
        )}

        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Verifico…
            </>
          ) : (
            "Verifica"
          )}
        </Button>
      </form>

      <button
        type="button"
        className="text-[13px] text-gc-fg-3 hover:text-gc-fg underline underline-offset-2 cursor-pointer"
        onClick={() => setMode((m) => (m === "totp" ? "recovery" : "totp"))}
      >
        {mode === "totp"
          ? "Non hai accesso all'app autenticatore? Usa un recovery code"
          : "Torna al codice dell'app autenticatore"}
      </button>
    </div>
  );
}
