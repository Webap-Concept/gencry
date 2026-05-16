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

  const [tNav, tSessions] = await Promise.all([
    getTranslations("admin.nav"),
    getTranslations("admin.access.sessions"),
  ]);

  const tabs = await getSectionTabs("users-group", (k) => tNav(k));

  const guides: Partial<Record<string, ParentHeaderGuide>> = {
    sessions: {
      title: tSessions("guideTitle"),
      ariaLabel: tSessions("guideAriaLabel"),
      content: <SessionsAdminGuide />,
    },
  };

  return (
    <div className="space-y-5">
      <AdminParentHeader tabs={tabs} guides={guides} />
      {children}
    </div>
  );
}
