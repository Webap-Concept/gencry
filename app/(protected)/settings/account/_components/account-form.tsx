"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { mutate } from "swr";
import { Check, Eye, EyeOff, Link2, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/auth/middleware";
import { passwordRules } from "@/lib/account/password-rules";
import { OAUTH_PROVIDERS } from "@/lib/auth/oauth/providers";
import { checkEmailAction } from "@/app/(login)/actions";
import {
  cancelEmailChangeAction,
  changePasswordAction,
  confirmEmailChangeAction,
  requestEmailChangeAction,
  unlinkOAuthAction,
} from "../actions";

type LinkedAccount = { provider: string; linkedAt: string };

type Initial = {
  email: string;
  pendingEmail: string | null;
  hasPassword: boolean;
  linkedAccounts: LinkedAccount[];
};

export function AccountForm({ initial }: { initial: Initial }) {
  return (
    <div className="space-y-10">
      <EmailSection initial={initial} />
      <hr className="border-gc-line" />
      <PasswordSection
        hasPassword={initial.hasPassword}
        currentEmail={initial.email}
      />
      <hr className="border-gc-line" />
      <ConnectedAccountsSection
        linkedAccounts={initial.linkedAccounts}
        hasPassword={initial.hasPassword}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

function EmailSection({ initial }: { initial: Initial }) {
  const t = useTranslations("core.settings.account.email");
  // Stato locale per flip immediato del form al submit. router.refresh()
  // sincronizza il server component, ma può tardare e qui vogliamo che
  // l'utente veda subito il form di inserimento codice. La useEffect tiene
  // lo stato locale allineato al prop quando il server aggiorna initial
  // (es. dopo confirm/cancel/refresh esterno).
  const [pendingEmail, setPendingEmail] = useState(initial.pendingEmail);

  useEffect(() => {
    setPendingEmail(initial.pendingEmail);
  }, [initial.pendingEmail]);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold text-gc-fg">
          {t("sectionTitle")}
        </h2>
        <p className="text-[12.5px] text-gc-fg-3 mt-0.5">
          {t("sectionDescription")}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>{t("currentLabel")}</Label>
        <Input value={initial.email} disabled readOnly />
      </div>

      {pendingEmail ? (
        <ConfirmEmailChangeForm
          pendingEmail={pendingEmail}
          onCanceled={() => setPendingEmail(null)}
        />
      ) : (
        <RequestEmailChangeForm
          currentEmail={initial.email}
          onRequested={(newEmail) => setPendingEmail(newEmail)}
        />
      )}
    </section>
  );
}

function RequestEmailChangeForm({
  currentEmail,
  onRequested,
}: {
  currentEmail: string;
  onRequested: (newEmail: string) => void;
}) {
  const router = useRouter();
  const t = useTranslations("core.settings.account.email");
  const tShared = useTranslations("core.settings.shared");
  const [state, action, pending] = useActionState<ActionState, FormData>(
    requestEmailChangeAction,
    {},
  );
  const [showPassword, setShowPassword] = useState(false);

  // Email availability real-time check (stesso pattern di /sign-up)
  const [emailValue, setEmailValue] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailAvailable, setEmailAvailable] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Al successo della richiesta: notifica il parent per flippare subito al
  // form di conferma + sincronizza SWR/server. Non aspettiamo il refresh.
  useEffect(() => {
    if (state.success) {
      onRequested(emailValue.trim().toLowerCase());
      mutate("/api/user");
      router.refresh();
    }
    // emailValue volutamente escluso: leggiamo solo l'ultimo al momento del success.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = emailValue.trim();

    if (!trimmed) {
      setEmailError("");
      setEmailAvailable(false);
      setCheckingEmail(false);
      return;
    }

    // Stessa email corrente (case-insensitive) → segnala come no-op
    if (trimmed.toLowerCase() === currentEmail.toLowerCase()) {
      setEmailError(t("sameAsCurrent"));
      setEmailAvailable(false);
      setCheckingEmail(false);
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError(t("invalidFormat"));
      setEmailAvailable(false);
      setCheckingEmail(false);
      return;
    }

    setCheckingEmail(true);
    setEmailError("");
    setEmailAvailable(false);

    debounceRef.current = setTimeout(async () => {
      try {
        const result = await checkEmailAction(trimmed);
        setEmailError(result.error ?? "");
        setEmailAvailable(Boolean(result.available));
      } catch {
        setEmailError(t("checkFailed"));
        setEmailAvailable(false);
      } finally {
        setCheckingEmail(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [emailValue, currentEmail]);

  return (
    <form action={action} className="space-y-4">
      {/*
       * Username hidden field — disambigua le credenziali per il
       * password manager (vedi note nel form di cambio password).
       * Qui c'è un solo campo password ("attuale") quindi il rischio
       * è minore, ma il pattern resta raccomandato.
       */}
      <input
        type="text"
        name="username"
        value={currentEmail}
        autoComplete="username"
        readOnly
        aria-hidden="true"
        tabIndex={-1}
        style={{ display: "none" }}
      />

      <div className="space-y-1.5">
        <Label htmlFor="newEmail">{t("newLabel")}</Label>
        <Input
          id="newEmail"
          name="newEmail"
          type="email"
          autoComplete="email"
          required
          maxLength={255}
          placeholder={t("newPlaceholder")}
          value={emailValue}
          onChange={(e) => setEmailValue(e.target.value)}
          aria-invalid={!!emailError}
        />
        {checkingEmail ? (
          <p className="text-[11.5px] flex items-center gap-1 text-gc-fg-3 px-1">
            <Loader2 className="h-3 w-3 animate-spin" /> {t("checking")}
          </p>
        ) : emailError ? (
          <p className="text-[11.5px] flex items-center gap-1 text-gc-neg px-1">
            <X className="h-3 w-3" /> {emailError}
          </p>
        ) : emailAvailable ? (
          <p className="text-[11.5px] flex items-center gap-1 text-gc-success-fg px-1">
            <Check className="h-3 w-3" /> {t("available")}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="emailChangePassword">{t("currentPassword")}</Label>
        <div className="relative">
          <Input
            id="emailChangePassword"
            name="password"
            type={showPassword ? "text" : "password"}
            // autoComplete="off" + readonly-on-mount: i password manager
            // moderni IGNORANO autoComplete="off" sui type=password. Il
            // trucco readonly + remove-on-focus li blocca senza degradare
            // la UX (l'utente clicca, il field diventa editabile). Questo
            // campo è una PROVA DI IDENTITÀ: deve essere digitato a mano,
            // non riempito da un manager (un attacker con sessione attiva
            // o accesso fisico al device potrebbe cambiare email senza
            // conoscere la password).
            autoComplete="off"
            data-form-type="other"
            readOnly
            onFocus={(e) => e.currentTarget.removeAttribute("readonly")}
            required
            maxLength={100}
            className="pr-10"
            placeholder={tShared("passwordPlaceholder")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={
              showPassword
                ? tShared("hidePassword")
                : tShared("showPassword")
            }
            className="absolute inset-y-0 right-0 flex items-center px-3 text-gc-fg-3 hover:text-gc-fg transition-colors"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-[11.5px] text-gc-fg-3 px-1">{t("helpText")}</p>
      </div>

      {state.error && <p className="text-[13px] text-gc-neg">{state.error}</p>}
      {state.success && (
        <p className="text-[13px] text-gc-success-fg">{state.success}</p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? t("submitPending") : t("submitIdle")}
        </Button>
      </div>
    </form>
  );
}

function ConfirmEmailChangeForm({
  pendingEmail,
  onCanceled,
}: {
  pendingEmail: string;
  onCanceled: () => void;
}) {
  const router = useRouter();
  const t = useTranslations("core.settings.account.email");
  const tShared = useTranslations("core.settings.shared");
  const [confirmState, confirmAction, confirmPending] = useActionState<
    ActionState,
    FormData
  >(confirmEmailChangeAction, {});
  const [cancelState, cancelAction, cancelPending] = useActionState<
    ActionState,
    FormData
  >(cancelEmailChangeAction, {});

  // Cancel: flippa subito al form di richiesta, senza aspettare il refresh.
  // Confirm: lascia che router.refresh aggiorni initial.email/pendingEmail
  // — la useEffect in EmailSection sincronizzerà lo stato locale.
  useEffect(() => {
    if (cancelState.success) {
      onCanceled();
      mutate("/api/user");
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelState.success]);

  useEffect(() => {
    if (confirmState.success) {
      mutate("/api/user");
      router.refresh();
    }
  }, [confirmState.success, router]);

  return (
    <div className="space-y-4 rounded-2xl border border-gc-line bg-gc-bg-2 p-4">
      <div>
        <p className="text-[13.5px] text-gc-fg">
          {t.rich("pendingTitle", {
            pendingEmail,
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
        <p className="text-[12px] text-gc-fg-3 mt-0.5">
          {t("pendingDescription")}
        </p>
      </div>

      <form action={confirmAction} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="code">{t("codeLabel")}</Label>
          <Input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            autoComplete="one-time-code"
            required
            placeholder={tShared("verificationCodePlaceholder")}
            className="font-mono tracking-[0.25em] text-center"
          />
        </div>

        {confirmState.error && (
          <p className="text-[13px] text-gc-neg">{confirmState.error}</p>
        )}
        {confirmState.success && (
          <p className="text-[13px] text-gc-success-fg">{confirmState.success}</p>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={confirmPending}>
            {confirmPending ? t("confirmPending") : t("confirmIdle")}
          </Button>
        </div>
      </form>

      <form action={cancelAction}>
        {cancelState.error && (
          <p className="text-[13px] text-gc-neg mb-2">{cancelState.error}</p>
        )}
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          disabled={cancelPending}
          className="text-gc-fg-3 hover:text-gc-fg"
        >
          {cancelPending ? t("cancelPending") : t("cancelIdle")}
        </Button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------

function PasswordSection({
  hasPassword,
  currentEmail,
}: {
  hasPassword: boolean;
  currentEmail: string;
}) {
  if (!hasPassword) {
    return <PasswordOauthInfo />;
  }

  return <ChangePasswordForm currentEmail={currentEmail} />;
}

function PasswordOauthInfo() {
  const t = useTranslations("core.settings.account.password");
  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-[15px] font-semibold text-gc-fg">
          {t("sectionTitle")}
        </h2>
        <p className="text-[12.5px] text-gc-fg-3 mt-0.5">{t("oauthInfo")}</p>
      </div>
    </section>
  );
}

function ChangePasswordForm({ currentEmail }: { currentEmail: string }) {
  const router = useRouter();
  const t = useTranslations("core.settings.account.password");
  const tShared = useTranslations("core.settings.shared");
  const [state, action, pending] = useActionState<ActionState, FormData>(
    changePasswordAction,
    {},
  );
  const [newPassword, setNewPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (state.success) {
      setNewPassword("");
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold text-gc-fg">
          {t("sectionTitle")}
        </h2>
        <p className="text-[12.5px] text-gc-fg-3 mt-0.5">
          {t("sectionDescription")}
        </p>
      </div>

      <form action={action} className="space-y-4">
        {/*
         * Username hidden field — pattern raccomandato da Chrome/Web.dev
         * per i form di "change password": disambigua per il password
         * manager a quale account si riferiscono `current-password` e
         * `new-password`. Senza questo, alcuni password manager (1Password,
         * Bitwarden) propongono credenziali sbagliate o le inseriscono
         * nei campi successivi.
         * https://web.dev/sign-in-form-best-practices/#new-password
         */}
        <input
          type="text"
          name="username"
          value={currentEmail}
          autoComplete="username"
          readOnly
          aria-hidden="true"
          tabIndex={-1}
          style={{ display: "none" }}
        />

        <div className="space-y-1.5">
          <Label htmlFor="currentPassword">{t("currentLabel")}</Label>
          <div className="relative">
            <Input
              id="currentPassword"
              name="currentPassword"
              type={showCurrent ? "text" : "password"}
              // autoComplete="off" + readonly-on-mount: i password manager
              // moderni IGNORANO autoComplete="off" sui type=password. Il
              // trucco readonly + remove-on-focus li blocca senza degradare
              // la UX. Vedi nota nel form cambio email — per il "cambio
              // password" il rischio è amplificato: un attacker con sessione
              // attiva potrebbe resettare la password a piacere se il manager
              // fa autofill.
              autoComplete="off"
              data-form-type="other"
              readOnly
              onFocus={(e) => e.currentTarget.removeAttribute("readonly")}
              required
              maxLength={100}
              className="pr-10"
              placeholder={tShared("passwordPlaceholder")}
            />
            <PasswordToggle
              shown={showCurrent}
              onToggle={() => setShowCurrent((v) => !v)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="newPassword">{t("newLabel")}</Label>
          <div className="relative">
            <Input
              id="newPassword"
              name="newPassword"
              type={showNew ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={100}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="pr-10"
              placeholder={tShared("passwordPlaceholder")}
            />
            <PasswordToggle
              shown={showNew}
              onToggle={() => setShowNew((v) => !v)}
            />
          </div>
          <PasswordRulesList password={newPassword} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">{t("confirmLabel")}</Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type={showConfirm ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={100}
              className="pr-10"
              placeholder={tShared("passwordPlaceholder")}
            />
            <PasswordToggle
              shown={showConfirm}
              onToggle={() => setShowConfirm((v) => !v)}
            />
          </div>
        </div>

        {state.error && <p className="text-[13px] text-gc-neg">{state.error}</p>}
        {state.success && (
          <p className="text-[13px] text-gc-success-fg">{state.success}</p>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? t("submitPending") : t("submitIdle")}
          </Button>
        </div>
      </form>
    </section>
  );
}

function PasswordToggle({
  shown,
  onToggle,
}: {
  shown: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("core.settings.shared");
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? t("hidePassword") : t("showPassword")}
      className="absolute inset-y-0 right-0 flex items-center px-3 text-gc-fg-3 hover:text-gc-fg transition-colors"
    >
      {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Connected accounts (OAuth link/unlink)
// ---------------------------------------------------------------------------

function ConnectedAccountsSection({
  linkedAccounts,
  hasPassword,
}: {
  linkedAccounts: LinkedAccount[];
  hasPassword: boolean;
}) {
  const t = useTranslations("core.settings.account.connectedAccounts");
  const router = useRouter();
  const searchParams = useSearchParams();

  // Banner dal round-trip OAuth (?linked=google / ?link_error=...).
  const linkedParam = searchParams.get("linked");
  const linkErrorParam = searchParams.get("link_error");
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (linkedParam) {
      const label = OAUTH_PROVIDERS.find((p) => p.id === linkedParam)?.label ?? linkedParam;
      setBanner({ type: "success", text: t("successLinked", { provider: label }) });
    } else if (linkErrorParam) {
      const text =
        linkErrorParam === "already_linked_other"
          ? t("errorAlreadyLinked")
          : t("errorGeneric");
      setBanner({ type: "error", text });
    } else {
      return;
    }
    // Pulisce i query param così il banner non si ripete al refresh.
    router.replace("/settings/account");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedParam, linkErrorParam]);

  const linkedMap = new Map(linkedAccounts.map((l) => [l.provider, l.linkedAt]));

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold text-gc-fg">{t("sectionTitle")}</h2>
        <p className="text-[12.5px] text-gc-fg-3 mt-0.5">{t("sectionDescription")}</p>
      </div>

      {banner && (
        <p
          className={`text-[13px] ${
            banner.type === "success" ? "text-gc-success-fg" : "text-gc-neg"
          }`}
        >
          {banner.text}
        </p>
      )}

      <ul className="space-y-2.5">
        {OAUTH_PROVIDERS.map((provider) => {
          const linkedAt = linkedMap.get(provider.id) ?? null;
          // Si può scollegare solo se resta un altro metodo d'accesso:
          // password oppure un altro provider collegato.
          const canUnlink = hasPassword || linkedAccounts.length > 1;
          return (
            <ProviderRow
              key={provider.id}
              providerId={provider.id}
              label={provider.label}
              authPath={provider.authPath}
              linkedAt={linkedAt}
              canUnlink={canUnlink}
            />
          );
        })}
      </ul>
    </section>
  );
}

function ProviderRow({
  providerId,
  label,
  authPath,
  linkedAt,
  canUnlink,
}: {
  providerId: string;
  label: string;
  authPath: string;
  linkedAt: string | null;
  canUnlink: boolean;
}) {
  const t = useTranslations("core.settings.account.connectedAccounts");
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionState, FormData>(
    unlinkOAuthAction,
    {},
  );
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (state.success) {
      setConfirming(false);
      router.refresh();
    }
  }, [state.success, router]);

  const isLinked = linkedAt !== null;

  return (
    <li className="flex items-center justify-between gap-3 rounded-2xl border border-gc-line bg-gc-bg-2 px-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className="shrink-0">{providerIcon(providerId)}</span>
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium text-gc-fg">{label}</p>
          {isLinked ? (
            <p className="text-[11.5px] text-gc-fg-3">
              {t("linkedOn", {
                date: new Date(linkedAt).toLocaleDateString(),
              })}
            </p>
          ) : (
            <p className="text-[11.5px] text-gc-fg-3">{t("notConnected")}</p>
          )}
          {state.error && (
            <p className="text-[11.5px] text-gc-neg mt-0.5">{state.error}</p>
          )}
        </div>
      </div>

      {!isLinked ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            window.location.href = `${authPath}?intent=link`;
          }}
        >
          {t("connect")}
        </Button>
      ) : confirming ? (
        <form action={action} className="flex items-center gap-2">
          <input type="hidden" name="provider" value={providerId} />
          <Button
            type="submit"
            variant="destructive"
            size="sm"
            disabled={pending}
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("confirm")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => setConfirming(false)}
          >
            {t("cancel")}
          </Button>
        </form>
      ) : canUnlink ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-gc-fg-3 hover:text-gc-neg"
          onClick={() => setConfirming(true)}
        >
          {t("disconnect")}
        </Button>
      ) : (
        <span className="text-[11px] text-gc-fg-3 max-w-[10rem] text-right">
          {t("lastMethodHint")}
        </span>
      )}
    </li>
  );
}

/** Icona per provider. Google = logo ufficiale; fallback generico. */
function providerIcon(id: string) {
  if (id === "google") return <GoogleIcon />;
  return <Link2 className="h-5 w-5 text-gc-fg-3" />;
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

function PasswordRulesList({ password }: { password: string }) {
  // Riuso le chiavi `auth.passwordRulesLong.{min,upper,number,special}`
  // (già in messages/{en,it}/auth.json, usate anche dal form di
  // reset-password). Le 4 regole sono le stesse: evitare duplicazione.
  // Variante `Long` perché qui c'è spazio per la frase intera; il
  // namespace ha anche `Short` (es. "8+ car.") per le pill compatte.
  const tRules = useTranslations("auth.passwordRulesLong");
  const isEmpty = password.length === 0;
  return (
    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 px-1">
      {passwordRules.map((rule) => {
        const passed = !isEmpty && rule.test(password);
        return (
          <li
            key={rule.id}
            className={`text-[11.5px] flex items-center gap-1 transition-colors ${
              passed
                ? "text-gc-success-fg"
                : isEmpty
                  ? "text-gc-fg-3"
                  : "text-gc-neg"
            }`}
          >
            {isEmpty ? (
              <span className="w-3 text-center">•</span>
            ) : passed ? (
              <Check className="h-3 w-3" />
            ) : (
              <X className="h-3 w-3" />
            )}
            {tRules(rule.id)}
          </li>
        );
      })}
    </ul>
  );
}
