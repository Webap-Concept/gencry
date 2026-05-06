"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import { Loader2, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import {
  saveCookieSettingsAction,
  type ActionState,
} from "../actions";

type Props = {
  enabled: boolean;
};

export function CookieMasterSwitch({ enabled }: Props) {
  const t = useTranslations("admin.compliance.cookies.masterSwitch");
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    saveCookieSettingsAction,
    {},
  );

  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  useEffect(() => {
    if ("success" in state) {
      setToast({ message: state.success, type: "success" });
    } else if ("error" in state) {
      setToast({ message: state.error, type: "error" });
    }
  }, [state]);

  return (
    <>
      <form
        action={formAction}
        className="rounded-xl shadow-sm p-6"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}>
        <h3
          className="text-sm font-semibold mb-1"
          style={{ color: "var(--admin-text)" }}>
          {t("heading")}
        </h3>
        <p
          className="text-[11px] mb-5"
          style={{ color: "var(--admin-text-faint)" }}>
          {t("intro")}
        </p>
        <label className="flex items-start gap-3 cursor-pointer select-none mb-5">
          <input
            type="checkbox"
            name="gdpr.cookie_banner.enabled"
            value="true"
            defaultChecked={enabled}
            className="mt-0.5 w-4 h-4 rounded cursor-pointer"
            style={{ accentColor: "var(--admin-accent)" }}
          />
          <span>
            <span
              className="text-sm font-medium"
              style={{ color: "var(--admin-text)" }}>
              {t("checkboxLabel")}
            </span>
            <span
              className="block text-[11px] mt-0.5"
              style={{ color: "var(--admin-text-faint)" }}>
              {t("checkboxHint")}
            </span>
          </span>
        </label>

        <button
          type="submit"
          disabled={isPending}
          className="flex items-center gap-2 px-5 py-2.5 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ background: "var(--admin-accent)" }}>
          {isPending ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Save size={15} />
          )}
          {isPending ? t("savingButton") : t("saveButton")}
        </button>
      </form>

      {toast && (
        <AdminToast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </>
  );
}
