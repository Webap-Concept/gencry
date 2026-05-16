"use client";

import {
  AdminDialog,
  AdminDialogCancelButton,
  AdminDialogConfirmButton,
  AdminDialogContent,
  AdminDialogField,
  adminFieldStyle,
} from "@/app/(admin)/admin/_components/admin-dialog";
import type { Redirect } from "@/lib/db/schema";
import { GitMerge } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

export type RedirectFormMode =
  | { type: "new" }
  | { type: "edit"; row: Redirect };

interface Props {
  open: boolean;
  mode: RedirectFormMode | null;
  prefillFrom: string | null;
  formAction: (formData: FormData) => void;
  formError: string | null;
  isPending: boolean;
  onClose: () => void;
}

export function RedirectFormDialog({
  open,
  mode,
  prefillFrom,
  formAction,
  formError,
  isPending,
  onClose,
}: Props) {
  const t = useTranslations("admin.seo.redirect");
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => firstFieldRef.current?.focus(), 30);
  }, [open]);

  if (!open || !mode) return null;

  const editRow = mode.type === "edit" ? mode.row : null;

  return (
    <AdminDialog open onOpenChange={(o) => !o && !isPending && onClose()}>
      <AdminDialogContent
        icon={GitMerge}
        size="xl"
        title={mode.type === "new" ? t("formNewTitle") : t("formEditTitle")}
        closeAriaLabel={t("cancelButton")}>
        <form action={formAction}>
          <div className="space-y-4">
            {editRow && <input type="hidden" name="id" value={editRow.id} />}
            <input type="hidden" name="isActive" value="true" />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <AdminDialogField label={t("fromLabel")} hint={t("fromHint")}>
                <input
                  ref={firstFieldRef}
                  name="fromPath"
                  defaultValue={
                    editRow?.fromPath ??
                    (mode.type === "new" && prefillFrom ? prefillFrom : "")
                  }
                  placeholder={t("fromPlaceholder")}
                  required
                  style={{ ...adminFieldStyle, fontFamily: "ui-monospace, monospace" }}
                />
              </AdminDialogField>
              <AdminDialogField label={t("toLabel")} hint={t("toHint")}>
                <input
                  name="toPath"
                  defaultValue={editRow?.toPath ?? ""}
                  placeholder={t("toPlaceholder")}
                  required
                  style={{ ...adminFieldStyle, fontFamily: "ui-monospace, monospace" }}
                />
              </AdminDialogField>
            </div>

            <div className="max-w-xs">
              <AdminDialogField label={t("statusCodeLabel")}>
                <select
                  name="statusCode"
                  defaultValue={String(editRow?.statusCode ?? "301")}
                  style={adminFieldStyle}>
                  <option value="301">{t("statusCode301")}</option>
                  <option value="302">{t("statusCode302")}</option>
                  <option value="307">{t("statusCode307")}</option>
                  <option value="308">{t("statusCode308")}</option>
                </select>
              </AdminDialogField>
            </div>

            {formError && (
              <p
                className="text-sm rounded-lg px-3 py-2"
                style={{
                  color: "#ef4444",
                  background: "color-mix(in srgb, #ef4444 10%, var(--admin-card-bg))",
                  border: "1px solid color-mix(in srgb, #ef4444 20%, transparent)",
                }}>
                {formError}
              </p>
            )}
          </div>
          <div
            className="flex items-center justify-end gap-2 mt-5 pt-3"
            style={{ borderTop: "1px solid var(--admin-card-border)" }}>
            <AdminDialogCancelButton onClick={onClose} disabled={isPending}>
              {t("cancelButton")}
            </AdminDialogCancelButton>
            <AdminDialogConfirmButton
              type="submit"
              loading={isPending}
              disabled={isPending}>
              {mode.type === "new" ? t("createButton") : t("saveButton")}
            </AdminDialogConfirmButton>
          </div>
        </form>
      </AdminDialogContent>
    </AdminDialog>
  );
}
