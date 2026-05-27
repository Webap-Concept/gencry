"use client";

import {
  AdminDialog,
  AdminDialogCancelButton,
  AdminDialogConfirmButton,
  AdminDialogContent,
} from "@/app/(admin)/admin/_components/admin-dialog";
import type { AdminUserDetail } from "@/lib/db/admin-queries";
import type { RoleRow } from "@/lib/db/roles-queries";
import {
  Check,
  Eye,
  Shield,
  ShieldBan,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { setUserRole } from "../../../roles/actions";
import BanModal from "../../_components/ban-modal";
import DeleteModal from "../../_components/delete-modal";
import { adminStartImpersonation, unbanUser } from "../../actions";

// ─── BanButton ────────────────────────────────────────────────────────
export function BanButton({ user }: { user: AdminUserDetail }) {
  const t = useTranslations("admin.access.users.detail");
  const [showModal, setShowModal] = useState(false);
  const [pending, startTransition] = useTransition();
  const isBanned = !!user.bannedAt;
  const isDeleted = !!user.deletedAt;
  const userName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

  if (user.isAdmin) {
    return (
      <span className="text-xs text-gray-400 italic">
        {t("buttonAdminsCannotSuspend")}
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
          <ShieldCheck size={15} /> {t("buttonReactivate")}
        </button>
      ) : (
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors">
          <ShieldBan size={15} /> {t("buttonSuspend")}
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

// ─── ImpersonateButton ─────────────────────────────────────────────────
// Permette a un admin con `users:impersonate` di "entrare" come l'utente
// target. Apre conferma esplicita (AdminDialog) prima dello swap.
// L'azione e' destructive sulla session admin (cookie swap), quindi
// modale obbligatoria. La server action ridireziona a `/` (front).
export function ImpersonateButton({
  user,
  canImpersonate,
}: {
  user: AdminUserDetail;
  canImpersonate: boolean;
}) {
  const [showModal, setShowModal] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Anti-escalation: non si impersona un admin / utente cancellato.
  if (!canImpersonate || user.isAdmin || !!user.deletedAt) return null;

  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.username ||
    user.email;

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      // Server action fa redirect("/") in caso di successo: questo
      // catch entra solo se ok=false (target non valido, permission).
      const res = await adminStartImpersonation(user.id);
      if (!res.ok) {
        setError(res.error);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        title="Entra nel front come questo utente (audit log)"
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors"
        style={{
          background: "var(--admin-hover-bg)",
          color: "var(--admin-text)",
        }}>
        <Eye size={15} />
        Impersona
      </button>
      <AdminDialog
        open={showModal}
        onOpenChange={(o) => {
          if (!o && !pending) {
            setShowModal(false);
            setError(null);
          }
        }}>
        <AdminDialogContent
          icon={Eye}
          size="md"
          title={`Impersonare ${displayName}?`}
          description="Entrerai nel front utente come questa persona. La tua sessione admin resta sospesa (puoi tornare con il banner top). Durata massima: 30 minuti."
          footer={
            <>
              <AdminDialogCancelButton
                onClick={() => {
                  setShowModal(false);
                  setError(null);
                }}
                disabled={pending}>
                Annulla
              </AdminDialogCancelButton>
              <AdminDialogConfirmButton
                onClick={handleConfirm}
                loading={pending}>
                {pending ? "Avvio…" : "Impersona"}
              </AdminDialogConfirmButton>
            </>
          }>
          <div
            className="space-y-2 text-sm"
            style={{ color: "var(--admin-text-muted)" }}>
            <p>L&apos;azione viene loggata in audit (admin che ha avviato + timestamp). L&apos;utente target <strong>non</strong> riceve notifica.</p>
            {error ? (
              <p style={{ color: "var(--gc-neg, #dc2626)" }}>
                Errore: {error}
              </p>
            ) : null}
          </div>
        </AdminDialogContent>
      </AdminDialog>
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
  const t = useTranslations("admin.access.users.detail");
  const [showModal, setShowModal] = useState(false);

  // Don't show anything if: no permission, already deleted, or is admin
  if (!canDelete || !!user.deletedAt || user.isAdmin) return null;

  const fullName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        title={t("buttonDeleteAria")}
        aria-label={t("buttonDeleteAria")}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors"
        style={{
          background: "var(--admin-hover-bg)",
          color: "var(--color-error, #a12c7b)",
        }}>
        <Trash2 size={15} />
        {t("buttonDelete")}
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
  const t = useTranslations("admin.access.users.detail");
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
                      {t("roleAdminBadge")}
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
            {t.rich("roleChangingFrom", {
              fromLabel:
                availableRoles.find((r) => r.name === user.role)?.label ??
                user.role,
              toLabel: currentRoleData?.label ?? selected,
              from: (chunks) => (
                <strong style={{ color: "var(--admin-text-muted)" }}>
                  {chunks}
                </strong>
              ),
              to: (chunks) => (
                <strong style={{ color: currentRoleData?.color }}>
                  {chunks}
                </strong>
              ),
            })}
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
            {saved ? t("roleSaved") : t("roleApply")}
          </button>
        </div>
      )}
    </div>
  );
}
