"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/auth/middleware";
import { Loader2, ShieldCheck, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { verifyMfa } from "@/app/(login)/sign-in/mfa/actions";

type Mode = "totp" | "recovery";

export function AdminMfaChallengeForm() {
  const t = useTranslations("auth");
  const [mode, setMode] = useState<Mode>("totp");
  const [state, action, pending] = useActionState<ActionState, FormData>(
    verifyMfa,
    {},
  );

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl p-8 shadow-sm border border-gray-200 bg-white">
          <div className="mb-8">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 bg-[#fff1e6]">
              <ShieldCheck className="h-5 w-5 text-[#e07a3a]" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#e07a3a] mb-1">
              Admin
            </p>
            <h1 className="text-2xl font-semibold text-gray-900">
              {t("mfa.title")}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {mode === "totp"
                ? t("mfa.subtitleTotp")
                : t("mfa.subtitleRecovery")}
            </p>
          </div>

          <form action={action} className="space-y-5">
            <div className="space-y-1.5">
              <Label
                htmlFor="admin-mfa-challenge-code"
                className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {mode === "totp"
                  ? t("fields.totpCode")
                  : t("fields.recoveryCode")}
              </Label>
              <Input
                id="admin-mfa-challenge-code"
                name="code"
                type="text"
                inputMode={mode === "totp" ? "numeric" : "text"}
                autoComplete="one-time-code"
                pattern={mode === "totp" ? "[0-9]*" : undefined}
                maxLength={mode === "totp" ? 6 : 16}
                required
                autoFocus
                key={mode}
                className={
                  mode === "totp"
                    ? "h-14 text-center text-xl font-bold font-mono tracking-widest"
                    : "h-12 text-center text-base font-mono tracking-wider"
                }
                placeholder={
                  mode === "totp"
                    ? t("fields.totpPlaceholder")
                    : t("fields.recoveryPlaceholder")
                }
              />
            </div>

            {state.error && (
              <div className="rounded-xl px-4 py-3 text-sm flex items-center gap-2 bg-red-50 text-red-600 border border-red-200">
                <X className="h-4 w-4 shrink-0" />
                {state.error}
              </div>
            )}

            <Button
              type="submit"
              disabled={pending}
              className="w-full bg-[#e07a3a] hover:bg-[#c9622a] text-white">
              {pending ? (
                <>
                  <Loader2 className="animate-spin h-4 w-4" />{" "}
                  {t("mfa.submitPending")}
                </>
              ) : (
                t("mfa.submit")
              )}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-200 text-center">
            <button
              type="button"
              className="text-sm text-[#e07a3a] underline-offset-2 hover:underline cursor-pointer"
              onClick={() => setMode((m) => (m === "totp" ? "recovery" : "totp"))}>
              {mode === "totp"
                ? t("mfa.switchToRecovery")
                : t("mfa.switchToTotp")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
