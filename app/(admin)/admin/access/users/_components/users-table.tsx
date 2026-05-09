"use client";

import { useAdminSlug } from "@/app/(admin)/admin/_components/admin-slug-context";
import { getAdminRelPath } from "@/lib/admin-nav";
import { buildAdminPathFromSlug } from "@/lib/admin-paths-shared";
import type { AdminUsersStatus } from "@/lib/db/admin-queries";
import type { AdminUser } from "@/lib/db/admin-queries";
import { ShieldBan, ShieldCheck, Undo2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useState, useTransition } from "react";
import ConfirmModal from "@/app/(admin)/admin/_components/confirm-modal";
import { cancelUserDeletion, unbanUser } from "../actions";
import BanModal from "./ban-modal";

const ACCOUNT_DELETION_GRACE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Colored role badge — the color is passed from the server via roleColor */
function RoleBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{
        background: color + "18",
        color: color,
        border: `1px solid ${color}40`,
      }}>
      {label}
    </span>
  );
}

function PlanBadge({ status }: { status: string | null }) {
  const t = useTranslations("admin.access.users.table");
  const isPremium = status === "active";
  return (
    <span
      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
        isPremium
          ? "bg-orange-100 text-orange-700"
          : "bg-gray-100 text-gray-500"
      }`}>
      {isPremium ? t("planPremium") : t("planFree")}
    </span>
  );
}

/**
 * Mostra i giorni residui prima del purge fisico (deletedAt + 30gg).
 * Color-coded: rosso ultimo giorno, ambra <= 7gg, grigio altrimenti.
 * `Expired` quando la grace e' gia' passata (in attesa del cron purge).
 */
function DaysLeftBadge({ deletedAt }: { deletedAt: Date }) {
  const t = useTranslations("admin.access.users.table");
  const purgeAt =
    new Date(deletedAt).getTime() + ACCOUNT_DELETION_GRACE_DAYS * DAY_MS;
  const msLeft = purgeAt - Date.now();

  if (msLeft <= 0) {
    return (
      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">
        {t("daysExpired")}
      </span>
    );
  }

  const days = Math.max(1, Math.ceil(msLeft / DAY_MS));
  const tone =
    days <= 1
      ? "bg-red-100 text-red-700"
      : days <= 7
        ? "bg-amber-100 text-amber-700"
        : "bg-gray-100 text-gray-600";

  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${tone}`}>
      {t("daysLeft", { days })}
    </span>
  );
}

function UserRow({
  user,
  status,
}: {
  user: AdminUser;
  status: AdminUsersStatus;
}) {
  const t = useTranslations("admin.access.users.table");
  const adminSlug = useAdminSlug();
  const usersBase = buildAdminPathFromSlug(adminSlug, getAdminRelPath("users-list"));
  const locale = useLocale();
  const dateLocale = locale === "en" ? "en-US" : "it-IT";
  const [pending, startTransition] = useTransition();
  const [showBanModal, setShowBanModal] = useState(false);
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false);
  const isBanned = !!user.bannedAt;
  const isDeleted = !!user.deletedAt;
  const showDeletionColumns = status === "deletion_requested";
  const initials =
    [user.firstName, user.lastName]
      .filter(Boolean)
      .map((n) => n![0].toUpperCase())
      .join("") || user.email[0].toUpperCase();

  function handleCancelDeletion() {
    setConfirmRestoreOpen(true);
  }

  function doCancelDeletion() {
    setConfirmRestoreOpen(false);
    startTransition(() => cancelUserDeletion(user.id));
  }

  return (
    <tr
      className={`transition-colors ${
        !showDeletionColumns && (isBanned || isDeleted) ? "opacity-50" : ""
      }`}
      style={{ borderBottom: "1px solid var(--admin-divider)" }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = "var(--admin-hover-bg)")
      }
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Link
            href={`${usersBase}/${user.id}`}
            className="shrink-0">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.username ?? user.email}
                className="w-12 h-12 rounded-full object-cover hover:opacity-80 transition-opacity"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-white text-xs font-bold hover:opacity-80 transition-opacity"
                style={{ background: user.roleColor ?? "var(--admin-accent)" }}>
                {initials}
              </div>
            )}
          </Link>
          <div>
            <Link
              href={`${usersBase}/${user.id}`}
              className="text-sm font-medium transition-colors leading-none admin-user-link"
              style={{ color: "var(--admin-accent)" }}>
              {user.username ? `@${user.username}` : user.email}
            </Link>
            <p
              className="text-xs mt-0.5"
              style={{ color: "var(--admin-text-faint)" }}>
              {user.email}
            </p>
          </div>
        </div>
      </td>

      {/* Role */}
      <td className="px-4 py-3">
        <RoleBadge
          label={user.roleLabel ?? user.role}
          color={user.roleColor ?? "#6b7280"}
        />
      </td>

      {/* Plan */}
      <td className="px-4 py-3">
        <PlanBadge status={user.subscriptionStatus} />
      </td>

      {/* Verified Email — hidden when filtering deletion_requested to make
          room for the deletion-specific columns. */}
      {!showDeletionColumns && (
        <td className="px-4 py-3 hidden lg:table-cell">
          <span
            className={`text-[11px] font-medium ${
              user.emailVerified ? "text-emerald-600" : ""
            }`}
            style={
              !user.emailVerified ? { color: "var(--admin-text-faint)" } : {}
            }>
            {user.emailVerified ? t("verifiedYes") : t("verifiedNo")}
          </span>
        </td>
      )}

      {/* Join Date — same: hidden in deletion view to free a column. */}
      {!showDeletionColumns && (
        <td className="px-4 py-3 hidden lg:table-cell">
          <span className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
            {new Date(user.createdAt).toLocaleDateString(dateLocale)}
          </span>
        </td>
      )}

      {/* Deletion-specific columns */}
      {showDeletionColumns && (
        <>
          <td className="px-4 py-3 hidden lg:table-cell">
            <span
              className="text-xs"
              style={{ color: "var(--admin-text-faint)" }}>
              {user.deletedAt
                ? new Date(user.deletedAt).toLocaleDateString(dateLocale)
                : "—"}
            </span>
          </td>
          <td className="px-4 py-3 hidden lg:table-cell">
            {user.deletedAt ? (
              <DaysLeftBadge deletedAt={user.deletedAt} />
            ) : (
              <span
                className="text-xs"
                style={{ color: "var(--admin-text-faint)" }}>
                —
              </span>
            )}
          </td>
        </>
      )}

      {/* Actions */}
      <td className="px-4 py-3">
        {user.isAdmin ? (
          <span
            className="text-xs italic"
            style={{ color: "var(--admin-text-faint)" }}>
            —
          </span>
        ) : isDeleted ? (
          <button
            disabled={pending}
            onClick={handleCancelDeletion}
            className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50 bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
            <Undo2 size={13} /> {t("actionCancelDeletion")}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            {/* Ban / Unban */}
            {isBanned ? (
              <div className="flex items-center gap-2">
                {user.bannedReason && (
                  <div className="relative group">
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 hidden group-hover:block w-max max-w-[220px]">
                      <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg">
                        {user.bannedReason}
                      </div>
                      <div className="w-2 h-2 bg-gray-900 rotate-45 mx-auto -mt-1" />
                    </div>
                    <span className="text-[11px] font-medium text-red-500 bg-red-50 px-2 py-0.5 rounded-full cursor-help">
                      {t("bannedReasonBadge")}
                    </span>
                  </div>
                )}
                <button
                  disabled={pending}
                  onClick={() => startTransition(() => unbanUser(user.id))}
                  className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50 bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
                  <ShieldCheck size={13} /> {t("actionReactivate")}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowBanModal(true)}
                className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors bg-red-50 text-red-600 hover:bg-red-100">
                <ShieldBan size={13} /> {t("actionBan")}
              </button>
            )}
          </div>
        )}

        {showBanModal && (
          <BanModal
            userId={user.id}
            userName={initials}
            onClose={() => setShowBanModal(false)}
          />
        )}

        <ConfirmModal
          open={confirmRestoreOpen}
          title={t("restoreModalTitle")}
          message={t.rich("restoreModalMessage", {
            email: user.email,
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
          variant="warning"
          confirmLabel={t("restoreModalConfirm")}
          loading={pending}
          onConfirm={doCancelDeletion}
          onCancel={() => setConfirmRestoreOpen(false)}
        />
      </td>
    </tr>
  );
}

export default function UsersTable({
  users,
  status = "active",
}: {
  users: AdminUser[];
  status?: AdminUsersStatus;
}) {
  const t = useTranslations("admin.access.users.table");
  if (users.length === 0) {
    return (
      <div
        className="text-center py-16 text-sm"
        style={{ color: "var(--admin-text-faint)" }}>
        {status === "deletion_requested"
          ? t("emptyDeletionRequested")
          : t("emptyDefault")}
      </div>
    );
  }

  const showDeletionColumns = status === "deletion_requested";
  const headers: { label: string; lgOnly: boolean }[] = [
    { label: t("headerUser"), lgOnly: false },
    { label: t("headerRole"), lgOnly: false },
    { label: t("headerPlan"), lgOnly: false },
    ...(showDeletionColumns
      ? [
          { label: t("headerRequestedAt"), lgOnly: true },
          { label: t("headerTimeLeft"), lgOnly: true },
        ]
      : [
          { label: t("headerEmail"), lgOnly: true },
          { label: t("headerJoinedOn"), lgOnly: true },
        ]),
    { label: t("headerActions"), lgOnly: false },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--admin-divider)" }}>
            {headers.map((h) => (
              <th
                key={h.label}
                className={`px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide ${
                  h.lgOnly ? "hidden lg:table-cell" : ""
                }`}
                style={{ color: "var(--admin-text-faint)" }}>
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <UserRow key={u.id} user={u} status={status} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
