"use client";

import type { AdminUserDetail } from "@/lib/db/admin-queries";
import type { RoleRow } from "@/lib/db/roles-queries";
import { Check, Shield, ShieldBan, ShieldCheck, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { setUserRole } from "../../../roles/actions";
import BanModal from "../../_components/ban-modal";
import DeleteModal from "../../_components/delete-modal";
import { unbanUser } from "../../actions";

// ─── BanButton ────────────────────────────────────────────────────────
export function BanButton({ user }: { user: AdminUserDetail }) {
  const [showModal, setShowModal] = useState(false);
  const [pending, startTransition] = useTransition();
  const isBanned = !!user.bannedAt;
  const isDeleted = !!user.deletedAt;
  const userName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

  if (user.isAdmin) {
    return (
      <span className="text-xs text-gray-400 italic">
        Admins cannot be suspended
      </span>
    );
  }

  if (isDeleted) return null;

  return (
    <>
      {isBanned ? (
        <button
          disabled={pending}
          onClick={() => startTransition(() => unbanUser(user.id))}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50">
          <ShieldCheck size={15} /> Reactivate account
        </button>
      ) : (
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors">
          <ShieldBan size={15} /> Suspend account
        </button>
      )}
      {showModal && (
        <BanModal
          userId={user.id}
          userName={userName}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

// ─── DeleteButton ─────────────────────────────────────────────────────
export function DeleteButton({
  user,
  canDelete,
}: {
  user: AdminUserDetail;
  canDelete: boolean;
}) {
  const [showModal, setShowModal] = useState(false);

  // Don't show anything if: no permission, already deleted, or is admin
  if (!canDelete || !!user.deletedAt || user.isAdmin) return null;

  const fullName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        title="Delete user"
        aria-label="Delete user"
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors"
        style={{
          background: "var(--admin-hover-bg)",
          color: "var(--color-error, #a12c7b)",
        }}>
        <Trash2 size={15} />
        Delete account
      </button>
      {showModal && (
        <DeleteModal
          userId={user.id}
          userName={fullName}
          userEmail={user.email}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

// ─── RoleSelector — with DB roles ──────────────────────────────────
export function RoleSelector({
  user,
  availableRoles,
  isDeleted = false,
}: {
  user: AdminUserDetail;
  availableRoles: RoleRow[];
  isDeleted?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState(user.role);
  const [saved, setSaved] = useState(false);

  const currentRoleData = availableRoles.find((r) => r.name === selected);

  function handleSelect(roleName: string) {
    if (isDeleted) return;
    setSelected(roleName);
    setSaved(false);
  }

  function handleSave() {
    if (isDeleted) return;
    startTransition(async () => {
      await setUserRole(user.id, selected);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="space-y-4">
      {/* Role Grid */}
      <div
        className="grid grid-cols-1 gap-2"
        style={isDeleted ? { opacity: 0.55 } : undefined}>
        {availableRoles.map((role) => {
          const isSelected = selected === role.name;
          return (
            <button
              key={role.name}
              type="button"
              onClick={() => handleSelect(role.name)}
              disabled={isDeleted}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all disabled:cursor-not-allowed"
              style={{
                background: isSelected ? role.color + "12" : "var(--admin-bg)",
                border: isSelected
                  ? `2px solid ${role.color}`
                  : "2px solid var(--admin-card-border)",
              }}>
              {/* Icon */}
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: role.color + "20" }}>
                <Shield size={14} style={{ color: role.color }} />
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-sm font-semibold"
                    style={{
                      color: isSelected ? role.color : "var(--admin-text)",
                    }}>
                    {role.label}
                  </span>
                  {role.isAdmin && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                      style={{ background: "#f5f3ff", color: "#7c3aed" }}>
                      Admin
                    </span>
                  )}
                </div>
                {role.description && (
                  <p
                    className="text-[11px] mt-0.5 truncate"
                    style={{ color: "var(--admin-text-faint)" }}>
                    {role.description}
                  </p>
                )}
              </div>
              {/* Selection Check */}
              {isSelected && (
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: role.color }}>
                  <Check size={11} className="text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer — save only if changed */}
      {!isDeleted && selected !== user.role && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
            Changing from{" "}
            <strong style={{ color: "var(--admin-text-muted)" }}>
              {availableRoles.find((r) => r.name === user.role)?.label ??
                user.role}
            </strong>{" "}
            →{" "}
            <strong style={{ color: currentRoleData?.color }}>
              {currentRoleData?.label ?? selected}
            </strong>
          </p>
          <button
            onClick={handleSave}
            disabled={pending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-white transition-colors disabled:opacity-50"
            style={{ background: "var(--admin-accent)" }}>
            {pending ? (
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : saved ? (
              <Check size={12} />
            ) : null}
            {saved ? "Saved" : "Apply role"}
          </button>
        </div>
      )}
    </div>
  );
}
