"use client";

import type { SystemPermissionsDrift } from "@/lib/rbac/permissions-queries";
import type { RoleRow } from "@/lib/db/roles-queries";
import type { Permission } from "@/lib/db/schema";
import {
  AlertTriangle,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  Loader2,
  MinusSquare,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  ShieldOff,
  Trash2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createPermission,
  deletePermission,
  grantPermissionToRole,
  revokePermissionFromRole,
  syncSystemPermissions,
  updatePermission,
} from "../actions";

// ─── Types ────────────────────────────────────────────────────────────
type RolePermission = { roleId: number; permissionId: number };

type Props = {
  permissions: Permission[];
  roles: RoleRow[];
  rolePermissions: RolePermission[];
  systemKeys: { key: string; description: string; group: string }[];
  drift: SystemPermissionsDrift;
};

// ─── PermissionBadge ──────────────────────────────────────────────────
function PermissionBadge({ perm }: { perm: Permission }) {
  return (
    <code
      className="text-[11px] font-mono px-1.5 py-0.5 rounded"
      style={{
        background: "var(--admin-hover-bg)",
        color: "var(--admin-text-muted)",
      }}>
      {perm.key}
    </code>
  );
}

// ─── EditPermissionForm ───────────────────────────────────────────────
function EditPermissionForm({
  perm,
  onSuccess,
  onCancel,
}: {
  perm: Permission;
  onSuccess: (updated: Partial<Permission>) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("admin.access.permissions.editForm");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const inputCls =
    "w-full px-3 py-2 text-sm rounded-lg outline-none focus:ring-2";
  const inputStyle = {
    background: "var(--admin-input-bg)",
    border: "1px solid var(--admin-input-border)",
    color: "var(--admin-text)",
  };

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await updatePermission(perm.id, fd);
      if (res?.error) {
        setError(res.error);
      } else {
        onSuccess({
          label: fd.get("label") as string,
          description: (fd.get("description") as string) || null,
          group: fd.get("group") as string,
        });
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-2 rounded-xl p-4 space-y-3"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <p
        className="text-[11px] font-semibold uppercase tracking-widest"
        style={{ color: "var(--admin-text-faint)" }}>
        {t("heading")}
      </p>

      <div>
        <label
          className="block text-xs font-medium mb-1"
          style={{ color: "var(--admin-text-muted)" }}>
          {t("keyLabel")}{" "}
          <span
            className="font-normal text-[11px]"
            style={{ color: "var(--admin-text-faint)" }}>
            {t("keyNotEditable")}
          </span>
        </label>
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
          style={{
            background: "var(--admin-hover-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          <code
            className="font-mono text-[12px]"
            style={{ color: "var(--admin-text-muted)" }}>
            {perm.key}
          </code>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded ml-auto"
            style={{
              background: "var(--admin-card-border)",
              color: "var(--admin-text-faint)",
            }}>
            {perm.isSystem ? t("keyBadgeSystem") : t("keyBadgeCustom")}
          </span>
        </div>
        <p
          className="text-[11px] mt-1 flex items-center gap-1"
          style={{ color: "var(--admin-text-faint)" }}>
          <AlertTriangle size={10} />
          {t("keyChangeWarning")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            className="block text-xs font-medium mb-1"
            style={{ color: "var(--admin-text-muted)" }}>
            {t("labelLabel")}
          </label>
          <input
            name="label"
            required
            defaultValue={perm.label}
            placeholder={t("labelPlaceholder")}
            className={inputCls}
            style={inputStyle}
          />
        </div>
        <div>
          <label
            className="block text-xs font-medium mb-1"
            style={{ color: "var(--admin-text-muted)" }}>
            {t("groupLabel")}
          </label>
          <input
            name="group"
            required
            defaultValue={perm.group}
            placeholder={t("groupPlaceholder")}
            className={inputCls}
            style={inputStyle}
          />
        </div>
        <div className="col-span-2">
          <label
            className="block text-xs font-medium mb-1"
            style={{ color: "var(--admin-text-muted)" }}>
            {t("descriptionLabel")}
          </label>
          <input
            name="description"
            defaultValue={perm.description ?? ""}
            placeholder={t("descriptionPlaceholder")}
            className={inputCls}
            style={inputStyle}
          />
        </div>
      </div>

      {error && (
        <p
          className="text-xs flex items-center gap-1"
          style={{ color: "#dc2626" }}>
          <AlertTriangle size={12} /> {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm rounded-lg transition-colors"
          style={{
            background: "var(--admin-hover-bg)",
            color: "var(--admin-text-muted)",
          }}>
          {t("cancelButton")}
        </button>
        <button
          type="submit"
          disabled={pending}
          className="px-3 py-1.5 text-sm rounded-lg font-medium transition-colors disabled:opacity-60 flex items-center gap-1.5"
          style={{ background: "var(--admin-accent)", color: "#fff" }}>
          {pending ? (
            <>
              <Loader2 size={12} className="animate-spin" /> {t("savingButton")}
            </>
          ) : (
            t("saveButton")
          )}
        </button>
      </div>
    </form>
  );
}

// ─── PermissionCatalog ────────────────────────────────────────────────
function PermissionCatalog({
  permissions,
  systemKeys,
  onDelete,
  onUpdate,
}: {
  permissions: Permission[];
  systemKeys: Props["systemKeys"];
  onDelete: (id: number) => Promise<void>;
  onUpdate: (id: number, patch: Partial<Permission>) => void;
}) {
  const t = useTranslations("admin.access.permissions.catalog");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [keyValue, setKeyValue] = useState("");
  const datalistId = useId();

  const suggested = systemKeys.find((k) => k.key === keyValue) ?? null;

  const grouped = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    const g = p.group ?? "Other";
    (acc[g] ??= []).push(p);
    return acc;
  }, {});

  const filtered = search.trim()
    ? Object.fromEntries(
        Object.entries(grouped)
          .map(([g, ps]) => [
            g,
            ps.filter(
              (p) =>
                p.key.toLowerCase().includes(search.toLowerCase()) ||
                p.label.toLowerCase().includes(search.toLowerCase()),
            ),
          ])
          .filter(([, ps]) => (ps as Permission[]).length > 0),
      )
    : grouped;

  function handleCreate(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setFormError(null);
    startTransition(async () => {
      const res = await createPermission(fd);
      if (res?.error) {
        setFormError(res.error);
      } else {
        setShowCreate(false);
        setKeyValue("");
      }
    });
  }

  const inputCls =
    "w-full px-3 py-2 text-sm rounded-lg outline-none focus:ring-2";
  const inputStyle = {
    background: "var(--admin-input-bg)",
    border: "1px solid var(--admin-input-border)",
    color: "var(--admin-text)",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--admin-text-faint)" }}
          />
          <input
            type="text"
            placeholder={t("filterPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-4 py-2 text-sm rounded-lg outline-none"
            style={{
              background: "var(--admin-input-bg)",
              border: "1px solid var(--admin-input-border)",
              color: "var(--admin-text)",
            }}
          />
        </div>
        {!showCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg text-white whitespace-nowrap"
            style={{ background: "var(--admin-accent)" }}>
            <Plus size={13} /> {t("newButton")}
          </button>
        )}
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl p-4 space-y-3"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}>
          <p
            className="text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--admin-text-faint)" }}>
            {t("newPermissionHeading")}
          </p>
          <datalist id={datalistId}>
            {systemKeys.map((k) => (
              <option key={k.key} value={k.key} label={k.description} />
            ))}
          </datalist>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: "var(--admin-text-muted)" }}>
                {t("fieldKeyLabel")}
              </label>
              <input
                name="key"
                list={datalistId}
                required
                placeholder={t("fieldKeyPlaceholder")}
                className={inputCls}
                style={inputStyle}
                value={keyValue}
                onChange={(e) => setKeyValue(e.target.value)}
              />
            </div>
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: "var(--admin-text-muted)" }}>
                {t("fieldLabelLabel")}
              </label>
              <input
                name="label"
                required
                placeholder={t("fieldLabelPlaceholder")}
                className={inputCls}
                style={inputStyle}
                defaultValue={suggested?.description ?? ""}
                key={suggested?.key ?? "custom"}
              />
            </div>
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: "var(--admin-text-muted)" }}>
                {t("fieldGroupLabel")}
              </label>
              <input
                name="group"
                required
                placeholder={t("fieldGroupPlaceholder")}
                className={inputCls}
                style={inputStyle}
                defaultValue={suggested?.group ?? ""}
                key={(suggested?.key ?? "custom") + "-group"}
              />
              <p className="text-[11px] mt-1">{t("fieldGroupHint")}</p>
            </div>
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: "var(--admin-text-muted)" }}>
                {t("fieldDescriptionLabel")}
              </label>
              <input
                name="description"
                placeholder={t("fieldDescriptionPlaceholder")}
                className={inputCls}
                style={inputStyle}
              />
            </div>
          </div>
          {formError && (
            <p
              className="text-xs flex items-center gap-1"
              style={{ color: "#dc2626" }}>
              <AlertTriangle size={12} /> {formError}
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                setFormError(null);
              }}
              className="px-3 py-1.5 text-sm rounded-lg transition-colors"
              style={{
                background: "var(--admin-hover-bg)",
                color: "var(--admin-text-muted)",
              }}>
              {t("cancelButton")}
            </button>
            <button
              type="submit"
              disabled={pending}
              className="px-3 py-1.5 text-sm rounded-lg font-medium transition-colors disabled:opacity-60"
              style={{ background: "var(--admin-accent)", color: "#fff" }}>
              {pending ? t("savingButton") : t("saveButton")}
            </button>
          </div>
        </form>
      )}

      {Object.entries(filtered).map(([group, perms]) => (
        <GroupSection
          key={group}
          group={group}
          perms={perms as Permission[]}
          onDelete={onDelete}
          onUpdate={onUpdate}
        />
      ))}

      {Object.keys(filtered).length === 0 && (
        <div
          className="py-10 text-center"
          style={{ color: "var(--admin-text-faint)" }}>
          <Shield size={28} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">{t("empty")}</p>
        </div>
      )}
    </div>
  );
}

// ─── GroupSection ─────────────────────────────────────────────────────
function GroupSection({
  group,
  perms,
  onDelete,
  onUpdate,
}: {
  group: string;
  perms: Permission[];
  onDelete: (id: number) => Promise<void>;
  onUpdate: (id: number, patch: Partial<Permission>) => void;
}) {
  const t = useTranslations("admin.access.permissions.catalog");
  const [open, setOpen] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  function handleDelete(id: number) {
    startTransition(async () => {
      await onDelete(id);
      setDeletingId(null);
    });
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: "1px solid var(--admin-card-border)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors"
        style={{ background: "var(--admin-hover-bg)" }}>
        <span
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--admin-text-faint)" }}>
          {group}
        </span>
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{
              background: "var(--admin-card-border)",
              color: "var(--admin-text-faint)",
            }}>
            {t("groupKeysCount", { count: perms.length })}
          </span>
          {open ? (
            <ChevronDown
              size={13}
              style={{ color: "var(--admin-text-faint)" }}
            />
          ) : (
            <ChevronRight
              size={13}
              style={{ color: "var(--admin-text-faint)" }}
            />
          )}
        </div>
      </button>

      {open && (
        <div
          className="divide-y"
          style={{ borderTop: "1px solid var(--admin-card-border)" }}>
          {perms.map((perm) => (
            <div key={perm.id}>
              <div
                className="flex items-center justify-between gap-3 px-4 py-3"
                style={{ background: "var(--admin-card-bg)" }}>
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: "var(--admin-hover-bg)" }}>
                    <Shield
                      size={11}
                      style={{ color: "var(--admin-text-faint)" }}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <PermissionBadge perm={perm} />
                      <span
                        className="text-sm font-medium truncate"
                        style={{ color: "var(--admin-text)" }}>
                        {perm.label}
                      </span>
                    </div>
                    {perm.description && (
                      <p
                        className="text-[11px] mt-0.5"
                        style={{ color: "var(--admin-text-faint)" }}>
                        {perm.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {editingId !== perm.id && deletingId !== perm.id && (
                    <button
                      onClick={() => {
                        setEditingId(perm.id);
                        setDeletingId(null);
                      }}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: "var(--admin-text-muted)" }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background =
                          "var(--admin-hover-bg)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                      title={t("editAriaTitle", { label: perm.label })}
                      aria-label={t("editAriaLabel", { label: perm.label })}>
                      <Pencil size={13} />
                    </button>
                  )}
                  {deletingId === perm.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(perm.id)}
                        className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
                        title={t("confirmDeleteTitle")}>
                        <Check size={13} />
                      </button>
                      <button
                        onClick={() => setDeletingId(null)}
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: "var(--admin-text-muted)" }}
                        title={t("cancelDeleteTitle")}>
                        <X size={13} />
                      </button>
                    </div>
                  ) : editingId !== perm.id ? (
                    <button
                      onClick={() => {
                        setDeletingId(perm.id);
                        setEditingId(null);
                      }}
                      disabled={perm.isSystem}
                      className="p-1.5 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{ color: "var(--admin-text-muted)" }}
                      onMouseEnter={(e) => {
                        if (!perm.isSystem)
                          e.currentTarget.style.background = "#fef2f2";
                      }}
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                      title={
                        perm.isSystem
                          ? t("deleteDisabledTitle")
                          : t("deleteAriaTitle", { label: perm.label })
                      }
                      aria-label={
                        perm.isSystem
                          ? t("deleteDisabledTitle")
                          : t("deleteAriaLabel", { label: perm.label })
                      }>
                      <Trash2 size={13} />
                    </button>
                  ) : (
                    <button
                      onClick={() => setEditingId(null)}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: "var(--admin-text-muted)" }}
                      title={t("cancelDeleteTitle")}>
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>
              {editingId === perm.id && (
                <div
                  className="px-4 pb-4"
                  style={{ background: "var(--admin-card-bg)" }}>
                  <EditPermissionForm
                    perm={perm}
                    onSuccess={(patch) => {
                      onUpdate(perm.id, patch);
                      setEditingId(null);
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PresetGroupHeader ────────────────────────────────────────────────
// Header di gruppo nella matrice con bottoni preset "assegna tutto" / "revoca tutto"
function PresetGroupHeader({
  group,
  perms,
  roleId,
  roleIsAdmin,
  hasPermission,
  onPreset,
}: {
  group: string;
  perms: Permission[];
  roleId: number;
  roleIsAdmin: boolean;
  hasPermission: (roleId: number, permId: number) => boolean;
  onPreset: (roleId: number, permIds: number[], grant: boolean) => void;
}) {
  const t = useTranslations("admin.access.permissions.matrix");
  const allGranted = perms.every((p) => hasPermission(roleId, p.id));
  const noneGranted = perms.every((p) => !hasPermission(roleId, p.id));
  const partial = !allGranted && !noneGranted;

  if (roleIsAdmin) {
    return (
      <div
        className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest sticky top-0 flex items-center justify-between"
        style={{
          borderTop: "1px solid var(--admin-card-border)",
          background: "var(--admin-page-bg)",
          color: "var(--admin-text-faint)",
        }}>
        <span>{group}</span>
      </div>
    );
  }

  return (
    <div
      className="px-4 py-1.5 sticky top-0 flex items-center justify-between gap-2"
      style={{
        borderTop: "1px solid var(--admin-card-border)",
        background: "var(--admin-page-bg)",
      }}>
      <div className="flex items-center gap-1.5">
        {partial ? (
          <MinusSquare size={11} style={{ color: "var(--admin-accent)" }} />
        ) : allGranted ? (
          <CheckSquare size={11} style={{ color: "var(--admin-accent)" }} />
        ) : (
          <Shield size={11} style={{ color: "var(--admin-text-faint)" }} />
        )}
        <span
          className="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--admin-text-faint)" }}>
          {group}
        </span>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full"
          style={{
            background: "var(--admin-card-border)",
            color: "var(--admin-text-faint)",
          }}>
          {t("groupCount", {
            granted: perms.filter((p) => hasPermission(roleId, p.id)).length,
            total: perms.length,
          })}
        </span>
      </div>

      <div className="flex items-center gap-1">
        {/* Assegna tutto il gruppo */}
        {!allGranted && (
          <button
            onClick={() =>
              onPreset(
                roleId,
                perms.map((p) => p.id),
                true,
              )
            }
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded transition-colors whitespace-nowrap"
            style={{
              background:
                "color-mix(in oklch, var(--admin-accent) 12%, transparent)",
              color: "var(--admin-accent)",
              border:
                "1px solid color-mix(in oklch, var(--admin-accent) 25%, transparent)",
            }}
            title={t("groupGrantAllTitle", { group })}>
            <CheckSquare size={10} />
            {t("groupGrantAll")}
          </button>
        )}
        {/* Revoca tutto il gruppo */}
        {!noneGranted && (
          <button
            onClick={() =>
              onPreset(
                roleId,
                perms.map((p) => p.id),
                false,
              )
            }
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded transition-colors whitespace-nowrap"
            style={{
              background: "#fef2f2",
              color: "#dc2626",
              border: "1px solid #fecaca",
            }}
            title={t("groupRevokeAllTitle", { group })}>
            <X size={10} />
            {t("groupRevokeAll")}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── RoleMatrix ───────────────────────────────────────────────────────
function RoleMatrix({
  permissions,
  roles,
  initialRolePermissions,
}: {
  permissions: Permission[];
  roles: RoleRow[];
  initialRolePermissions: RolePermission[];
}) {
  const t = useTranslations("admin.access.permissions.matrix");
  const [optimisticRPs, applyOptimistic] = useOptimistic(
    initialRolePermissions,
    (
      state,
      update:
        | { type: "grant" | "revoke"; roleId: number; permissionId: number }
        | {
            type: "grant_many" | "revoke_many";
            roleId: number;
            permissionIds: number[];
          },
    ) => {
      if (update.type === "grant") {
        return [
          ...state,
          { roleId: update.roleId, permissionId: update.permissionId },
        ];
      }
      if (update.type === "revoke") {
        return state.filter(
          (rp) =>
            !(
              rp.roleId === update.roleId &&
              rp.permissionId === update.permissionId
            ),
        );
      }
      if (update.type === "grant_many") {
        const existing = new Set(
          state
            .filter((rp) => rp.roleId === update.roleId)
            .map((rp) => rp.permissionId),
        );
        const toAdd = update.permissionIds
          .filter((id) => !existing.has(id))
          .map((id) => ({ roleId: update.roleId, permissionId: id }));
        return [...state, ...toAdd];
      }
      if (update.type === "revoke_many") {
        const toRevoke = new Set(update.permissionIds);
        return state.filter(
          (rp) =>
            !(rp.roleId === update.roleId && toRevoke.has(rp.permissionId)),
        );
      }
      return state;
    },
  );
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [selectedRole, setSelectedRole] = useState<number | null>(
    roles.length > 0 ? roles[0].id : null,
  );
  const [presetLoading, setPresetLoading] = useState(false);

  const role = roles.find((r) => r.id === selectedRole);

  const grouped = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    const g = p.group ?? "Other";
    (acc[g] ??= []).push(p);
    return acc;
  }, {});

  const filtered = search.trim()
    ? Object.fromEntries(
        Object.entries(grouped)
          .map(([g, ps]) => [
            g,
            ps.filter(
              (p) =>
                p.key.toLowerCase().includes(search.toLowerCase()) ||
                p.label.toLowerCase().includes(search.toLowerCase()),
            ),
          ])
          .filter(([, ps]) => (ps as Permission[]).length > 0),
      )
    : grouped;

  function hasPermission(roleId: number, permId: number) {
    return optimisticRPs.some(
      (rp) => rp.roleId === roleId && rp.permissionId === permId,
    );
  }

  function toggle(roleId: number, permId: number) {
    const has = hasPermission(roleId, permId);
    startTransition(async () => {
      applyOptimistic({
        type: has ? "revoke" : "grant",
        roleId,
        permissionId: permId,
      });
      if (has) {
        await revokePermissionFromRole(roleId, permId);
      } else {
        await grantPermissionToRole(roleId, permId);
      }
    });
  }

  // ── Preset: assegna o revoca un intero gruppo ──────────────────────
  function handlePreset(roleId: number, permIds: number[], grant: boolean) {
    const toChange = grant
      ? permIds.filter((id) => !hasPermission(roleId, id))
      : permIds.filter((id) => hasPermission(roleId, id));

    if (toChange.length === 0) return;

    startTransition(async () => {
      setPresetLoading(true);
      applyOptimistic(
        grant
          ? { type: "grant_many", roleId, permissionIds: toChange }
          : { type: "revoke_many", roleId, permissionIds: toChange },
      );
      await Promise.all(
        toChange.map((permId) =>
          grant
            ? grantPermissionToRole(roleId, permId)
            : revokePermissionFromRole(roleId, permId),
        ),
      );
      setPresetLoading(false);
    });
  }

  if (roles.length === 0) {
    return (
      <div
        className="py-12 text-center"
        style={{ color: "var(--admin-text-faint)" }}>
        <Shield size={28} className="mx-auto mb-2 opacity-30" />
        <p className="text-sm">{t("emptyRoles")}</p>
      </div>
    );
  }

  return (
    <div
      className="flex gap-0 rounded-xl overflow-hidden"
      style={{ border: "1px solid var(--admin-card-border)", minHeight: 400 }}>
      {/* Sidebar ruoli */}
      <div
        className="w-48 shrink-0 flex flex-col"
        style={{
          background: "var(--admin-card-bg)",
          borderRight: "1px solid var(--admin-card-border)",
        }}>
        <div
          className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest"
          style={{
            borderBottom: "1px solid var(--admin-card-border)",
            color: "var(--admin-text-faint)",
          }}>
          {t("rolesHeading")}
        </div>
        {roles.map((r) => {
          const count = optimisticRPs.filter((rp) => rp.roleId === r.id).length;
          const isActive = selectedRole === r.id;
          return (
            <button
              key={r.id}
              onClick={() => setSelectedRole(r.id)}
              className="w-full text-left px-3 py-2.5 transition-colors"
              style={{
                background: isActive
                  ? "color-mix(in oklch, var(--admin-accent) 14%, var(--admin-card-bg))"
                  : "transparent",
                borderBottom: "1px solid var(--admin-card-border)",
                borderLeft: isActive
                  ? "3px solid var(--admin-accent)"
                  : "3px solid transparent",
              }}>
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: r.color }}
                />
                <span
                  className="text-xs truncate"
                  style={{
                    color: isActive
                      ? "var(--admin-text)"
                      : "var(--admin-text-muted)",
                    fontWeight: isActive ? 600 : 400,
                  }}>
                  {r.label}
                </span>
              </div>
              <div className="flex items-center gap-1 mt-0.5 ml-4">
                <span
                  className="text-[10px]"
                  style={{
                    color: isActive
                      ? "var(--admin-text-muted)"
                      : "var(--admin-text-faint)",
                  }}>
                  {t("rolePermissionsCount", { count })}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Permessi per ruolo selezionato */}
      <div className="flex-1 min-w-0 flex flex-col">
        {role && (
          <>
            {/* Header ruolo */}
            <div
              className="px-4 py-2.5 flex items-center justify-between gap-3"
              style={{
                borderBottom: "1px solid var(--admin-card-border)",
                background: "var(--admin-card-bg)",
              }}>
              <div className="flex items-center gap-2 flex-wrap">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: role.color }}
                />
                <span
                  className="text-sm font-semibold"
                  style={{ color: "var(--admin-text)" }}>
                  {role.label}
                </span>
                {role.isAdmin && (
                  <span
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                    style={{
                      background: "var(--admin-hover-bg)",
                      color: "var(--admin-text-faint)",
                    }}>
                    {t("adminBadge")}
                  </span>
                )}
                {presetLoading && (
                  <span
                    className="flex items-center gap-1 text-[10px]"
                    style={{ color: "var(--admin-accent)" }}>
                    <Loader2 size={10} className="animate-spin" />{" "}
                    {t("applyingPreset")}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* Preset globali: assegna/revoca tutto */}
                {!role.isAdmin && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() =>
                        handlePreset(
                          role.id,
                          permissions.map((p) => p.id),
                          true,
                        )
                      }
                      className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded transition-colors whitespace-nowrap"
                      style={{
                        background:
                          "color-mix(in oklch, var(--admin-accent) 12%, transparent)",
                        color: "var(--admin-accent)",
                        border:
                          "1px solid color-mix(in oklch, var(--admin-accent) 25%, transparent)",
                      }}
                      title={t("presetGrantAllTitle")}>
                      <CheckSquare size={10} /> {t("presetGrantAll")}
                    </button>
                    <button
                      onClick={() =>
                        handlePreset(
                          role.id,
                          permissions.map((p) => p.id),
                          false,
                        )
                      }
                      className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded transition-colors whitespace-nowrap"
                      style={{
                        background: "#fef2f2",
                        color: "#dc2626",
                        border: "1px solid #fecaca",
                      }}
                      title={t("presetRevokeAllTitle")}>
                      <X size={10} /> {t("presetRevokeAll")}
                    </button>
                  </div>
                )}
                <div className="relative">
                  <Search
                    size={12}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: "var(--admin-text-faint)" }}
                  />
                  <input
                    type="text"
                    placeholder={t("filterPlaceholder")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-7 pr-3 py-1.5 text-xs rounded-lg outline-none border"
                    style={{
                      background: "var(--admin-input-bg)",
                      borderColor: "var(--admin-input-border)",
                      color: "var(--admin-text)",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Lista permessi per gruppo */}
            <div className="flex-1 overflow-auto">
              {Object.entries(filtered).map(([group, perms]) => (
                <div key={group}>
                  <PresetGroupHeader
                    group={group}
                    perms={perms as Permission[]}
                    roleId={role.id}
                    roleIsAdmin={role.isAdmin}
                    hasPermission={hasPermission}
                    onPreset={handlePreset}
                  />
                  {(perms as Permission[]).map((perm) => {
                    const has = hasPermission(role.id, perm.id);
                    return (
                      <div
                        key={perm.id}
                        className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors"
                        style={{
                          borderTop: "1px solid var(--admin-card-border)",
                          background: has
                            ? "color-mix(in oklch, var(--admin-accent) 12%, var(--admin-card-bg))"
                            : "var(--admin-card-bg)",
                          borderLeft: has
                            ? "3px solid var(--admin-accent)"
                            : "3px solid transparent",
                        }}>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <code
                              className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                              style={{
                                background: "var(--admin-hover-bg)",
                                color: "var(--admin-text-muted)",
                              }}>
                              {perm.key}
                            </code>
                            <span
                              className="text-xs"
                              style={{ color: "var(--admin-text)" }}>
                              {perm.label}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => toggle(role.id, perm.id)}
                          disabled={role.isAdmin}
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                          title={
                            role.isAdmin
                              ? t("toggleAdminTitle")
                              : has
                                ? t("toggleRevokeTitle", { label: perm.label })
                                : t("toggleGrantTitle", { label: perm.label })
                          }
                          aria-label={
                            role.isAdmin
                              ? t("toggleAdminAria")
                              : has
                                ? t("toggleRevokeAria", { label: perm.label })
                                : t("toggleGrantAria", { label: perm.label })
                          }
                          style={{
                            background: has
                              ? "color-mix(in oklch, var(--admin-accent) 25%, transparent)"
                              : "var(--admin-input-bg)",
                            border: has
                              ? "1px solid color-mix(in oklch, var(--admin-accent) 40%, transparent)"
                              : "1px solid var(--admin-input-border)",
                          }}>
                          {has ? (
                            <ShieldCheck
                              size={14}
                              style={{ color: "var(--admin-accent)" }}
                            />
                          ) : (
                            <ShieldOff
                              size={14}
                              style={{ color: "var(--admin-text-muted)" }}
                            />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
              {Object.keys(filtered).length === 0 && (
                <div
                  className="py-10 text-center"
                  style={{ color: "var(--admin-text-faint)" }}>
                  <p className="text-sm">{t("emptyPermissions")}</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── SystemKeysPanel ──────────────────────────────────────────────────
function SystemKeysPanel({ keys }: { keys: Props["systemKeys"] }) {
  const t = useTranslations("admin.access.permissions.systemKeys");
  const [open, setOpen] = useState(false);
  const grouped = keys.reduce<Record<string, typeof keys>>((acc, k) => {
    (acc[k.group] ??= []).push(k);
    return acc;
  }, {});

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors"
        onMouseEnter={(e) =>
          (e.currentTarget.style.background = "var(--admin-hover-bg)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.background = "transparent")
        }>
        <div className="flex items-center gap-2">
          <HelpCircle size={14} style={{ color: "var(--admin-accent)" }} />
          <span
            className="text-sm font-medium"
            style={{ color: "var(--admin-text)" }}>
            {t("triggerLabel")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{
              background: "var(--admin-card-border)",
              color: "var(--admin-text-faint)",
            }}>
            {t("keysCount", { count: keys.length })}
          </span>
          <ChevronRight
            size={13}
            style={{
              color: "var(--admin-text-faint)",
              transform: open ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 200ms",
            }}
          />
        </div>
      </button>
      {open && (
        <div style={{ borderTop: "1px solid var(--admin-card-border)" }}>
          {Object.entries(grouped).map(([group, ks]) => (
            <div key={group}>
              <div
                className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest"
                style={{
                  background: "var(--admin-hover-bg)",
                  color: "var(--admin-text-faint)",
                }}>
                {group}
              </div>
              {ks.map((k) => (
                <div
                  key={k.key}
                  className="flex items-center gap-3 px-4 py-2"
                  style={{
                    borderTop: "1px solid var(--admin-card-border)",
                    background: "var(--admin-page-bg)",
                  }}>
                  <code
                    className="text-[11px] font-mono px-1.5 py-0.5 rounded shrink-0"
                    style={{
                      background: "var(--admin-hover-bg)",
                      color: "var(--admin-text-muted)",
                    }}>
                    {k.key}
                  </code>
                  <span
                    className="text-xs"
                    style={{ color: "var(--admin-text-muted)" }}>
                    {k.description}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── DriftBanner ──────────────────────────────────────────────────────
// Shows when the in-code system catalog is ahead of the DB. One click on
// "Sync now" runs the same upsert the seed script does — idempotent.
function DriftBanner({ drift }: { drift: SystemPermissionsDrift }) {
  const t = useTranslations("admin.access.permissions.sync");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    | { ok: true; inserted: number; refreshed: number; granted: number }
    | { ok: false; error: string }
    | null
  >(null);

  const missingCount = drift.missing.length;
  const divergentCount = drift.divergent.length;
  const total = missingCount + divergentCount;

  // Auto-clear "ok" feedback when the server-fresh drift comes back empty.
  useEffect(() => {
    if (total === 0) setResult(null);
  }, [total]);

  if (total === 0 && !result) return null;

  function handleSync() {
    setResult(null);
    startTransition(async () => {
      try {
        const r = await syncSystemPermissions();
        if ("error" in r) {
          setResult({ ok: false, error: r.error });
        } else {
          setResult({
            ok: true,
            inserted: r.inserted,
            refreshed: r.refreshed,
            granted: r.granted,
          });
          router.refresh();
        }
      } catch (e) {
        setResult({
          ok: false,
          error: e instanceof Error ? e.message : t("syncFailed"),
        });
      }
    });
  }

  // Successful sync — show a brief confirmation banner before drift goes 0.
  if (result?.ok && total === 0) {
    return (
      <div
        className="rounded-xl px-4 py-3 flex items-center gap-3"
        style={{
          background:
            "color-mix(in srgb, var(--admin-accent) 8%, var(--admin-card-bg))",
          border:
            "1px solid color-mix(in srgb, var(--admin-accent) 30%, transparent)",
        }}>
        <Check
          size={16}
          style={{ color: "var(--admin-accent)", flexShrink: 0 }}
        />
        <p className="text-sm" style={{ color: "var(--admin-text)" }}>
          {t("syncedBanner", {
            inserted: result.inserted,
            refreshed: result.refreshed,
            granted: result.granted,
          })}
        </p>
      </div>
    );
  }

  if (total === 0) return null;

  const headline =
    missingCount > 0 && divergentCount > 0
      ? t("headlineMixed", { missing: missingCount, drifted: divergentCount })
      : missingCount > 0
        ? t("headlineMissing", { count: missingCount })
        : t("headlineDrifted", { count: divergentCount });

  return (
    <div
      className="rounded-xl p-4 space-y-2"
      style={{
        background: "color-mix(in srgb, #f59e0b 8%, var(--admin-card-bg))",
        border: "1px solid color-mix(in srgb, #f59e0b 35%, transparent)",
      }}>
      <div className="flex items-start gap-3">
        <AlertTriangle
          size={16}
          style={{ color: "#b45309", flexShrink: 0, marginTop: 2 }}
        />
        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-semibold"
            style={{ color: "var(--admin-text)" }}>
            {headline}
          </p>
          <p
            className="text-[12px] mt-0.5"
            style={{ color: "var(--admin-text-muted)" }}>
            {t("body")}
          </p>

          {missingCount > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {drift.missing.slice(0, 8).map((m) => (
                <code
                  key={m.key}
                  className="text-[11px] font-mono px-1.5 py-0.5 rounded"
                  style={{
                    background:
                      "color-mix(in srgb, #f59e0b 14%, transparent)",
                    color: "#92400e",
                    border:
                      "1px solid color-mix(in srgb, #f59e0b 30%, transparent)",
                  }}
                  title={m.label}>
                  {m.key}
                </code>
              ))}
              {missingCount > 8 && (
                <span
                  className="text-[11px]"
                  style={{ color: "var(--admin-text-faint)" }}>
                  {t("moreCount", { count: missingCount - 8 })}
                </span>
              )}
            </div>
          )}

          {result && !result.ok && (
            <p
              className="mt-2 text-[12px] flex items-center gap-1"
              style={{ color: "#dc2626" }}>
              <AlertTriangle size={12} />
              {result.error}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleSync}
          disabled={pending}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md text-white disabled:opacity-60"
          style={{ background: "#b45309" }}>
          {pending ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              {t("syncing")}
            </>
          ) : (
            <>
              <RefreshCw size={12} />
              {t("syncNow")}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────
const TABS = [
  { id: "matrix", icon: ShieldCheck },
  { id: "catalog", icon: Shield },
] as const;
type TabId = (typeof TABS)[number]["id"];

// ─── Root ─────────────────────────────────────────────────────────────
export function PermissionsManager({
  permissions: initialPermissions,
  roles,
  rolePermissions,
  systemKeys,
  drift,
}: Props) {
  const t = useTranslations("admin.access.permissions.tabs");
  const [activeTab, setActiveTab] = useState<TabId>("matrix");
  const [optimisticPerms, applyOptimistic] = useOptimistic(
    initialPermissions,
    (
      state,
      action:
        | { type: "delete"; id: number }
        | { type: "update"; id: number; patch: Partial<Permission> },
    ) => {
      if (action.type === "delete")
        return state.filter((p) => p.id !== action.id);
      return state.map((p) =>
        p.id === action.id ? { ...p, ...action.patch } : p,
      );
    },
  );
  const [, startTransition] = useTransition();

  function handleDelete(id: number) {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        applyOptimistic({ type: "delete", id });
        await deletePermission(id);
        resolve();
      });
    });
  }

  function handleUpdate(id: number, patch: Partial<Permission>) {
    startTransition(() => {
      applyOptimistic({ type: "update", id, patch });
    });
  }

  return (
    <div className="space-y-4">
      <DriftBanner drift={drift} />

      <SystemKeysPanel keys={systemKeys} />

      <div
        className="flex items-center gap-1 p-1 rounded-xl w-fit"
        style={{ background: "var(--admin-hover-bg)" }}>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg font-medium transition-all"
              style={{
                background: isActive ? "var(--admin-accent)" : "transparent",
                color: isActive ? "#fff" : "var(--admin-text-muted)",
                boxShadow: isActive ? "0 1px 3px oklch(0 0 0 / 0.15)" : "none",
              }}>
              <Icon size={13} />
              {t(tab.id)}
            </button>
          );
        })}
      </div>

      {activeTab === "matrix" && (
        <RoleMatrix
          permissions={optimisticPerms}
          roles={roles}
          initialRolePermissions={rolePermissions}
        />
      )}
      {activeTab === "catalog" && (
        <PermissionCatalog
          permissions={optimisticPerms}
          systemKeys={systemKeys}
          onDelete={handleDelete}
          onUpdate={handleUpdate}
        />
      )}
    </div>
  );
}
