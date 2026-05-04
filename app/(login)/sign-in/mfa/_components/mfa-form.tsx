"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { Loader2, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/auth/middleware";
import { verifyMfa } from "../actions";

type Mode = "totp" | "recovery";

type Props = {
  logoUrl: string | null;
  appName: string;
};

export function MfaChallengeForm({ logoUrl, appName }: Props) {
  const [mode, setMode] = useState<Mode>("totp");
  const [state, action, pending] = useActionState<ActionState, FormData>(
    verifyMfa,
    {},
  );

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 py-12 bg-brand-bg">
      <div className="w-full max-w-md">
        {/* Logo o nome app — dai settings runtime */}
        <div className="flex justify-center mb-6">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={appName}
              width={160}
              height={48}
              className="h-12 w-auto"
              priority
              unoptimized
            />
          ) : (
            <span className="text-xl font-semibold text-brand-text">
              {appName}
            </span>
          )}
        </div>

        <div className="rounded-2xl p-8 shadow-sm border border-brand-border bg-brand-surface">
          {/* Header */}
          <div className="mb-8">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 bg-brand-bg">
              <ShieldCheck className="h-6 w-6 text-brand-primary" />
            </div>
            <h1 className="text-2xl font-semibold mb-1 text-brand-text">
              Verifica in due fattori
            </h1>
            <p className="text-sm text-brand-text-muted">
              {mode === "totp"
                ? "Inserisci il codice generato dalla tua app autenticatore."
                : "Inserisci uno dei recovery codes che hai salvato. Ogni codice si può usare una sola volta."}
            </p>
          </div>

          {/* Form */}
          <form action={action} className="space-y-6">
            <div className="space-y-2">
              <Label
                htmlFor="mfa-challenge-code"
                className="text-xs font-semibold uppercase tracking-wide text-brand-label">
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
                // Reset del valore quando cambia mode: senza key l'input non si
                // rerenderizza e pattern/inputMode possono confliggere col valore.
                key={mode}
                className={
                  mode === "totp"
                    ? "h-14 text-center text-xl font-bold font-mono tracking-widest"
                    : "h-12 text-center text-base font-mono tracking-wider"
                }
                placeholder={mode === "totp" ? "000000" : "abcde-fghij"}
              />
            </div>

            {state.error && (
              <div className="rounded-xl px-4 py-3 text-sm flex items-center gap-2 bg-brand-error-bg text-brand-destructive">
                <X className="h-4 w-4 shrink-0" />
                {state.error}
              </div>
            )}

            <Button type="submit" disabled={pending} className="w-full">
              {pending ? (
                <>
                  <Loader2 className="animate-spin h-4 w-4" /> Verifica in
                  corso...
                </>
              ) : (
                "Verifica"
              )}
            </Button>
          </form>

          {/* Toggle modalità */}
          <div className="mt-6 pt-6 border-t border-brand-border text-center">
            <button
              type="button"
              className="text-sm text-brand-primary underline-offset-2 hover:underline cursor-pointer"
              onClick={() => setMode((m) => (m === "totp" ? "recovery" : "totp"))}>
              {mode === "totp"
                ? "Non hai accesso all'app autenticatore? Usa un recovery code"
                : "Torna al codice dell'app autenticatore"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
