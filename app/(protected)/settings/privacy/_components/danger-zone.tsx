"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/auth/middleware";
import { requestAccountDeletionAction } from "../actions";

const GRACE_DAYS = 30;

export function DangerZone({ hasPassword }: { hasPassword: boolean }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold text-gc-fg">
          Eliminazione account
        </h2>
        <p className="text-[12.5px] text-gc-fg-3 mt-0.5">
          Quando elimini l'account avvii una richiesta di cancellazione: i
          tuoi dati restano inaccessibili per {GRACE_DAYS} giorni e vengono
          poi eliminati definitivamente. Per annullare la richiesta entro
          quel periodo dovrai contattare l'assistenza.
        </p>
      </div>

      <article className="rounded-2xl border border-gc-neg/30 bg-gc-bg-2 p-4">
        {!confirming ? (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gc-neg/10 text-gc-neg">
                <AlertTriangle size={18} strokeWidth={1.7} />
              </div>
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-gc-fg">
                  Elimina il mio account
                </p>
                <p className="mt-0.5 text-[12px] text-gc-fg-3">
                  Azione irreversibile dopo i {GRACE_DAYS} giorni di grace
                  period.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-gc-neg hover:text-gc-neg"
              onClick={() => setConfirming(true)}
              disabled={!hasPassword}
              title={
                hasPassword
                  ? undefined
                  : "Account Google: contatta l'assistenza per eliminare"
              }
            >
              Elimina account
            </Button>
          </div>
        ) : (
          <DeletionForm onCancel={() => setConfirming(false)} />
        )}

        {!hasPassword && !confirming && (
          <p className="mt-3 text-[11.5px] text-gc-fg-3">
            Il tuo account è collegato a Google e non ha una password locale.
            Per eliminarlo contatta l'assistenza.
          </p>
        )}
      </article>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Form di conferma
// ---------------------------------------------------------------------------

function DeletionForm({ onCancel }: { onCancel: () => void }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    requestAccountDeletionAction,
    {},
  );
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={action} className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gc-neg/10 text-gc-neg">
          <AlertTriangle size={18} strokeWidth={1.7} />
        </div>
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-gc-fg">
            Conferma eliminazione account
          </p>
          <p className="mt-0.5 text-[12px] text-gc-fg-3">
            Inserisci la password per confermare. La sessione verrà chiusa e
            non potrai più accedere; entro {GRACE_DAYS} giorni potrai
            annullare la richiesta contattando l'assistenza.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="deletion-password">Password attuale</Label>
        <div className="relative">
          <Input
            id="deletion-password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            maxLength={100}
            className="pr-10"
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={
              showPassword ? "Nascondi password" : "Mostra password"
            }
            className="absolute inset-y-0 right-0 flex items-center px-3 text-gc-fg-3 hover:text-gc-fg transition-colors"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          name="confirmDelete"
          required
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-gc-line accent-gc-neg cursor-pointer"
        />
        <span className="text-[12.5px] text-gc-fg leading-relaxed">
          Capisco che dopo {GRACE_DAYS} giorni i miei dati saranno eliminati
          in modo permanente e non potranno essere recuperati.
        </span>
      </label>

      {state.error && (
        <p className="text-[13px] text-gc-neg">{state.error}</p>
      )}

      <div className="flex flex-wrap justify-end gap-2 border-t border-gc-line pt-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={pending}
        >
          Annulla
        </Button>
        <Button
          type="submit"
          variant="destructive"
          size="sm"
          disabled={pending}
        >
          {pending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Elimino…
            </>
          ) : (
            "Elimina definitivamente"
          )}
        </Button>
      </div>
    </form>
  );
}
