"use client";

import ConfirmModal from "@/app/(admin)/admin/_components/confirm-modal";
import type { Redirect } from "@/lib/db/schema";
import {
  AlertTriangle,
  ArrowRight,
  GitMerge,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

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

const STATUS_COLORS: Record<
  number,
  { bg: string; text: string; border: string }
> = {
  301: {
    bg: "color-mix(in srgb, #22c55e 10%, var(--admin-card-bg))",
    text: "#22c55e",
    border: "color-mix(in srgb, #22c55e 25%, transparent)",
  },
  302: {
    bg: "color-mix(in srgb, #3b82f6 10%, var(--admin-card-bg))",
    text: "#3b82f6",
    border: "color-mix(in srgb, #3b82f6 25%, transparent)",
  },
  307: {
    bg: "color-mix(in srgb, #8b5cf6 10%, var(--admin-card-bg))",
    text: "#8b5cf6",
    border: "color-mix(in srgb, #8b5cf6 25%, transparent)",
  },
  308: {
    bg: "color-mix(in srgb, #f59e0b 10%, var(--admin-card-bg))",
    text: "#f59e0b",
    border: "color-mix(in srgb, #f59e0b 25%, transparent)",
  },
};

function StatusBadge({ code }: { code: number }) {
  const c = STATUS_COLORS[code] ?? STATUS_COLORS[301];
  return (
    <span
      className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full"
      style={{
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
      }}>
      {code}
    </span>
  );
}

type RedirectRow = Redirect;

type DeleteTarget = { id: number; fromPath: string };

type Props = {
  rows: RedirectRow[];
  upsertAction: (
    prev: unknown,
    formData: FormData,
  ) => Promise<{ error?: string; success?: boolean; savedAt?: string }>;
  deleteAction: (id: number) => Promise<{ error?: string; success?: boolean }>;
};

type FormMode = { type: "new" } | { type: "edit"; row: RedirectRow };

export default function RedirectsClient({
  rows: initialRows,
  upsertAction,
  deleteAction,
}: Props) {
  const t = useTranslations("admin.seo.redirect");
  const [rows, setRows] = useState<RedirectRow[]>(initialRows);

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  const [mode, setMode] = useState<FormMode | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  // Deep-link da /admin/seo/not-found ("Create redirect" su una row 404):
  // se arriva ?from=/path apriamo subito il form in modalità "new" col path
  // pre-compilato. Consumiamo il search param solo al primo render e poi
  // ignoriamo le sue variazioni successive.
  const searchParams = useSearchParams();
  const prefillFrom = searchParams.get("from");
  const [didPrefill, setDidPrefill] = useState(false);
  useEffect(() => {
    if (didPrefill || !prefillFrom) return;
    setMode({ type: "new" });
    setDidPrefill(true);
  }, [prefillFrom, didPrefill]);

  const [formState, formAction, isPending] = useActionState(
    async (prev: unknown, fd: FormData) => {
      const res = await upsertAction(prev, fd);
      if (res.success) {
        setMode(null);
      }
      return res;
    },
    {},
  );

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    setDeleteError(null);
    const res = await deleteAction(deleteTarget.id);
    if (res.error) {
      setDeleteError(res.error);
    } else {
      setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    }
    setDeletingId(null);
    setDeleteTarget(null);
  }

  const editRow = mode?.type === "edit" ? mode.row : null;

  return (
    <div className="space-y-6">
      <ConfirmModal
        open={deleteTarget !== null}
        title={t("deleteModalTitle")}
        message={
          <>
            {t("deleteModalIntroBefore")}{" "}
            <code
              style={{
                fontFamily: "monospace",
                fontSize: "0.8rem",
                padding: "1px 5px",
                borderRadius: "4px",
                background: "var(--admin-page-bg)",
                color: "var(--admin-text)",
              }}>
              {deleteTarget?.fromPath}
            </code>
            {t("deleteModalIntroAfter")}
            <br />
            <span style={{ marginTop: "6px", display: "block" }}>
              {t("deleteModalIrreversible")}
            </span>
          </>
        }
        variant="danger"
        confirmLabel={t("deleteModalConfirm")}
        cancelLabel={t("deleteModalCancel")}
        loading={deletingId !== null}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              background:
                "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))",
              border:
                "1px solid color-mix(in srgb, var(--admin-accent) 25%, transparent)",
            }}>
            <GitMerge size={18} style={{ color: "var(--admin-accent)" }} />
          </div>
          <div>
            <h1
              className="text-lg font-semibold"
              style={{ color: "var(--admin-text)" }}>
              {t("pageHeading")}
            </h1>
            <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
              {t("totalCount", { count: rows.length })}
            </p>
          </div>
        </div>
        {mode === null && (
          <button
            type="button"
            onClick={() => setMode({ type: "new" })}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg text-white transition-colors"
            style={{ background: "var(--admin-accent)" }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.filter = "brightness(0.9)")
            }
            onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}>
            <Plus size={15} /> {t("addButton")}
          </button>
        )}
      </div>

      {/* Form */}
      {mode !== null && (
        <div
          className="rounded-xl p-5"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          <div className="flex items-center justify-between mb-4">
            <p
              className="text-sm font-semibold"
              style={{ color: "var(--admin-text)" }}>
              {mode.type === "new" ? t("formNewTitle") : t("formEditTitle")}
            </p>
            <button type="button" onClick={() => setMode(null)}>
              <X size={16} style={{ color: "var(--admin-text-muted)" }} />
            </button>
          </div>
          <form action={formAction} className="space-y-4">
            {editRow && <input type="hidden" name="id" value={editRow.id} />}
            <input type="hidden" name="isActive" value="true" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label style={labelStyle}>{t("fromLabel")}</label>
                <input
                  name="fromPath"
                  defaultValue={
                    editRow?.fromPath ??
                    (mode.type === "new" && prefillFrom ? prefillFrom : "")
                  }
                  placeholder={t("fromPlaceholder")}
                  required
                  style={inputStyle}
                />
                <p
                  style={{
                    fontSize: "0.7rem",
                    color: "var(--admin-text-faint)",
                    marginTop: "0.25rem",
                  }}>
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
                <p
                  style={{
                    fontSize: "0.7rem",
                    color: "var(--admin-text-faint)",
                    marginTop: "0.25rem",
                  }}>
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
            {(formState as { error?: string })?.error && (
              <p
                className="text-sm rounded-lg px-3 py-2"
                style={{
                  color: "#ef4444",
                  background:
                    "color-mix(in srgb, #ef4444 10%, var(--admin-card-bg))",
                  border:
                    "1px solid color-mix(in srgb, #ef4444 20%, transparent)",
                }}>
                {(formState as { error?: string }).error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMode(null)}
                className="px-4 py-1.5 text-sm rounded-lg transition-colors"
                style={{
                  color: "var(--admin-text-muted)",
                  border: "1px solid var(--admin-card-border)",
                }}>
                {t("cancelButton")}
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-lg text-white disabled:opacity-60 transition-colors"
                style={{ background: "var(--admin-accent)" }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.filter = "brightness(0.9)")
                }
                onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}>
                {isPending && (
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                )}
                {mode.type === "new" ? t("createButton") : t("saveButton")}
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteError && (
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2"
          style={{
            background: "color-mix(in srgb, #ef4444 8%, var(--admin-card-bg))",
            border: "1px solid color-mix(in srgb, #ef4444 25%, transparent)",
          }}>
          <AlertTriangle size={14} style={{ color: "#ef4444" }} />
          <p className="text-sm" style={{ color: "#ef4444" }}>
            {deleteError}
          </p>
        </div>
      )}

      {/* Tabella */}
      {rows.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-16 text-center rounded-xl"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          <GitMerge
            size={32}
            className="mb-3"
            style={{ color: "var(--admin-text-faint)" }}
          />
          <p
            className="text-sm font-medium"
            style={{ color: "var(--admin-text-muted)" }}>
            {t("emptyTitle")}
          </p>
          <p
            className="text-xs mt-1"
            style={{ color: "var(--admin-text-faint)" }}>
            {t("emptyHint")}
          </p>
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          {/* Header colonne */}
          <div
            className="grid grid-cols-[1fr_auto_1fr_auto_auto] gap-3 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide"
            style={{
              color: "var(--admin-text-faint)",
              borderBottom: "1px solid var(--admin-divider)",
              background: "var(--admin-page-bg)",
            }}>
            <span>{t("columnFrom")}</span>
            <span />
            <span>{t("columnTo")}</span>
            <span>{t("columnCode")}</span>
            <span />
          </div>

          {rows.map((row, i) => (
            <div
              key={row.id}
              className="grid grid-cols-[1fr_auto_1fr_auto_auto] items-center gap-3 px-4 py-3 text-sm"
              style={{
                borderBottom:
                  i < rows.length - 1
                    ? "1px solid var(--admin-divider)"
                    : "none",
                background: row.isActive
                  ? "transparent"
                  : "color-mix(in srgb, #ef4444 4%, var(--admin-card-bg))",
              }}>
              <code
                className="text-xs font-mono truncate"
                style={{
                  color: row.isActive
                    ? "var(--admin-text)"
                    : "var(--admin-text-faint)",
                }}>
                {row.fromPath}
              </code>
              <ArrowRight
                size={13}
                style={{ color: "var(--admin-text-faint)", flexShrink: 0 }}
              />
              <code
                className="text-xs font-mono truncate"
                style={{
                  color: row.isActive
                    ? "var(--admin-accent)"
                    : "var(--admin-text-faint)",
                }}>
                {row.toPath}
              </code>
              <StatusBadge code={row.statusCode} />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  title={t("rowEditTooltip")}
                  onClick={() => setMode({ type: "edit", row })}
                  className="p-1.5 rounded transition-colors"
                  style={{ color: "var(--admin-text-muted)" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.color = "var(--admin-accent)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.color = "var(--admin-text-muted)")
                  }>
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  title={t("rowDeleteTooltip")}
                  disabled={deletingId === row.id}
                  onClick={() =>
                    setDeleteTarget({ id: row.id, fromPath: row.fromPath })
                  }
                  className="p-1.5 rounded transition-colors disabled:opacity-40"
                  style={{ color: "var(--admin-text-muted)" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.color = "#ef4444")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.color = "var(--admin-text-muted)")
                  }>
                  {deletingId === row.id ? (
                    <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin block" />
                  ) : (
                    <Trash2 size={13} />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
