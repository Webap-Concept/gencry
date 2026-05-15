// Parent layout per /admin/content/*. Espone il pattern "tab" unificato
// del core (vedi project_admin_section_headers): titolo costante (Contenuti)
// + descrizione/icona/guida per route segment + barra di tab.
import {
  AdminParentHeader,
  type ParentHeaderGuide,
} from "@/app/(admin)/admin/_components/admin-parent-header";
import { getSectionTabs } from "@/lib/admin-section-tabs";
import { requireAdminSectionPage } from "@/lib/rbac/guards";
import { getTranslations } from "next-intl/server";
import { MediaAdminGuide } from "./media/_components/media-admin-guide";
import { PagesAdminGuide } from "./pages/_components/pages-admin-guide";
import { StylesAdminGuide } from "./styles/_components/styles-admin-guide";

export default async function ContentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminSectionPage("admin:content");

  const [tNav, tPages, tTemplates, tMedia, tStyles] = await Promise.all([
    getTranslations("admin.nav"),
    getTranslations("admin.content.pages"),
    getTranslations("admin.content.templates"),
    getTranslations("admin.content.media"),
    getTranslations("admin.content.styles"),
  ]);

  const tabs = await getSectionTabs("content-group", (k) => tNav(k));

  const descriptions: Record<string, string> = {
    pages: tPages("pageSubtitle"),
    templates: tTemplates("pageSubtitle"),
    media: tMedia("pageSubtitle"),
    styles: tStyles("pageSubtitle"),
  };

  const iconBySegment: Record<string, string> = {
    pages: "FileText",
    templates: "PanelTop",
    media: "Image",
    styles: "Palette",
  };

  const guides: Partial<Record<string, ParentHeaderGuide>> = {
    pages: {
      title: tPages("guideTitle"),
      ariaLabel: tPages("guideAriaLabel"),
      content: <PagesAdminGuide />,
    },
    media: {
      title: tMedia("guideTitle"),
      ariaLabel: tMedia("guideAriaLabel"),
      content: <MediaAdminGuide />,
    },
    styles: {
      title: tStyles("guideTitle"),
      ariaLabel: tStyles("guideAriaLabel"),
      content: <StylesAdminGuide />,
    },
  };

  return (
    <div className="space-y-5">
      <AdminParentHeader
        title={tNav("content-group")}
        defaultDescription={tNav("descriptions.content-group")}
        defaultIcon="Layers"
        iconBySegment={iconBySegment}
        descriptions={descriptions}
        guides={guides}
        tabs={tabs}
      />
      {children}
    </div>
  );
}
