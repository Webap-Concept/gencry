"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/auth/middleware";
import { disableMfaAction } from "../actions";

type Props = {
  onCancel: () => void;
};

export function MfaDisableForm({ onCancel }: Props) {
  const router = useRouter();
  const t = useTranslations("core.settings.security.mfa");
  const tCommon = useTranslations("core.common");
  const tShared = useTranslations("core.settings.shared");
  const [state, action, pending] = useActionState<ActionState, FormData>(
    disableMfaAction,
    {},
  );

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold text-gc-fg">
          {t("disableTitle")}
        </h2>
        <p className="text-[12.5px] text-gc-fg-3 mt-0.5">
          {t("disableDescription")}
        </p>
      </div>

      <form
        action={action}
        className="rounded-2xl border border-gc-line bg-gc-bg-2 p-5 space-y-4"
      >
        <div>
          <Label
            htmlFor="mfa-disable-password"
            className="text-[13px] font-semibold text-gc-fg"
          >
            {t("passwordLabel")}
          </Label>
          <Input
            id="mfa-disable-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="mt-1"
          />
        </div>

        <div>
          <Label
            htmlFor="mfa-disable-token"
            className="text-[13px] font-semibold text-gc-fg"
          >
            {t("tokenLabel")}
          </Label>
          <Input
            id="mfa-disable-token"
            name="token"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            className="mt-1 font-mono text-lg tracking-widest text-center max-w-[12rem]"
            placeholder={tShared("verificationCodePlaceholder")}
          />
        </div>

        {state.error && (
          <p className="text-[13px] text-gc-neg">{state.error}</p>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="submit" variant="destructive" disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> {t("disablePending")}
              </>
            ) : (
              t("disableIdle")
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={pending}
          >
            {tCommon("cancel")}
          </Button>
        </div>
      </form>
    </section>
  );
}
