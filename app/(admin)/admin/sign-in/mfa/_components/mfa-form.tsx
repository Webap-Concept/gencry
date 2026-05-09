"use client";

// MFA challenge form per il flusso admin. Stesso vincolo di
// `admin-login.tsx`: niente import da `@/components/ui/*`, niente classi
// `gc-*`/`brand-*` — solo token `--admin-*` di admin.css.

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

  const codeInputClass =
    mode === "totp"
      ? "h-14 text-center text-xl font-bold font-mono tracking-widest"
      : "h-12 text-center text-base font-mono tracking-wider";

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div
          className="rounded-2xl p-8 shadow-sm"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          <div className="mb-8">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
              style={{ background: "var(--admin-accent-soft)" }}>
              <ShieldCheck
                className="h-5 w-5"
                style={{ color: "var(--admin-accent)" }}
              />
            </div>
            <p
              className="text-xs font-semibold uppercase tracking-widest mb-1"
              style={{ color: "var(--admin-accent)" }}>
              Admin
            </p>
            <h1
              className="text-2xl font-semibold"
              style={{ color: "var(--admin-text)" }}>
              {t("mfa.title")}
            </h1>
            <p
              className="text-sm mt-1"
              style={{ color: "var(--admin-text-muted)" }}>
              {mode === "totp"
                ? t("mfa.subtitleTotp")
                : t("mfa.subtitleRecovery")}
            </p>
          </div>

          <form action={action} className="space-y-5">
            <div className="space-y-1.5">
              <label
                htmlFor="admin-mfa-challenge-code"
                className="block text-xs font-semibold uppercase tracking-wide"
                style={{ color: "var(--admin-text-muted)" }}>
                {mode === "totp"
                  ? t("fields.totpCode")
                  : t("fields.recoveryCode")}
              </label>
              <input
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
                placeholder={
                  mode === "totp"
                    ? t("fields.totpPlaceholder")
                    : t("fields.recoveryPlaceholder")
                }
                className={`flex w-full min-w-0 rounded-full px-4 outline-none transition-colors disabled:pointer-events-none disabled:opacity-50 ${codeInputClass}`}
                style={{
                  background: "var(--admin-input-bg)",
                  color: "var(--admin-text)",
                  border: "1px solid var(--admin-input-border)",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--admin-accent)";
                  e.currentTarget.style.boxShadow =
                    "0 0 0 2px color-mix(in srgb, var(--admin-accent) 25%, transparent)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--admin-input-border)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>

            {state.error && (
              <div
                className="rounded-xl px-4 py-3 text-sm flex items-center gap-2"
                style={{
                  background: "var(--admin-destructive-bg)",
                  color: "var(--admin-destructive)",
                  border: "1px solid var(--admin-destructive-border)",
                }}>
                <X className="h-4 w-4 shrink-0" />
                {state.error}
              </div>
            )}

            <button
              type="submit"
              disabled={pending}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full text-sm font-semibold h-10 px-4 py-2.5 text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: "var(--admin-accent)" }}
              onMouseEnter={(e) => {
                if (!pending)
                  e.currentTarget.style.background =
                    "var(--admin-accent-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--admin-accent)";
              }}>
              {pending ? (
                <>
                  <Loader2 className="animate-spin h-4 w-4" />{" "}
                  {t("mfa.submitPending")}
                </>
              ) : (
                t("mfa.submit")
              )}
            </button>
          </form>

          <div
            className="mt-6 pt-6 text-center"
            style={{ borderTop: "1px solid var(--admin-card-border)" }}>
            <button
              type="button"
              className="text-sm underline-offset-2 hover:underline cursor-pointer"
              style={{ color: "var(--admin-accent)" }}
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
