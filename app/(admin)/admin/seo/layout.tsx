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

  const [tNav, tRobots, tSitemap, tRedirect] = await Promise.all([
    getTranslations("admin.nav"),
    getTranslations("admin.seo.robots"),
    getTranslations("admin.seo.sitemap"),
    getTranslations("admin.seo.redirect"),
  ]);

  const tabs = await getSectionTabs("seo-group", (k) => tNav(k));

  const descriptions: Record<string, string> = {
    robots: tRobots("pageSubtitle"),
    sitemap: tSitemap("pageSubtitle"),
    redirect: tRedirect("pageSubtitle"),
  };

  const iconBySegment: Record<string, string> = {
    robots: "Globe",
    sitemap: "Map",
    redirect: "GitMerge",
  };

  return (
    <div className="space-y-5">
      <AdminParentHeader
        title={tNav("seo-group")}
        defaultDescription={tNav("descriptions.seo-group")}
        defaultIcon="Search"
        iconBySegment={iconBySegment}
        descriptions={descriptions}
        tabs={tabs}
      />
      {children}
    </div>
  );
}
