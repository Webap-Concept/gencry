"use client";

import type { RoleRow } from "@/lib/db/roles-queries";
import { DASHBOARD_WIDGETS_META } from "@/app/(admin)/admin/_widgets/meta";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  LayoutDashboard,
  Lock,
  Pencil,
  Plus,
  Shield,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { createRole, deleteRole, updateRole } from "../actions";

// ─── Real-time slug sanitization ──────────────────────────────────
function sanitizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ─── Color presets ────────────────────────────────────────────
const COLOR_PRESETS = [
  "#6b7280",
  "#2563eb",
  "#16a34a",
  "#7c3aed",
  "#dc2626",
  "#d97706",
  "#db2777",
  "#0891b2",
];

// ─── RoleBadge ──────────────────────────────────────────────
function RoleBadge({ role }: { role: RoleRow }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full"
      style={{
        background: role.color + "18",
        color: role.color,
        border: `1px solid ${role.color}40`,
      }}>
      {role.label}
    </span>
  );
}

// ─── RoleForm (create / edit) ───────────────────────────────────
function RoleForm({
  initial,
  onSave,
  onCancel,
  pending,
}: {
  initial?: RoleRow;
  onSave: (fd: FormData) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const t = useTranslations("admin.access.roles.form");
  const tDash = useTranslations("admin.dashboard");
  const [color, setColor] = useState(initial?.color ?? "#6b7280");
  const [isAdmin, setIsAdmin] = useState(initial?.isAdmin ?? false);
  const [adminOpen, setAdminOpen] = useState(initial?.isAdmin ?? false);
  const [slug, setSlug] = useState(initial?.name ?? "");
  const [dashOpen, setDashOpen] = useState(false);
  const [dashOverride, setDashOverride] = useState(
    initial?.dashboardWidgets != null,
  );
  const [dashEnabled, setDashEnabled] = useState<Set<string>>(() => {
    const fromInitial = initial?.dashboardWidgets?.enabled;
    if (fromInitial) return new Set(fromInitial);
    // Sensible starting point when first turning override on:
    // pre-tick the registry defaults so admins don't start from zero.
    return new Set(
      DASHBOARD_WIDGETS_META.filter((w) => w.defaultEnabled).map((w) => w.id),
    );
  });
  const isEdit = !!initial;
  const isSystem = initial?.isSystem ?? false;

  function handleSlugChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSlug(sanitizeSlug(e.target.value));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("name", slug);
    fd.set("color", color);
    fd.set("isAdmin", String(isAdmin));
    fd.set("dashboardWidgetsOverride", String(dashOverride));
    fd.set("dashboardWidgetsEnabled", JSON.stringify([...dashEnabled]));
    onSave(fd);
  }

  function toggleDashWidget(id: string) {
    setDashEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const inputCls =
    "w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors";
  const inputStyle = {
    background: "var(--admin-page-bg)",
    border: "1px solid var(--admin-input-border)",
    color: "var(--admin-text)",
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Label */}
        <div>
          <label
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--admin-text-muted)" }}>
            {t("labelLabel")}
          </label>
          <input
            name="label"
            defaultValue={initial?.label}
            placeholder={t("labelPlaceholder")}
            required
            className={inputCls}
            style={inputStyle}
          />
        </div>

        {/* Slug */}
        <div>
          <label
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--admin-text-muted)" }}>
            {t("slugLabel")}
          </label>
          <input
            name="name"
            value={slug}
            onChange={handleSlugChange}
            disabled={isSystem}
            placeholder={t("slugPlaceholder")}
            required
            autoComplete="off"
            spellCheck={false}
            className={inputCls}
            style={{
              ...inputStyle,
              opacity: isSystem ? 0.5 : 1,
              fontFamily: "monospace",
              letterSpacing: "0.02em",
            }}
          />
          {isSystem ? (
            <p
              className="text-[11px] mt-1"
              style={{ color: "var(--admin-text-faint)" }}>
              {t("slugSystemNote")}
            </p>
          ) : (
            <p
              className="text-[11px] mt-1 flex items-center gap-1"
              style={{ color: "var(--admin-text-faint)" }}>
              {t("slugHintBefore")}
              <code
                className="px-1 rounded"
                style={{
                  background: "var(--admin-hover-bg)",
                  color: "var(--admin-text-muted)",
                  fontSize: "10px",
                }}>
                a-z 0-9 -
              </code>
              {t("slugHintAfter")}
            </p>
          )}
        </div>
      </div>

      {/* Description */}
      <div>
        <label
          className="block text-xs font-medium mb-1.5"
          style={{ color: "var(--admin-text-muted)" }}>
          {t("descriptionLabel")}
        </label>
        <textarea
          name="description"
          defaultValue={initial?.description ?? ""}
          rows={2}
          placeholder={t("descriptionPlaceholder")}
          className={`${inputCls} resize-none`}
          style={inputStyle}
        />
      </div>

      {/* Color */}
      <div>
        <label
          className="block text-xs font-medium mb-2"
          style={{ color: "var(--admin-text-muted)" }}>
          {t("colorLabel")}
        </label>
        <div className="flex items-center gap-2 flex-wrap">
          {COLOR_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
              style={{
                background: c,
                borderColor: color === c ? "var(--admin-text)" : "transparent",
              }}
            />
          ))}
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-8 h-8 rounded cursor-pointer border"
            style={{ borderColor: "var(--admin-input-border)" }}
            title={t("colorCustomTitle")}
          />
          <span
            className="text-xs font-mono px-2 py-1 rounded"
            style={{
              background: "var(--admin-hover-bg)",
              color: "var(--admin-text-muted)",
            }}>
            {color}
          </span>
        </div>
      </div>

      {/* ─── Advanced Settings (accordion) ───────────────────────── */}
      <div
        className="rounded-lg overflow-hidden"
        style={{
          border: adminOpen
            ? "1px solid #f59e0b40"
            : "1px solid var(--admin-card-border)",
        }}>
        {/* Accordion trigger */}
        <button
          type="button"
          onClick={() => setAdminOpen((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors"
          style={{
            background: adminOpen ? "#fffbeb" : "var(--admin-hover-bg)",
            color: adminOpen ? "#92400e" : "var(--admin-text-muted)",
          }}
          onMouseEnter={(e) => {
            if (!adminOpen)
              (e.currentTarget as HTMLButtonElement).style.background =
                "var(--admin-card-border)";
          }}
          onMouseLeave={(e) => {
            if (!adminOpen)
              (e.currentTarget as HTMLButtonElement).style.background =
                "var(--admin-hover-bg)";
          }}>
          <span className="flex items-center gap-2 text-xs font-medium">
            <Shield size={13} />
            {t("advancedHeading")}
            {isAdmin && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                style={{ background: "#f5f3ff", color: "#7c3aed" }}>
                <ShieldCheck size={9} /> {t("advancedActiveBadge")}
              </span>
            )}
          </span>
          <ChevronDown
            size={14}
            style={{
              transform: adminOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 200ms ease",
            }}
          />
        </button>

        {/* Collapsible content */}
        {adminOpen && (
          <div
            className="px-4 py-4 space-y-4"
            style={{ background: "var(--admin-card-bg)" }}>
            {/* Warning banner */}
            <div
              className="flex items-start gap-3 rounded-lg px-3 py-2.5"
              style={{ background: "#fffbeb", border: "1px solid #f59e0b40" }}>
              <AlertTriangle
                size={14}
                className="shrink-0 mt-0.5"
                style={{ color: "#d97706" }}
              />
              <p
                className="text-[11px] leading-relaxed"
                style={{ color: "#92400e" }}>
                {t.rich("advancedWarning", {
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </p>
            </div>

            {/* isAdmin checkbox */}
            <label className="flex items-start gap-3 cursor-pointer">
              <div className="mt-0.5 shrink-0">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isAdmin}
                  onClick={() => setIsAdmin((v) => !v)}
                  className="w-5 h-5 rounded border-2 flex items-center justify-center transition-colors"
                  style={{
                    background: isAdmin ? "#7c3aed" : "transparent",
                    borderColor: isAdmin
                      ? "#7c3aed"
                      : "var(--admin-input-border)",
                  }}>
                  {isAdmin && <Check size={11} className="text-white" />}
                </button>
              </div>
              <div>
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--admin-text)" }}>
                  {t("superAdminLabel")}
                </p>
                <p
                  className="text-xs mt-0.5"
                  style={{ color: "var(--admin-text-faint)" }}>
                  {t("superAdminHintBefore")}{" "}
                  <code
                    className="px-1 rounded"
                    style={{
                      background: "var(--admin-hover-bg)",
                      fontSize: "10px",
                    }}>
                    admin:access
                  </code>{" "}
                  {t("superAdminHintAfter")}
                </p>
              </div>
            </label>
          </div>
        )}
      </div>

      {/* ─── Dashboard preset (accordion) ───────────────────── */}
      <div
        className="rounded-lg overflow-hidden"
        style={{
          border: dashOpen
            ? "1px solid color-mix(in srgb, var(--admin-accent) 35%, transparent)"
            : "1px solid var(--admin-card-border)",
        }}>
        <button
          type="button"
          onClick={() => setDashOpen((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors"
          style={{
            background: "var(--admin-hover-bg)",
            color: "var(--admin-text-muted)",
          }}>
          <span className="flex items-center gap-2 text-xs font-medium">
            <LayoutDashboard size={13} />
            {tDash("rolePreset.heading")}
            {dashOverride && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                style={{
                  background:
                    "color-mix(in srgb, var(--admin-accent) 14%, transparent)",
                  color: "var(--admin-accent)",
                }}>
                {tDash("rolePreset.activeBadge")}
              </span>
            )}
          </span>
          <ChevronDown
            size={14}
            style={{
              transform: dashOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 200ms ease",
            }}
          />
        </button>

        {dashOpen && (
          <div
            className="px-4 py-4 space-y-4"
            style={{ background: "var(--admin-card-bg)" }}>
            {/* Override toggle */}
            <label className="flex items-start gap-3 cursor-pointer">
              <div className="mt-0.5 shrink-0">
                <button
                  type="button"
                  role="switch"
                  aria-checked={dashOverride}
                  onClick={() => setDashOverride((v) => !v)}
                  style={{
                    position: "relative",
                    width: 38,
                    height: 22,
                    borderRadius: 999,
                    border: "none",
                    background: dashOverride
                      ? "var(--admin-accent)"
                      : "var(--admin-input-border)",
                    cursor: "pointer",
                    transition: "background-color 140ms ease",
                  }}>
                  <span
                    style={{
                      position: "absolute",
                      top: 2,
                      left: 2,
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: "#fff",
                      transform: dashOverride
                        ? "translateX(16px)"
                        : "translateX(0)",
                      transition: "transform 140ms ease",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
                    }}
                  />
                </button>
              </div>
              <div>
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--admin-text)" }}>
                  {tDash("rolePreset.overrideLabel")}
                </p>
                <p
                  className="text-xs mt-0.5 leading-relaxed"
                  style={{ color: "var(--admin-text-faint)" }}>
                  {tDash("rolePreset.overrideDescription")}
                </p>
              </div>
            </label>

            {/* Per-widget toggles (only when override is on) */}
            {dashOverride && (
              <ul
                className="rounded-lg overflow-hidden"
                style={{
                  border: "1px solid var(--admin-card-border)",
                  background: "var(--admin-page-bg)",
                  margin: 0,
                  padding: 0,
                  listStyle: "none",
                }}>
                {DASHBOARD_WIDGETS_META.map((w, i) => {
                  const checked = dashEnabled.has(w.id);
                  const isLast = i === DASHBOARD_WIDGETS_META.length - 1;
                  return (
                    <li
                      key={w.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "10px 12px",
                        borderBottom: isLast
                          ? "none"
                          : "1px solid var(--admin-card-border)",
                      }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p
                          style={{
                            margin: 0,
                            fontSize: "13px",
                            color: "var(--admin-text)",
                          }}>
                          {tDash(w.titleKey)}
                        </p>
                        {w.descriptionKey && (
                          <p
                            style={{
                              margin: "2px 0 0 0",
                              fontSize: "11px",
                              color: "var(--admin-text-faint)",
                            }}>
                            {tDash(w.descriptionKey)}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={checked}
                        onClick={() => toggleDashWidget(w.id)}
                        style={{
                          position: "relative",
                          width: 34,
                          height: 20,
                          borderRadius: 999,
                          border: "none",
                          background: checked
                            ? "var(--admin-accent)"
                            : "var(--admin-input-border)",
                          cursor: "pointer",
                          flexShrink: 0,
                          transition: "background-color 140ms ease",
                        }}>
                        <span
                          style={{
                            position: "absolute",
                            top: 2,
                            left: 2,
                            width: 16,
                            height: 16,
                            borderRadius: "50%",
                            background: "#fff",
                            transform: checked
                              ? "translateX(14px)"
                              : "translateX(0)",
                            transition: "transform 140ms ease",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
                          }}
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm rounded-lg transition-colors"
          style={{
            color: "var(--admin-text-muted)",
            background: "var(--admin-hover-bg)",
          }}>
          {t("cancelButton")}
        </button>
        <button
          type="submit"
          disabled={pending || slug.length === 0}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors disabled:opacity-50"
          style={{ background: "var(--admin-accent)" }}>
          {pending ? (
            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Check size={14} />
          )}
          {isEdit ? t("saveButton") : t("createButton")}
        </button>
      </div>
    </form>
  );
}

// ─── RoleCard ─────────────────────────────────────────────────
function RoleCard({
  role,
  onEdit,
}: {
  role: RoleRow;
  onEdit: (r: RoleRow) => void;
}) {
  const t = useTranslations("admin.access.roles.card");
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleDelete() {
    startTransition(async () => {
      await deleteRole(role.id);
    });
  }

  return (
    <div
      className="rounded-xl p-4 transition-shadow hover:shadow-md"
      style={{
        background: "var(--admin-card-bg)",
        border: `1px solid var(--admin-card-border)`,
      }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: role.color + "18",
              border: `1px solid ${role.color}40`,
            }}>
            {role.isAdmin ? (
              <ShieldCheck size={16} style={{ color: role.color }} />
            ) : (
              <Shield size={16} style={{ color: role.color }} />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <RoleBadge role={role} />
              {role.isSystem && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded"
                  style={{
                    background: "var(--admin-hover-bg)",
                    color: "var(--admin-text-faint)",
                  }}>
                  <Lock size={9} /> {t("badgeSystem")}
                </span>
              )}
              {role.isAdmin && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded"
                  style={{ background: "#f5f3ff", color: "#7c3aed" }}>
                  <ShieldCheck size={9} /> {t("badgeSuperAdmin")}
                </span>
              )}
            </div>
            <p
              className="text-[11px] font-mono mt-0.5"
              style={{ color: "var(--admin-text-faint)" }}>
              {t("slugLabel", { slug: role.name })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onEdit(role)}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "var(--admin-text-muted)" }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--admin-hover-bg)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
            title={t("editTitle")}>
            <Pencil size={13} />
          </button>
          {!role.isSystem &&
            (confirmDelete ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleDelete}
                  disabled={pending}
                  className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
                  title={t("confirmDeleteTitle")}>
                  {pending ? (
                    <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Check size={13} />
                  )}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: "var(--admin-text-muted)" }}
                  title={t("cancelDeleteTitle")}>
                  <X size={13} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: "var(--admin-text-muted)" }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "#fef2f2")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
                title={t("deleteTitle")}>
                <Trash2 size={13} />
              </button>
            ))}
        </div>
      </div>

      {role.description && (
        <p
          className="text-xs mt-2.5 leading-relaxed"
          style={{ color: "var(--admin-text-muted)" }}>
          {role.description}
        </p>
      )}
    </div>
  );
}

// ─── RolesManager (root) ─────────────────────────────────────────
export function RolesManager({ roles }: { roles: RoleRow[] }) {
  const t = useTranslations("admin.access.roles");
  const [showCreate, setShowCreate] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleRow | null>(null);
  const [pending, startTransition] = useTransition();

  function handleCreate(fd: FormData) {
    startTransition(async () => {
      await createRole(fd);
      setShowCreate(false);
    });
  }

  function handleUpdate(fd: FormData) {
    if (!editingRole) return;
    startTransition(async () => {
      await updateRole(editingRole.id, fd);
      setEditingRole(null);
    });
  }

  const systemRoles = roles.filter((r) => r.isSystem);
  const customRoles = roles.filter((r) => !r.isSystem);

  return (
    <div className="space-y-6">
      {showCreate && (
        <div
          className="rounded-xl p-5"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          <h3
            className="text-sm font-semibold mb-4"
            style={{ color: "var(--admin-text)" }}>
            {t("newRoleHeading")}
          </h3>
          <RoleForm
            onSave={handleCreate}
            onCancel={() => setShowCreate(false)}
            pending={pending}
          />
        </div>
      )}

      {editingRole && (
        <div
          className="rounded-xl p-5"
          style={{
            background: "var(--admin-card-bg)",
            border: "2px solid var(--admin-accent)",
          }}>
          <h3
            className="text-sm font-semibold mb-4"
            style={{ color: "var(--admin-text)" }}>
            {t("editRoleHeading")}{" "}
            <span style={{ color: editingRole.color }}>
              {editingRole.label}
            </span>
          </h3>
          <RoleForm
            initial={editingRole}
            onSave={handleUpdate}
            onCancel={() => setEditingRole(null)}
            pending={pending}
          />
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--admin-text-faint)" }}>
            {t("systemSection", { count: systemRoles.length })}
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {systemRoles.map((r) => (
            <RoleCard key={r.id} role={r} onEdit={setEditingRole} />
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--admin-text-faint)" }}>
            {t("customSection", { count: customRoles.length })}
          </h3>
          {!showCreate && !editingRole && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg text-white transition-colors"
              style={{ background: "var(--admin-accent)" }}>
              <Plus size={13} /> {t("newRoleButton")}
            </button>
          )}
        </div>
        {customRoles.length === 0 ? (
          <div
            className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center py-10 gap-3"
            style={{
              borderColor: "var(--admin-card-border)",
              color: "var(--admin-text-faint)",
            }}>
            <Shield size={28} style={{ opacity: 0.3 }} />
            <p className="text-sm">{t("emptyTitle")}</p>
            <p
              className="text-xs text-center max-w-xs"
              style={{ color: "var(--admin-text-faint)" }}>
              {t("emptyHint")}
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg text-white transition-colors"
              style={{ background: "var(--admin-accent)" }}>
              <Plus size={13} /> {t("createFirstButton")}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {customRoles.map((r) => (
              <RoleCard key={r.id} role={r} onEdit={setEditingRole} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
