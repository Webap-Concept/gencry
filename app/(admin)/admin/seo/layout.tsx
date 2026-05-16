import { AdminParentHeader } from "@/app/(admin)/admin/_components/admin-parent-header";
import { getSectionTabs } from "@/lib/admin-section-tabs";
import { requireAdminSectionPage } from "@/lib/rbac/guards";
import { getTranslations } from "next-intl/server";

export default async function SeoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminSectionPage("admin:seo");

  const tNav = await getTranslations("admin.nav");
  const tabs = await getSectionTabs("seo-group", (k) => tNav(k));

  return (
    <div className="space-y-5">
      <AdminParentHeader tabs={tabs} />
      {children}
    </div>
  );
}
