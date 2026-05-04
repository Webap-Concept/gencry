"use client";

import { useActionState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type MfaRegenerateState,
  regenerateRecoveryCodesAction,
} from "../actions";

type Props = {
  onSuccess: (recoveryCodes: string[]) => void;
  onCancel: () => void;
};

export function MfaRegenerateForm({ onSuccess, onCancel }: Props) {
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
    <section className="space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold text-gc-fg">
          Rigenera recovery codes
        </h2>
        <p className="text-[12.5px] text-gc-fg-3 mt-0.5">
          I 10 codici precedenti verranno invalidati e te ne mostreremo 10 nuovi.
          Per confermare ti chiediamo il codice corrente dell'app autenticatore.
        </p>
      </div>

      <form
        action={action}
        className="rounded-2xl border border-gc-line bg-gc-bg-2 p-5 space-y-4"
      >
        <div>
          <Label
            htmlFor="mfa-regen-token"
            className="text-[13px] font-semibold text-gc-fg"
          >
            Codice autenticatore
          </Label>
          <Input
            id="mfa-regen-token"
            name="token"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            autoFocus
            className="mt-1 font-mono text-lg tracking-widest text-center max-w-[12rem]"
            placeholder="000000"
          />
        </div>

        {state.error && (
          <p className="text-[13px] text-gc-neg">{state.error}</p>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="submit" disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Genero…
              </>
            ) : (
              "Rigenera"
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={pending}
          >
            Annulla
          </Button>
        </div>
      </form>
    </section>
  );
}
