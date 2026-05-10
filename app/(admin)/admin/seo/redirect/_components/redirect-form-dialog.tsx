"use client";

import type { Redirect } from "@/lib/db/schema";
import { Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

const inputStyle: React.CSSProperties = {
  background: "var(--admin-page-bg)",
  border: "1px solid var(--admin-input-border)",
  color: "var(--admin-text)",
  borderRadius: "0.5rem",
  padding: "0.5rem 0.75rem",
  fontSize: "0.875rem",
  width: "100%",
  outline: "none",
  fontFamily: "monospace",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.65rem",
  fontWeight: 600,
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
  color: "var(--admin-text-muted)",
  display: "block",
  marginBottom: "0.375rem",
};

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

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !isPending) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, isPending, onClose]);

  if (!open || !mode) return null;

  const editRow = mode.type === "edit" ? mode.row : null;

  return createPortal(
    <>
      <div
        onClick={() => !isPending && onClose()}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10000,
          background: "rgba(0,0,0,0.45)",
          backdropFilter: "blur(2px)",
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10001,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          pointerEvents: "none",
        }}>
        <div
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
            borderRadius: 14,
            boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
            width: "100%",
            maxWidth: 560,
            pointerEvents: "auto",
          }}>
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "16px 20px",
              borderBottom: "1px solid var(--admin-card-border)",
            }}>
            <h2
              style={{
                flex: 1,
                fontSize: 15,
                fontWeight: 600,
                color: "var(--admin-text)",
                margin: 0,
              }}>
              {mode.type === "new" ? t("formNewTitle") : t("formEditTitle")}
            </h2>
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              aria-label={t("cancelButton")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                borderRadius: 6,
                background: "transparent",
                border: "none",
                cursor: isPending ? "not-allowed" : "pointer",
                color: "var(--admin-text-faint)",
              }}>
              <X size={15} />
            </button>
          </div>

          {/* Body */}
          <form action={formAction}>
            <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
              {editRow && <input type="hidden" name="id" value={editRow.id} />}
              <input type="hidden" name="isActive" value="true" />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label style={labelStyle}>{t("fromLabel")}</label>
                  <input
                    ref={firstFieldRef}
                    name="fromPath"
                    defaultValue={
                      editRow?.fromPath ??
                      (mode.type === "new" && prefillFrom ? prefillFrom : "")
                    }
                    placeholder={t("fromPlaceholder")}
                    required
                    style={inputStyle}
                  />
                  <p style={{ fontSize: "0.7rem", color: "var(--admin-text-faint)", marginTop: "0.25rem" }}>
                    {t("fromHint")}
                  </p>
                </div>
                <div>
                  <label style={labelStyle}>{t("toLabel")}</label>
                  <input
                    name="toPath"
                    defaultValue={editRow?.toPath ?? ""}
                    placeholder={t("toPlaceholder")}
                    required
                    style={inputStyle}
                  />
                  <p style={{ fontSize: "0.7rem", color: "var(--admin-text-faint)", marginTop: "0.25rem" }}>
                    {t("toHint")}
                  </p>
                </div>
              </div>

              <div className="max-w-xs">
                <label style={labelStyle}>{t("statusCodeLabel")}</label>
                <select
                  name="statusCode"
                  defaultValue={String(editRow?.statusCode ?? "301")}
                  style={{ ...inputStyle, fontFamily: "inherit" }}>
                  <option value="301">{t("statusCode301")}</option>
                  <option value="302">{t("statusCode302")}</option>
                  <option value="307">{t("statusCode307")}</option>
                  <option value="308">{t("statusCode308")}</option>
                </select>
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

            {/* Footer */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                padding: "0 20px 18px",
              }}>
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                style={{
                  padding: "7px 16px",
                  fontSize: 13,
                  fontWeight: 500,
                  borderRadius: 8,
                  border: "1px solid var(--admin-card-border)",
                  background: "transparent",
                  color: "var(--admin-text-muted)",
                  cursor: isPending ? "not-allowed" : "pointer",
                }}>
                {t("cancelButton")}
              </button>
              <button
                type="submit"
                disabled={isPending}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: "none",
                  background: isPending ? "#6b7280" : "var(--admin-accent)",
                  color: "#fff",
                  cursor: isPending ? "not-allowed" : "pointer",
                }}>
                {isPending && <Loader2 size={13} className="animate-spin" />}
                {mode.type === "new" ? t("createButton") : t("saveButton")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>,
    document.body,
  );
}
