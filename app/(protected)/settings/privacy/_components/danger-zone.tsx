"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/auth/middleware";
import {
  confirmAccountDeletionViaOtpAction,
  requestAccountDeletionAction,
  sendAccountDeletionOtpAction,
} from "../actions";

const GRACE_DAYS = 30;

export function DangerZone({ hasPassword }: { hasPassword: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const t = useTranslations("core.settings.privacy.dangerZone");

  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-gc-fg-3">
        {t("description", { graceDays: GRACE_DAYS })}
      </p>

      <article className="rounded-2xl border border-gc-neg/30 bg-gc-bg-2 p-4">
        {!confirming ? (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gc-neg/10 text-gc-neg">
                <AlertTriangle size={18} strokeWidth={1.7} />
              </div>
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-gc-fg">
                  {t("deleteLabel")}
                </p>
                <p className="mt-0.5 text-[12px] text-gc-fg-3">
                  {t("deleteHint", { graceDays: GRACE_DAYS })}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-gc-neg hover:text-gc-neg"
              onClick={() => setConfirming(true)}
            >
              {t("deleteButton")}
            </Button>
          </div>
        ) : hasPassword ? (
          <PasswordDeletionForm onCancel={() => setConfirming(false)} />
        ) : (
          <OtpDeletionForm onCancel={() => setConfirming(false)} />
        )}
      </article>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form password (utenti con password locale)
// ---------------------------------------------------------------------------

function PasswordDeletionForm({ onCancel }: { onCancel: () => void }) {
  const t = useTranslations("core.settings.privacy.dangerZone");
  const tShared = useTranslations("core.settings.shared");
  const [state, action, pending] = useActionState<ActionState, FormData>(
    requestAccountDeletionAction,
    {},
  );
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={action} className="space-y-4">
      <DeletionFormHeader
        description={t("passwordStepDescription", { graceDays: GRACE_DAYS })}
      />

      <div className="space-y-1.5">
        <Label htmlFor="deletion-password">{t("currentPassword")}</Label>
        <div className="relative">
          <Input
            id="deletion-password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
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
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <ConsequencesCheckbox />

      {state.error && (
        <p className="text-[13px] text-gc-neg">{state.error}</p>
      )}

      <DeletionFormFooter onCancel={onCancel} pending={pending} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Form OTP via email (utenti OAuth-only senza password)
// ---------------------------------------------------------------------------

function OtpDeletionForm({ onCancel }: { onCancel: () => void }) {
  const t = useTranslations("core.settings.privacy.dangerZone");
  const tCommon = useTranslations("core.common");
  const [otpRequested, setOtpRequested] = useState(false);

  const [sendState, sendAction, sending] = useActionState<ActionState, FormData>(
    sendAccountDeletionOtpAction,
    {},
  );

  useEffect(() => {
    if (sendState.success) setOtpRequested(true);
  }, [sendState.success]);

  if (!otpRequested) {
    return (
      <form action={sendAction} className="space-y-4">
        <DeletionFormHeader description={t("noPasswordInfo")} />

        {sendState.error && (
          <p className="text-[13px] text-gc-neg">{sendState.error}</p>
        )}

        <div className="flex flex-wrap justify-end gap-2 border-t border-gc-line pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={sending}
          >
            {tCommon("cancel")}
          </Button>
          <Button type="submit" variant="outline" size="sm" disabled={sending}>
            {sending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("sendCodePending")}
              </>
            ) : (
              t("sendCodeIdle")
            )}
          </Button>
        </div>
      </form>
    );
  }

  return <OtpConfirmForm onCancel={onCancel} sendStateMessage={sendState.success ?? null} />;
}

function OtpConfirmForm({
  onCancel,
  sendStateMessage,
}: {
  onCancel: () => void;
  sendStateMessage: string | null;
}) {
  const t = useTranslations("core.settings.privacy.dangerZone");
  const tShared = useTranslations("core.settings.shared");
  const [state, action, pending] = useActionState<ActionState, FormData>(
    confirmAccountDeletionViaOtpAction,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <DeletionFormHeader
        description={t("codeStepDescription", { graceDays: GRACE_DAYS })}
      />

      {sendStateMessage && (
        <p className="text-[12.5px] text-gc-success-fg">{sendStateMessage}</p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="deletion-otp">{t("codeLabel")}</Label>
        <Input
          id="deletion-otp"
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

      <ConsequencesCheckbox />

      {state.error && (
        <p className="text-[13px] text-gc-neg">{state.error}</p>
      )}

      <DeletionFormFooter onCancel={onCancel} pending={pending} />
    </form>
  );
}

function DeletionFormHeader({ description }: { description: string }) {
  const t = useTranslations("core.settings.privacy.dangerZone");
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gc-neg/10 text-gc-neg">
        <AlertTriangle size={18} strokeWidth={1.7} />
      </div>
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold text-gc-fg">
          {t("confirmTitle")}
        </p>
        <p className="mt-0.5 text-[12px] text-gc-fg-3">{description}</p>
      </div>
    </div>
  );
}

function ConsequencesCheckbox() {
  const t = useTranslations("core.settings.privacy.dangerZone");
  return (
    <label className="flex items-start gap-2 cursor-pointer">
      <input
        type="checkbox"
        name="confirmDelete"
        required
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-gc-line accent-gc-neg cursor-pointer"
      />
      <span className="text-[12.5px] text-gc-fg leading-relaxed">
        {t("confirmCheckbox", { graceDays: GRACE_DAYS })}
      </span>
    </label>
  );
}

function DeletionFormFooter({
  onCancel,
  pending,
}: {
  onCancel: () => void;
  pending: boolean;
}) {
  const t = useTranslations("core.settings.privacy.dangerZone");
  const tCommon = useTranslations("core.common");
  return (
    <div className="flex flex-wrap justify-end gap-2 border-t border-gc-line pt-3">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onCancel}
        disabled={pending}
      >
        {tCommon("cancel")}
      </Button>
      <Button type="submit" variant="destructive" size="sm" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("finalPending")}
          </>
        ) : (
          t("finalIdle")
        )}
      </Button>
    </div>
  );
}
