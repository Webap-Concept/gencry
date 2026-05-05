"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionState } from "@/lib/auth/middleware";
import { validateUsernameFormat } from "@/lib/auth/username-validator";
import { Turnstile } from "@marsidev/react-turnstile";
import { Check, Eye, EyeOff, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState, useState } from "react";
import {
  checkEmailAction,
  checkUsernameAction,
  signIn,
  signUp,
} from "./actions";

// ---------------------------------------------------------------------------
// Icona Google SVG inline (no dipendenze esterne)
// ---------------------------------------------------------------------------
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function OrDivider({ label }: { label: string }) {
  return (
    <div className="relative flex items-center gap-3 py-1">
      <div className="flex-1 h-px bg-brand-border" />
      <span className="text-xs font-medium text-brand-text-muted uppercase tracking-widest select-none">
        {label}
      </span>
      <div className="flex-1 h-px bg-brand-border" />
    </div>
  );
}

function GoogleButton({ label }: { label: string }) {
  return (
    <a
      href="/api/auth/google"
      className="flex w-full items-center justify-center gap-3 rounded-full border border-brand-border bg-brand-surface px-4 py-2.5 text-sm font-medium text-brand-text shadow-sm transition-all hover:bg-brand-surface-hover hover:shadow-md active:scale-[0.98]">
      <GoogleIcon className="h-5 w-5 shrink-0" />
      {label}
    </a>
  );
}

export function Login({
  mode = "signin",
  registrationsEnabled = true,
  isMaintenance = false,
  systemPageSlugs,
  turnstileSiteKey,
}: {
  mode?: "signin" | "signup";
  registrationsEnabled?: boolean;
  isMaintenance?: boolean;
  systemPageSlugs?: Record<string, string>;
  turnstileSiteKey?: string | null;
}) {
  const t = useTranslations("auth");
  const slugs = systemPageSlugs;

  const passwordRules = [
    { id: "min", label: t("passwordRulesShort.min"), test: (p: string) => p.length >= 8 },
    { id: "upper", label: t("passwordRulesShort.upper"), test: (p: string) => /[A-Z]/.test(p) },
    { id: "number", label: t("passwordRulesShort.number"), test: (p: string) => /[0-9]/.test(p) },
    { id: "special", label: t("passwordRulesShort.special"), test: (p: string) => /[^a-zA-Z0-9]/.test(p) },
  ];

  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");
  const priceId = searchParams.get("priceId");
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    mode === "signin" ? signIn : signUp,
    { error: "" },
  );

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailAvailable, setEmailAvailable] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptMarketing, setAcceptMarketing] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");

  // Messaggio errore OAuth da searchParams
  const oauthError = searchParams.get("error");
  const OAUTH_ERROR_KEYS = new Set([
    "oauth_denied",
    "oauth_invalid",
    "oauth_failed",
    "oauth_init_failed",
    "oauth_user_failed",
    "oauth_domain_blocked",
    "registrations_disabled",
    "maintenance",
    "blocked",
    "banned",
    "account_deleted",
  ]);
  const oauthErrorMessage = oauthError
    ? OAUTH_ERROR_KEYS.has(oauthError)
      ? t(`oauthError.${oauthError}` as never)
      : t("oauthError.generic")
    : null;

  // Banner informativo (non error) per scenari come l'utente che ha appena
  // richiesto l'eliminazione del proprio account.
  const reasonParam = searchParams.get("reason");
  const REASON_KEYS = new Set(["deletion_requested"]);
  const reasonMessage =
    reasonParam && REASON_KEYS.has(reasonParam)
      ? t(`reason.${reasonParam}` as never)
      : null;

  const validateEmail = async (value: string) => {
    if (!value) {
      setEmailError("");
      setEmailAvailable(false);
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setEmailError(t("validation.emailInvalid"));
      setEmailAvailable(false);
      return;
    }

    if (mode !== "signup") {
      setEmailError("");
      setEmailAvailable(false);
      return;
    }

    setCheckingEmail(true);
    setEmailAvailable(false);

    try {
      const result = await checkEmailAction(value);
      setEmailError(result.error ?? "");
      setEmailAvailable(Boolean(result.available));
    } catch {
      setEmailError(t("validation.emailCheckFailed"));
      setEmailAvailable(false);
    } finally {
      setCheckingEmail(false);
    }
  };

  const validateUsername = async (value: string) => {
    if (!value) {
      setUsernameError("");
      setUsernameAvailable(false);
      return;
    }
    if (value.length < 3) {
      setUsernameError(t("validation.usernameMinLength"));
      setUsernameAvailable(false);
      return;
    }
    const formatCheck = validateUsernameFormat(value);
    if (!formatCheck.ok) {
      setUsernameError(formatCheck.error);
      setUsernameAvailable(false);
      return;
    }

    setCheckingUsername(true);
    setUsernameAvailable(false);
    try {
      const result = await checkUsernameAction(value);
      setUsernameError(result.error ?? "");
      setUsernameAvailable(Boolean(result.available));
    } catch {
      setUsernameError(t("validation.usernameCheckFailed"));
      setUsernameAvailable(false);
    } finally {
      setCheckingUsername(false);
    }
  };

  // Guard client-side: mostra errori inline invece di bloccare il bottone
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (mode !== "signup") return;

    setSubmitAttempted(true);

    const allPasswordRulesPassed = passwordRules.every((rule) =>
      rule.test(password),
    );

    if (
      emailError ||
      usernameError ||
      !allPasswordRulesPassed ||
      !acceptTerms ||
      !acceptPrivacy
    ) {
      e.preventDefault();
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 py-12 bg-brand-bg">
      <div className="w-full max-w-md">
        <div className="rounded-2xl p-8 shadow-sm border border-brand-border bg-brand-surface">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold mb-1 text-brand-text">
              {mode === "signin" ? t("signin.title") : t("signup.title")}
            </h1>
            <p className="text-sm text-brand-text-muted">
              {mode === "signin" ? t("signin.subtitle") : t("signup.subtitle")}
            </p>
          </div>

          {oauthErrorMessage && (
            <div className="mb-5 rounded-xl px-4 py-3 text-sm flex items-center gap-2 bg-brand-error-bg text-brand-destructive">
              <X className="h-4 w-4 shrink-0" />
              {oauthErrorMessage}
            </div>
          )}

          {reasonMessage && (
            <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {reasonMessage}
            </div>
          )}

          {mode === "signin" && isMaintenance && (
            <div className="mb-6 rounded-xl px-4 py-3 flex items-start gap-3 bg-amber-50 border border-amber-200">
              <span className="text-lg leading-none mt-0.5">🔧</span>
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  {t("maintenance.title")}
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  {t("maintenance.subtitle")}
                </p>
              </div>
            </div>
          )}

          {mode === "signup" && !registrationsEnabled ? (
            <div className="rounded-xl px-4 py-8 text-center bg-amber-50 border border-amber-200">
              <p className="text-sm font-medium text-amber-800">
                {t("registrationsDisabled.title")}
              </p>
              <p className="text-xs text-amber-600 mt-1">
                {t("registrationsDisabled.subtitle")}
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <GoogleButton
                label={
                  mode === "signin" ? t("google.signin") : t("google.signup")
                }
              />

              <OrDivider label={t("common.or")} />

              <form
                className="space-y-5"
                action={formAction}
                onSubmit={handleSubmit}>
                <input type="hidden" name="redirect" value={redirect || ""} />
                <input type="hidden" name="priceId" value={priceId || ""} />

                {mode === "signup" && (
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="username"
                      className="text-xs font-semibold uppercase tracking-wide text-brand-label">
                      {t("fields.username")}
                    </Label>
                    <div
                      className={`flex rounded-full overflow-hidden border transition-colors ${
                        usernameError
                          ? "border-brand-destructive"
                          : username && !usernameError
                            ? "border-brand-accent"
                            : "border-brand-border"
                      } focus-within:ring-2 focus-within:ring-brand-accent focus-within:ring-offset-0`}>
                      <span className="flex items-center px-3 text-sm font-semibold select-none">
                        @
                      </span>
                      <Input
                        id="username"
                        name="username"
                        type="text"
                        autoComplete="username"
                        required
                        minLength={3}
                        maxLength={50}
                        placeholder={t("fields.usernamePlaceholder")}
                        value={username}
                        onChange={(e) => {
                          setUsername(e.target.value);
                          validateUsername(e.target.value);
                        }}
                        onBlur={(e) => {
                          void validateUsername(e.target.value);
                        }}
                        aria-invalid={!!usernameError}
                        className="flex-1 rounded-none border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                    </div>
                    {checkingUsername && (
                      <p className="text-xs flex items-center gap-1 text-brand-text-muted">
                        <Loader2 className="h-3 w-3 animate-spin" />{" "}
                        {t("validation.usernameChecking")}
                      </p>
                    )}
                    {usernameError && (
                      <p className="text-xs flex items-center gap-1 text-brand-destructive">
                        <X className="h-3 w-3" /> {usernameError}
                      </p>
                    )}
                    {username &&
                      !usernameError &&
                      usernameAvailable &&
                      !checkingUsername && (
                        <p className="text-xs flex items-center gap-1 text-brand-accent-hover">
                          <Check className="h-3 w-3" />{" "}
                          {t("validation.usernameAvailable")}
                        </p>
                      )}
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label
                    htmlFor="email"
                    className="text-xs font-semibold uppercase tracking-wide text-brand-label">
                    {t("fields.email")}
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setEmailAvailable(false);
                      setCheckingEmail(false);
                      if (emailError) {
                        setEmailError("");
                      }
                    }}
                    onBlur={(e) => {
                      void validateEmail(e.target.value);
                    }}
                    required
                    maxLength={50}
                    placeholder={t("fields.emailPlaceholder")}
                    aria-invalid={!!emailError}
                  />
                  {checkingEmail && (
                    <p className="text-xs flex items-center gap-1 text-brand-text-muted">
                      <Loader2 className="h-3 w-3 animate-spin" />{" "}
                      {t("validation.emailChecking")}
                    </p>
                  )}
                  {emailError && (
                    <p className="text-xs flex items-center gap-1 text-brand-destructive">
                      <X className="h-3 w-3" /> {emailError}
                    </p>
                  )}
                  {mode === "signup" &&
                    email &&
                    !emailError &&
                    emailAvailable &&
                    !checkingEmail && (
                      <p className="text-xs flex items-center gap-1 text-brand-accent-hover">
                        <Check className="h-3 w-3" />{" "}
                        {t("validation.emailAvailable")}
                      </p>
                    )}
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="password"
                    className="text-xs font-semibold uppercase tracking-wide text-brand-label">
                    {t("fields.password")}
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={
                        mode === "signin" ? "current-password" : "new-password"
                      }
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                      }}
                      required
                      minLength={8}
                      maxLength={30}
                      placeholder={t("fields.passwordPlaceholder")}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={
                        showPassword
                          ? t("common.hidePassword")
                          : t("common.showPassword")
                      }
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-brand-text-muted hover:text-brand-text transition-colors">
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {mode === "signup" && password.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                      {passwordRules.map((rule) => {
                        const passed = rule.test(password);
                        return (
                          <li
                            key={rule.id}
                            className={`text-xs flex items-center gap-1 transition-colors duration-200 ${
                              passed
                                ? "text-brand-accent-hover"
                                : "text-brand-text-light"
                            }`}>
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
                  {mode === "signup" && password.length === 0 && (
                    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                      {passwordRules.map((rule) => (
                        <li
                          key={rule.id}
                          className="text-xs flex items-center gap-1 text-brand-text-light">
                          <span className="w-3 text-center">•</span>{" "}
                          {rule.label}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {mode === "signin" && (
                  <div className="text-right">
                    <Link
                      href="/forgot-password"
                      className="text-xs text-brand-text-muted hover:text-brand-primary underline-offset-2 hover:underline">
                      {t("signin.forgotPassword")}
                    </Link>
                  </div>
                )}

                {mode === "signup" && (
                  <div className="space-y-3 pt-1">
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        name="acceptTerms"
                        checked={acceptTerms}
                        onChange={(e) => setAcceptTerms(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-brand-border accent-brand-accent cursor-pointer"
                      />
                      <span className="text-xs text-brand-text-muted leading-relaxed">
                        {t("consent.termsLabelPrefix")}{" "}
                        <Link
                          href={`/${slugs?.terms}`}
                          target="_blank"
                          className="font-medium text-brand-primary underline underline-offset-2 hover:text-brand-primary-hover">
                          {t("consent.termsLink")}
                        </Link>{" "}
                        {t("consent.termsLabelSuffix")}
                      </span>
                    </label>
                    {submitAttempted && !acceptTerms && (
                      <p className="text-xs flex items-center gap-1 text-brand-destructive -mt-2">
                        <X className="h-3 w-3" /> {t("consent.termsRequired")}
                      </p>
                    )}

                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        name="acceptPrivacy"
                        checked={acceptPrivacy}
                        onChange={(e) => setAcceptPrivacy(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-brand-border accent-brand-accent cursor-pointer"
                      />
                      <span className="text-xs text-brand-text-muted leading-relaxed">
                        {t("consent.privacyLabelPrefix")}{" "}
                        <Link
                          href={`/${slugs?.privacy}`}
                          target="_blank"
                          className="font-medium text-brand-primary underline underline-offset-2 hover:text-brand-primary-hover">
                          {t("consent.privacyLink")}
                        </Link>
                      </span>
                    </label>
                    {submitAttempted && !acceptPrivacy && (
                      <p className="text-xs flex items-center gap-1 text-brand-destructive -mt-2">
                        <X className="h-3 w-3" />{" "}
                        {t("consent.privacyRequired")}
                      </p>
                    )}

                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        name="acceptMarketing"
                        checked={acceptMarketing}
                        onChange={(e) => setAcceptMarketing(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-brand-border accent-brand-accent cursor-pointer"
                      />
                      <span className="text-xs text-brand-text-muted leading-relaxed">
                        {t("consent.marketingLabelPrefix")}{" "}
                        <Link
                          href={`/${slugs?.marketing}`}
                          target="_blank"
                          className="font-medium text-brand-primary underline underline-offset-2 hover:text-brand-primary-hover">
                          {t("consent.marketingLink")}
                        </Link>{" "}
                        {t("consent.marketingLabelSuffix")}
                      </span>
                    </label>
                  </div>
                )}

                {turnstileSiteKey && (
                  <>
                    <input
                      type="hidden"
                      name="cf_turnstile_token"
                      value={turnstileToken}
                    />
                    <Turnstile
                      siteKey={turnstileSiteKey}
                      onSuccess={setTurnstileToken}
                      onExpire={() => setTurnstileToken("")}
                      onError={() => setTurnstileToken("")}
                      options={{
                        theme: "light",
                        appearance: "interaction-only",
                      }}
                    />
                  </>
                )}

                {state?.error && (
                  <div className="rounded-xl px-4 py-3 text-sm flex items-center gap-2 bg-brand-error-bg text-brand-destructive">
                    <X className="h-4 w-4 shrink-0" />
                    {state.error}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={pending || checkingEmail || checkingUsername}
                  className="w-full">
                  {pending ? (
                    <>
                      <Loader2 className="animate-spin h-4 w-4" />{" "}
                      {t("common.loading")}
                    </>
                  ) : mode === "signin" ? (
                    t("signin.submit")
                  ) : (
                    t("signup.submit")
                  )}
                </Button>
              </form>
            </div>
          )}

          <div className="mt-6 text-center">
            <span className="text-sm text-brand-text-muted">
              {mode === "signin"
                ? t("signin.switchPrompt")
                : t("signup.switchPrompt")}
            </span>
            <Link
              href={`${
                mode === "signin" ? "/sign-up" : "/sign-in"
              }${redirect ? `?redirect=${redirect}` : ""}${priceId ? `&priceId=${priceId}` : ""}`}
              className="text-sm font-semibold underline-offset-2 hover:underline text-brand-primary">
              {mode === "signin" ? t("signin.switchLink") : t("signup.switchLink")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
