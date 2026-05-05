// app/(login)/reset-password/reset-password-form.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionState } from "@/lib/auth/middleware";
import { Check, KeyRound, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState, useState } from "react";
import { resetPassword } from "./actions";

export default function ResetPasswordForm() {
  const t = useTranslations("auth");
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const passwordRules = [
    { id: "min", label: t("passwordRulesLong.min"), test: (p: string) => p.length >= 8 },
    { id: "upper", label: t("passwordRulesLong.upper"), test: (p: string) => /[A-Z]/.test(p) },
    { id: "number", label: t("passwordRulesLong.number"), test: (p: string) => /[0-9]/.test(p) },
  ];

  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    resetPassword,
    { error: "" },
  );

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmError, setConfirmError] = useState("");

  const validateConfirm = (value: string) => {
    if (!value) {
      setConfirmError("");
      return;
    }
    setConfirmError(value === password ? "" : t("validation.passwordMismatch"));
  };

  if (!token) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-4 py-12 bg-brand-bg">
        <div className="w-full max-w-md">
          <div className="rounded-2xl p-8 shadow-sm border border-brand-border bg-brand-surface text-center">
            <p className="text-brand-text-muted text-sm mb-4">
              {t("resetPassword.invalidLinkTitle")}
            </p>
            <Link
              href="/forgot-password"
              className="text-sm font-semibold text-brand-primary hover:underline">
              {t("resetPassword.invalidLinkAction")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 py-12 bg-brand-bg">
      <div className="w-full max-w-md">
        <div className="rounded-2xl p-8 shadow-sm border border-brand-border bg-brand-surface">
          <div className="mb-8">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 bg-brand-bg">
              <KeyRound className="h-6 w-6 text-brand-primary" />
            </div>
            <h1 className="text-2xl font-semibold mb-1 text-brand-text">
              {t("resetPassword.title")}
            </h1>
            <p className="text-sm text-brand-text-muted">
              {t("resetPassword.subtitle")}
            </p>
          </div>

          <form action={formAction} className="space-y-5">
            <input type="hidden" name="token" value={token} />

            <div className="space-y-1.5">
              <Label
                htmlFor="password"
                className="text-xs font-semibold uppercase tracking-wide text-brand-label">
                {t("fields.newPassword")}
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (confirmPassword) validateConfirm(confirmPassword);
                }}
                required
                minLength={8}
                maxLength={30}
                placeholder={t("fields.passwordPlaceholder")}
              />
              {password.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {passwordRules.map((rule) => {
                    const passed = rule.test(password);
                    return (
                      <li
                        key={rule.id}
                        className={`text-xs flex items-center gap-1.5 transition-colors duration-200 ${passed ? "text-brand-accent-hover" : "text-brand-text-light"}`}>
                        {passed ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <X className="h-3 w-3" />
                        )}
                        {rule.label}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="confirmPassword"
                className="text-xs font-semibold uppercase tracking-wide text-brand-label">
                {t("fields.confirmPassword")}
              </Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  validateConfirm(e.target.value);
                }}
                required
                minLength={8}
                maxLength={30}
                placeholder={t("fields.passwordPlaceholder")}
                aria-invalid={!!confirmError}
                className={
                  confirmPassword && !confirmError ? "border-brand-accent" : ""
                }
              />
              {confirmError && (
                <p className="text-xs flex items-center gap-1 text-brand-destructive">
                  <X className="h-3 w-3" /> {confirmError}
                </p>
              )}
              {confirmPassword && !confirmError && (
                <p className="text-xs flex items-center gap-1 text-brand-accent-hover">
                  <Check className="h-3 w-3" /> {t("validation.passwordMatch")}
                </p>
              )}
            </div>

            {state?.error && (
              <div className="rounded-xl px-4 py-3 text-sm flex items-center gap-2 bg-brand-error-bg text-brand-destructive">
                <X className="h-4 w-4 shrink-0" />
                {state.error}
              </div>
            )}

            <Button type="submit" disabled={pending} className="w-full">
              {pending ? (
                <>
                  <Loader2 className="animate-spin h-4 w-4" />{" "}
                  {t("resetPassword.submitPending")}
                </>
              ) : (
                t("resetPassword.submit")
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
