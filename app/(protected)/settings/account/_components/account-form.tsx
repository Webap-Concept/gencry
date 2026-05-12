"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "swr";
import { Check, Eye, EyeOff, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/auth/middleware";
import { passwordRules } from "@/lib/account/password-rules";
import { checkEmailAction } from "@/app/(login)/actions";
import {
  cancelEmailChangeAction,
  changePasswordAction,
  confirmEmailChangeAction,
  requestEmailChangeAction,
} from "../actions";

type Initial = {
  email: string;
  pendingEmail: string | null;
  hasPassword: boolean;
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

function EmailSection({ initial }: { initial: Initial }) {
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
        <h2 className="text-[15px] font-semibold text-gc-fg">Email</h2>
        <p className="text-[12.5px] text-gc-fg-3 mt-0.5">
          L'email viene usata per accedere e per le notifiche di sicurezza.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Email attuale</Label>
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
      setEmailError("La nuova email coincide con quella attuale.");
      setEmailAvailable(false);
      setCheckingEmail(false);
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError("Inserisci un indirizzo email valido");
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
        setEmailError("Impossibile verificare l'email in questo momento");
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
        <Label htmlFor="newEmail">Nuova email</Label>
        <Input
          id="newEmail"
          name="newEmail"
          type="email"
          autoComplete="email"
          required
          maxLength={255}
          placeholder="nuova@esempio.com"
          value={emailValue}
          onChange={(e) => setEmailValue(e.target.value)}
          aria-invalid={!!emailError}
        />
        {checkingEmail ? (
          <p className="text-[11.5px] flex items-center gap-1 text-gc-fg-3 px-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Verifica email in corso…
          </p>
        ) : emailError ? (
          <p className="text-[11.5px] flex items-center gap-1 text-gc-neg px-1">
            <X className="h-3 w-3" /> {emailError}
          </p>
        ) : emailAvailable ? (
          <p className="text-[11.5px] flex items-center gap-1 text-emerald-700 px-1">
            <Check className="h-3 w-3" /> Email disponibile
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="emailChangePassword">Password attuale</Label>
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
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Nascondi password" : "Mostra password"}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-gc-fg-3 hover:text-gc-fg transition-colors"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-[11.5px] text-gc-fg-3 px-1">
          Per sicurezza ti chiediamo di confermare la password attuale. Riceverai
          un codice di verifica al nuovo indirizzo. Massimo 1 richiesta al giorno.
        </p>
      </div>

      {state.error && <p className="text-[13px] text-gc-neg">{state.error}</p>}
      {state.success && (
        <p className="text-[13px] text-emerald-700">{state.success}</p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Invio in corso…" : "Richiedi cambio email"}
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
          Verifica in corso per <strong>{pendingEmail}</strong>
        </p>
        <p className="text-[12px] text-gc-fg-3 mt-0.5">
          Ti abbiamo inviato un codice a 6 cifre. Inseriscilo qui per completare
          il cambio. Il codice scade dopo 15 minuti.
        </p>
      </div>

      <form action={confirmAction} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="code">Codice di verifica</Label>
          <Input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            autoComplete="one-time-code"
            required
            placeholder="000000"
            className="font-mono tracking-[0.25em] text-center"
          />
        </div>

        {confirmState.error && (
          <p className="text-[13px] text-gc-neg">{confirmState.error}</p>
        )}
        {confirmState.success && (
          <p className="text-[13px] text-emerald-700">{confirmState.success}</p>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={confirmPending}>
            {confirmPending ? "Conferma…" : "Conferma cambio email"}
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
          {cancelPending ? "Annullamento…" : "Annulla richiesta"}
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
    return (
      <section className="space-y-2">
        <div>
          <h2 className="text-[15px] font-semibold text-gc-fg">Password</h2>
          <p className="text-[12.5px] text-gc-fg-3 mt-0.5">
            Hai effettuato l'accesso con Google. La gestione della password
            avviene direttamente dal tuo account Google.
          </p>
        </div>
      </section>
    );
  }

  return <ChangePasswordForm currentEmail={currentEmail} />;
}

function ChangePasswordForm({ currentEmail }: { currentEmail: string }) {
  const router = useRouter();
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
        <h2 className="text-[15px] font-semibold text-gc-fg">Password</h2>
        <p className="text-[12.5px] text-gc-fg-3 mt-0.5">
          Conferma la password attuale e scegline una nuova.
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
          <Label htmlFor="currentPassword">Password attuale</Label>
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
              placeholder="••••••••"
            />
            <PasswordToggle
              shown={showCurrent}
              onToggle={() => setShowCurrent((v) => !v)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="newPassword">Nuova password</Label>
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
              placeholder="••••••••"
            />
            <PasswordToggle
              shown={showNew}
              onToggle={() => setShowNew((v) => !v)}
            />
          </div>
          <PasswordRulesList password={newPassword} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Conferma nuova password</Label>
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
              placeholder="••••••••"
            />
            <PasswordToggle
              shown={showConfirm}
              onToggle={() => setShowConfirm((v) => !v)}
            />
          </div>
        </div>

        {state.error && <p className="text-[13px] text-gc-neg">{state.error}</p>}
        {state.success && (
          <p className="text-[13px] text-emerald-700">{state.success}</p>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Aggiornamento…" : "Cambia password"}
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
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? "Nascondi password" : "Mostra password"}
      className="absolute inset-y-0 right-0 flex items-center px-3 text-gc-fg-3 hover:text-gc-fg transition-colors"
    >
      {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
}

function PasswordRulesList({ password }: { password: string }) {
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
                ? "text-emerald-700"
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
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}
