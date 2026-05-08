"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import { useAdminSlug } from "@/app/(admin)/admin/_components/admin-slug-context";
import { validateAdminSlugSync } from "@/lib/admin-paths-shared";
import { AlertTriangle, Link2, Loader2, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { saveAdminUrlSlug, type ActionState } from "../actions";

interface Props {
  /** Slug attualmente salvato in DB. */
  currentSlug: string;
}

export function AdminUrlForm({ currentSlug }: Props) {
  const t = useTranslations("admin.security.adminUrl.form");
  const tHints = useTranslations("admin.security.adminUrl.hints");
  const liveAdminSlug = useAdminSlug();
  const searchParams = useSearchParams();
  const justChanged = searchParams.get("changed") === "1";

  const [value, setValue] = useState(currentSlug);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    saveAdminUrlSlug,
    {},
  );

  useEffect(() => {
    if ("success" in state) {
      setToast({ message: state.success, type: "success" });
    } else if ("error" in state) {
      setToast({ message: state.error, type: "error" });
    }
  }, [state]);

  // Toast post-redirect: se siamo arrivati con ?changed=1, mostriamo un
  // toast di conferma. Il save server-action ha redirectato qui col nuovo
  // slug nel URL → currentSlug e liveAdminSlug coincidono col nuovo.
  useEffect(() => {
    if (justChanged) {
      setToast({ message: t("changedToast", { slug: liveAdminSlug }), type: "success" });
    }
  }, [justChanged, liveAdminSlug, t]);

  // Validazione live (formato + riservato). Niente fetch al server: la
  // collision check vs pages avviene solo al save.
  const validation = useMemo(() => {
    const trimmed = value.trim();
    if (trimmed === "") return { kind: "empty" as const };
    if (trimmed === currentSlug) return { kind: "unchanged" as const };
    const v = validateAdminSlugSync(trimmed);
    if (v.ok) return { kind: "valid" as const, slug: v.slug };
    return {
      kind: "invalid" as const,
      reason: v.reason,
      detail: v.detail,
    };
  }, [value, currentSlug]);

  const isValidForSubmit =
    validation.kind === "valid" && !isPending;

  return (
    <>
      <form
        action={formAction}
        className="rounded-xl shadow-sm p-5 space-y-5"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}>
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: "color-mix(in srgb, var(--admin-accent) 12%, transparent)",
            }}>
            <Link2 size={18} style={{ color: "var(--admin-accent)" }} />
          </div>
          <div className="flex-1 min-w-0">
            <h3
              className="text-sm font-semibold"
              style={{ color: "var(--admin-text)" }}>
              {t("heading")}
            </h3>
            <p
              className="text-xs mt-1"
              style={{ color: "var(--admin-text-muted)" }}>
              {t("subheading")}
            </p>
          </div>
        </div>

        {/* Current slug indicator */}
        <div
          className="rounded-md p-3 text-xs flex items-center gap-2 font-mono"
          style={{
            background: "var(--admin-page-bg)",
            border: "1px solid var(--admin-card-border)",
            color: "var(--admin-text-muted)",
          }}>
          <span style={{ color: "var(--admin-text-faint)" }}>
            {t("currentLabel")}:
          </span>
          <span style={{ color: "var(--admin-text)" }}>/{currentSlug}</span>
        </div>

        {/* Slug input */}
        <div className="space-y-1">
          <label
            htmlFor="admin-slug"
            className="text-sm font-medium block"
            style={{ color: "var(--admin-text)" }}>
            {t("slugLabel")}
          </label>
          <div
            className="flex items-center rounded-md overflow-hidden"
            style={{
              border: "1px solid var(--admin-input-border, var(--admin-card-border))",
              background: "var(--admin-page-bg, var(--admin-card-bg))",
            }}>
            <span
              className="px-3 py-2 text-sm font-mono select-none"
              style={{
                color: "var(--admin-text-faint)",
                borderRight:
                  "1px solid var(--admin-input-border, var(--admin-card-border))",
              }}>
              /
            </span>
            <input
              id="admin-slug"
              name="slug"
              type="text"
              value={value}
              onChange={(e) =>
                setValue(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))
              }
              maxLength={40}
              autoComplete="off"
              spellCheck={false}
              className="flex-1 px-3 py-2 text-sm font-mono bg-transparent focus:outline-none"
              style={{ color: "var(--admin-text)" }}
              placeholder="admincontrol"
            />
          </div>
          {/* Validation hint live */}
          {validation.kind === "invalid" && (
            <p
              className="text-xs mt-1 flex items-center gap-1"
              style={{ color: "#dc2626" }}>
              <AlertTriangle size={11} />
              {validation.reason === "reserved"
                ? t("reservedHint")
                : t("formatHint")}
            </p>
          )}
          {validation.kind === "unchanged" && (
            <p
              className="text-xs mt-1"
              style={{ color: "var(--admin-text-faint)" }}>
              {t("unchangedHint")}
            </p>
          )}
          {validation.kind === "valid" && (
            <p
              className="text-xs mt-1"
              style={{ color: "var(--admin-accent)" }}>
              {t("previewHint", { url: `/${validation.slug}` })}
            </p>
          )}
        </div>

        {/* Warnings */}
        <div
          className="rounded-md p-3 text-xs space-y-2"
          style={{
            background:
              "color-mix(in srgb, #f59e0b 10%, var(--admin-card-bg))",
            border: "1px solid color-mix(in srgb, #f59e0b 25%, transparent)",
            color: "var(--admin-text-muted)",
          }}>
          <p className="font-semibold flex items-center gap-1.5" style={{ color: "#b45309" }}>
            <AlertTriangle size={12} />
            {tHints("warningsTitle")}
          </p>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>{tHints("warningRedirect")}</li>
            <li>{tHints("warningBookmarks")}</li>
            <li>{tHints("warningEmails")}</li>
          </ul>
        </div>

        {/* Save button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!isValidForSubmit}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "var(--admin-accent)" }}>
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {t("saveButton")}
          </button>
        </div>
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
