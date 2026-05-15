import {
  AdminParentHeader,
  type ParentHeaderGuide,
} from "@/app/(admin)/admin/_components/admin-parent-header";
import { getSectionTabs } from "@/lib/admin-section-tabs";
import { requireAdminSectionPage } from "@/lib/rbac/guards";
import { getTranslations } from "next-intl/server";
import { SessionsAdminGuide } from "./sessions/_components/sessions-guide";

export default async function AccessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminSectionPage("admin:access");

  const [tNav, tUsers, tStaff, tRoles, tPerms, tSessions] = await Promise.all([
    getTranslations("admin.nav"),
    getTranslations("admin.access.users"),
    getTranslations("admin.access.staff"),
    getTranslations("admin.access.roles"),
    getTranslations("admin.access.permissions"),
    getTranslations("admin.access.sessions"),
  ]);

  const tabs = await getSectionTabs("users-group", (k) => tNav(k));

  const descriptions: Record<string, string> = {
    users: tUsers("pageSubtitle"),
    staff: tStaff("pageSubtitle"),
    roles: tRoles("pageSubtitle"),
    permissions: tPerms("pageSubtitle"),
    sessions: tSessions("pageSubtitle"),
  };

  const iconBySegment: Record<string, string> = {
    users: "Users",
    staff: "UserCog",
    roles: "ShieldCheck",
    permissions: "KeyRound",
    sessions: "Activity",
  };

  const guides: Partial<Record<string, ParentHeaderGuide>> = {
    sessions: {
      title: tSessions("guideTitle"),
      ariaLabel: tSessions("guideAriaLabel"),
      content: <SessionsAdminGuide />,
    },
  };

  return (
    <div className="space-y-5">
      <AdminParentHeader
        title={tNav("users-group")}
        defaultDescription={tNav("descriptions.users-group")}
        defaultIcon="Users"
        iconBySegment={iconBySegment}
        descriptions={descriptions}
        guides={guides}
        tabs={tabs}
      />
      {children}
    </div>
  );
}
