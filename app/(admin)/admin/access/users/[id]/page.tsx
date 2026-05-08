import { getUserConsentRecords } from "@/lib/account/consent-queries";
import { getAdminPath } from "@/lib/admin-paths";
import { getMfaState } from "@/lib/auth/mfa/queries";
import { listAdminUserSessions } from "@/lib/db/admin-sessions-queries";
import { getAdminUserActivity, getAdminUserById } from "@/lib/db/admin-queries";
import { db } from "@/lib/db/drizzle";
import { getUser } from "@/lib/db/queries";
import { getAdminRoles } from "@/lib/db/roles-queries";
import { roles } from "@/lib/db/schema";
import { can } from "@/lib/rbac/can";
import {
  getAllPermissions,
  getPermissionsByRole,
  getUserPermissionOverrides,
  purgeExpiredOverrides,
} from "@/lib/rbac/permissions-queries";
import { eq } from "drizzle-orm";
import {
  Activity,
  ArrowLeft,
  Calendar,
  CreditCard,
  Lock,
  Mail,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActivityList } from "./_components/activity-list";
import { AdminMfaCard } from "./_components/admin-mfa-card";
import { UserAccessTab } from "./_components/user-access-tab";
import { UserConsentsTab } from "./_components/user-consents-tab";
import {
  BanButton,
  DeleteButton,
  RoleSelector,
} from "./_components/user-detail-client";
import { UserDetailTabs } from "./_components/user-detail-tabs";
import { UserSessionsTab } from "./_components/user-sessions-tab";

// UUID v4 regex
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function StatusBadge({
  user,
  t,
}: {
  user: Awaited<ReturnType<typeof getAdminUserById>>;
  t: Awaited<ReturnType<typeof getTranslations<"admin.access.users.detail">>>;
}) {
  if (!user) return null;
  if (user.bannedAt)
    return (
      <span className="px-2.5 py-1 text-xs font-semibold bg-red-100 text-red-700 rounded-full">
        {t("statusSuspended")}
      </span>
    );
  if (user.deletedAt)
    return (
      <span
        className="px-2.5 py-1 text-xs font-semibold rounded-full"
        style={{
          background: "var(--admin-hover-bg)",
          color: "var(--admin-text-muted)",
        }}>
        {t("statusDeleted")}
      </span>
    );
  return (
    <span className="px-2.5 py-1 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-full">
      {t("statusActive")}
    </span>
  );
}

async function UserContent({
  id,
  canDelete,
}: {
  id: string;
  canDelete: boolean;
}) {
  const t = await getTranslations("admin.access.users.detail");
  const locale = await getLocale();
  const dateLocale = locale === "en" ? "en-US" : "it-IT";

  const [
    user,
    activity,
    availableRoles,
    allPermissions,
    userSessions,
    consentRecords,
    mfaState,
  ] = await Promise.all([
    getAdminUserById(id),
    getAdminUserActivity(id),
    getAdminRoles(),
    getAllPermissions(),
    listAdminUserSessions(id),
    getUserConsentRecords(id),
    getMfaState(id),
  ]);

  if (!user) notFound();

  void purgeExpiredOverrides(id);

  const userRoleRow = await db
    .select()
    .from(roles)
    .where(eq(roles.name, user.role))
    .limit(1)
    .then((r) => r[0] ?? null);

  const [rolePerms, overrides] = await Promise.all([
    userRoleRow ? getPermissionsByRole(userRoleRow.id) : Promise.resolve([]),
    getUserPermissionOverrides(id),
  ]);

  const initials =
    [user.firstName, user.lastName]
      .filter(Boolean)
      .map((n) => n![0].toUpperCase())
      .join("") || user.email[0].toUpperCase();

  const isPremium = user.subscriptionStatus === "active";
  const isDeleted = !!user.deletedAt;

  const infoContent = (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div
        className="rounded-xl shadow-sm p-5"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}>
        <h4
          className="text-sm font-semibold mb-4"
          style={{ color: "var(--admin-text)" }}>
          {t("accountInfoHeading")}
        </h4>
        <div className="space-y-3">
          {[
            { icon: Mail, label: t("labelEmail"), value: user.email },
            {
              icon: Calendar,
              label: t("labelJoinedOn"),
              value: new Date(user.createdAt).toLocaleDateString(dateLocale, {
                day: "numeric",
                month: "long",
                year: "numeric",
              }),
            },
            {
              icon: CreditCard,
              label: t("labelPlan"),
              value: user.planName ?? t("planFree"),
            },
            {
              icon: isPremium ? ShieldCheck : ShieldX,
              label: t("labelStripe"),
              value: user.stripeCustomerId ?? t("stripeNotConnected"),
            },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center gap-3">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "var(--admin-hover-bg)" }}>
                <Icon size={13} style={{ color: "var(--admin-text-faint)" }} />
              </div>
              <div>
                <p
                  className="text-[11px]"
                  style={{ color: "var(--admin-text-faint)" }}>
                  {label}
                </p>
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--admin-text)" }}>
                  {value}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        className="rounded-xl shadow-sm p-5"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}>
        <div className="flex items-center justify-between mb-4">
          <h4
            className="text-sm font-semibold"
            style={{ color: "var(--admin-text)" }}>
            {t("roleHeading")}
          </h4>
          <Link
            href={await getAdminPath("users-roles")}
            className="text-xs transition-colors"
            style={{ color: "var(--admin-accent)" }}>
            {t("roleManageRoles")}
          </Link>
        </div>
        <RoleSelector
          user={user}
          availableRoles={availableRoles}
          isDeleted={isDeleted}
        />
      </div>

      <div className="lg:col-span-2">
        <AdminMfaCard
          userId={user.id}
          userEmail={user.email}
          mfa={mfaState}
          isDeleted={isDeleted}
        />
      </div>
    </div>
  );

  const activityContent = (
    <div
      className="rounded-xl shadow-sm p-5"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <div className="flex items-center gap-2 mb-4">
        <Activity size={15} style={{ color: "var(--admin-text-faint)" }} />
        <h4
          className="text-sm font-semibold"
          style={{ color: "var(--admin-text)" }}>
          {t("recentActivityHeading")}
        </h4>
      </div>
      <Suspense
        fallback={
          <p className="text-sm" style={{ color: "var(--admin-text-faint)" }}>
            {t("recentActivityLoading")}
          </p>
        }>
        <ActivityList activity={activity} />
      </Suspense>
    </div>
  );

  const accessContent = (
    <UserAccessTab
      userId={id}
      rolePerms={rolePerms}
      overrides={overrides}
      allPermissions={allPermissions}
      userRole={userRoleRow}
      isDeleted={isDeleted}
    />
  );

  const activeSessionsCount = userSessions.filter(
    (s) => s.status === "active",
  ).length;

  const sessionsContent = (
    <UserSessionsTab
      userId={id}
      sessions={userSessions}
      isDeleted={isDeleted}
    />
  );

  const consentsContent = <UserConsentsTab records={consentRecords} />;

  return (
    <div className="space-y-6">
      {/* User Header */}
      <div className="flex items-start gap-4">
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={`${user.firstName} ${user.lastName}`}
            className="w-14 h-14 rounded-full object-cover shrink-0"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold shrink-0 text-white"
            style={{ background: "var(--admin-accent)" }}>
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2
              className="text-xl font-bold"
              style={{ color: "var(--admin-text)" }}>
              {user.firstName && user.lastName
                ? `${user.firstName} ${user.lastName}`
                : user.email}
            </h2>
            <StatusBadge user={user} t={t} />
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            {user.username && (
              <span
                className="text-sm font-semibold"
                style={{ color: "var(--admin-accent)" }}>
                @{user.username}
              </span>
            )}
            {user.username && (
              <span style={{ color: "var(--admin-divider)" }}>·</span>
            )}
            <p className="text-sm" style={{ color: "var(--admin-text-muted)" }}>
              {user.email}
            </p>
            <span style={{ color: "var(--admin-divider)" }}>·</span>
            <p className="text-sm" style={{ color: "var(--admin-text-faint)" }}>
              ID {user.id}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <BanButton user={user} />
          <DeleteButton user={user} canDelete={canDelete} />
        </div>
      </div>

      {isDeleted && (
        <div
          className="rounded-xl px-4 py-3 flex items-center gap-3"
          style={{
            background: "color-mix(in srgb, #ef4444 7%, var(--admin-card-bg))",
            border: "1px solid color-mix(in srgb, #ef4444 25%, transparent)",
          }}>
          <Lock size={16} className="text-red-500 shrink-0" />
          <div className="text-xs leading-relaxed">
            <p className="font-semibold text-red-600">
              {t("deletedNoticeTitle")}
            </p>
            <p style={{ color: "var(--admin-text-muted)" }}>
              {t("deletedNoticeBody")}
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <UserDetailTabs
        infoContent={infoContent}
        activityContent={activityContent}
        accessContent={accessContent}
        sessionsContent={sessionsContent}
        consentsContent={consentsContent}
        overridesCount={overrides.length}
        activeSessionsCount={activeSessionsCount}
        consentsCount={consentRecords.length}
      />
    </div>
  );
}

export default async function AdminUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!UUID_REGEX.test(id)) notFound();

  const currentUser = await getUser();
  const canDelete = currentUser
    ? currentUser.isAdmin || (await can(currentUser, "users:delete"))
    : false;

  const t = await getTranslations("admin.access.users.detail");

  return (
    <div className="space-y-6">
      <Link
        href={await getAdminPath("users-list")}
        className="inline-flex items-center gap-1.5 text-sm transition-colors"
        style={{ color: "var(--admin-text-muted)" }}>
        <ArrowLeft size={14} />
        {t("backToUsers")}
      </Link>
      <Suspense
        fallback={
          <div className="animate-pulse space-y-4">
            <div
              className="h-14 rounded-2xl"
              style={{ background: "var(--admin-hover-bg)" }}
            />
            <div
              className="h-64 rounded-xl"
              style={{ background: "var(--admin-hover-bg)" }}
            />
          </div>
        }>
        <UserContent id={id} canDelete={canDelete} />
      </Suspense>
    </div>
  );
}
