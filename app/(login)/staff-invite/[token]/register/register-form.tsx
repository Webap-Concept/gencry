"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/auth/middleware";
import { validateUsernameFormat } from "@/lib/auth/username-validator";
import { Check, Loader2, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { registerViaInvite } from "./actions";

const passwordRules = [
  { id: "min", label: "8+ caratteri", test: (p: string) => p.length >= 8 },
  { id: "upper", label: "Una maiuscola", test: (p: string) => /[A-Z]/.test(p) },
  { id: "number", label: "Un numero", test: (p: string) => /[0-9]/.test(p) },
  { id: "special", label: "Un carattere speciale", test: (p: string) => /[^a-zA-Z0-9]/.test(p) },
];

interface Props {
  token: string;
  email: string;
  roleLabel: string;
  roleColor: string;
  termsSlug: string;
  privacySlug: string;
}

export default function StaffRegisterForm({
  token,
  email,
  roleLabel,
  roleColor,
  termsSlug,
  privacySlug,
}: Props) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    registerViaInvite,
    { error: "" },
  );

  const [username, setUsername] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmError, setConfirmError] = useState("");

  function handleUsernameChange(value: string) {
    setUsername(value);
    if (value.length >= 3) {
      const result = validateUsernameFormat(value);
      setUsernameError(result.ok ? "" : result.error);
    } else {
      setUsernameError("");
    }
  }

  function validateConfirm(value: string) {
    setConfirmError(value && value !== password ? "Le password non coincidono" : "");
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 py-12 bg-brand-bg">
      <div className="w-full max-w-md">
        <div className="rounded-2xl p-8 shadow-sm border border-brand-border bg-brand-surface">
          {/* Header */}
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 bg-brand-bg">
            <ShieldCheck className="h-6 w-6 text-brand-primary" />
          </div>
          <h1 className="text-2xl font-semibold mb-1 text-brand-text">
            Crea il tuo account Staff
          </h1>
          <p className="text-sm text-brand-text-muted mb-1">
            Il tuo account verrà creato con il ruolo{" "}
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
              style={{
                background: roleColor + "18",
                color: roleColor,
                border: `1px solid ${roleColor}40`,
              }}
            >
              {roleLabel}
            </span>
            .
          </p>
          <p className="text-xs text-brand-text-light mb-6">
            Al termine sarai reindirizzato al pannello admin.
          </p>

          <form action={formAction} className="space-y-5">
            <input type="hidden" name="token" value={token} />

            {/* Email — read-only */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-brand-label">
                Email
              </Label>
              <Input
                value={email}
                readOnly
                tabIndex={-1}
                className="opacity-60 cursor-not-allowed"
              />
              <input type="hidden" name="email" value={email} />
            </div>

            {/* Username */}
            <div className="space-y-1.5">
              <Label
                htmlFor="username"
                className="text-xs font-semibold uppercase tracking-wide text-brand-label">
                Username
              </Label>
              <Input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                required
                minLength={3}
                maxLength={50}
                placeholder="il_tuo_username"
                aria-invalid={!!usernameError}
                className={
                  username && !usernameError ? "border-brand-accent" : ""
                }
              />
              {usernameError && (
                <p className="text-xs flex items-center gap-1 text-brand-destructive">
                  <X className="h-3 w-3" /> {usernameError}
                </p>
              )}
              {username.length >= 3 && !usernameError && (
                <p className="text-xs flex items-center gap-1 text-brand-accent-hover">
                  <Check className="h-3 w-3" /> Username valido
                </p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <Label
                htmlFor="password"
                className="text-xs font-semibold uppercase tracking-wide text-brand-label">
                Password
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
                placeholder="••••••••"
              />
              {password.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {passwordRules.map((rule) => {
                    const passed = rule.test(password);
                    return (
                      <li
                        key={rule.id}
                        className={`text-xs flex items-center gap-1.5 transition-colors duration-200 ${passed ? "text-brand-accent-hover" : "text-brand-text-light"}`}>
                        {passed ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        {rule.label}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Confirm password */}
            <div className="space-y-1.5">
              <Label
                htmlFor="confirmPassword"
                className="text-xs font-semibold uppercase tracking-wide text-brand-label">
                Conferma password
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
                placeholder="••••••••"
                aria-invalid={!!confirmError}
                className={confirmPassword && !confirmError ? "border-brand-accent" : ""}
              />
              {confirmError && (
                <p className="text-xs flex items-center gap-1 text-brand-destructive">
                  <X className="h-3 w-3" /> {confirmError}
                </p>
              )}
              {confirmPassword && !confirmError && (
                <p className="text-xs flex items-center gap-1 text-brand-accent-hover">
                  <Check className="h-3 w-3" /> Le password coincidono
                </p>
              )}
            </div>

            {/* Terms & Privacy */}
            <div className="space-y-2.5 pt-1">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  name="acceptTerms"
                  required
                  className="mt-0.5 h-4 w-4 rounded border-brand-border accent-brand-primary"
                />
                <span className="text-xs text-brand-text-muted leading-relaxed">
                  Accetto i{" "}
                  <Link href={`/${termsSlug}`} target="_blank" className="underline text-brand-text hover:text-brand-primary">
                    Termini di Servizio
                  </Link>
                </span>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  name="acceptPrivacy"
                  required
                  className="mt-0.5 h-4 w-4 rounded border-brand-border accent-brand-primary"
                />
                <span className="text-xs text-brand-text-muted leading-relaxed">
                  Accetto la{" "}
                  <Link href={`/${privacySlug}`} target="_blank" className="underline text-brand-text hover:text-brand-primary">
                    Privacy Policy
                  </Link>
                </span>
              </label>
            </div>

            {/* Error */}
            {state?.error && (
              <div className="rounded-xl px-4 py-3 text-sm flex items-center gap-2 bg-brand-error-bg text-brand-destructive">
                <X className="h-4 w-4 shrink-0" />
                {state.error}
              </div>
            )}

            <Button
              type="submit"
              disabled={pending || !!confirmError || !!usernameError}
              className="w-full">
              {pending ? (
                <>
                  <Loader2 className="animate-spin h-4 w-4" /> Creazione account…
                </>
              ) : (
                "Crea account e accedi"
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
