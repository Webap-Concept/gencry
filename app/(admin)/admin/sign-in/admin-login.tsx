"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionState } from "@/lib/auth/middleware";
import { Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { adminSignIn } from "./actions";

export function AdminLogin() {
  const t = useTranslations("admin.signIn");
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    adminSignIn,
    { error: "" },
  );

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl p-8 shadow-sm border border-gray-200 bg-white">
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#e07a3a] mb-2">
              {t("eyebrow")}
            </p>
            <h1 className="text-2xl font-semibold text-gray-900">
              {t("title")}
            </h1>
            <p className="text-sm text-gray-500 mt-1">{t("subtitle")}</p>
          </div>

          <form className="space-y-5" action={formAction}>
            <div className="space-y-1.5">
              <Label
                htmlFor="email"
                className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {t("emailLabel")}
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={50}
                placeholder={t("emailPlaceholder")}
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="password"
                className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {t("passwordLabel")}
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
                maxLength={30}
                placeholder={t("passwordPlaceholder")}
              />
            </div>

            {state?.error && (
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
                  <Loader2 className="animate-spin h-4 w-4" /> {t("submitPending")}
                </>
              ) : (
                t("submit")
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
