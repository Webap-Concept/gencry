import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { REGISTERED_TEMPLATE_SLUGS } from "@/app/(frontend)/_templates/registered-slugs";
import { getAllTemplates } from "@/lib/db/template-queries";
import { PanelTop } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import TemplateFormClient from "../_components/template-form-client";
import { saveTemplateAction } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.content.templates");
  return { title: t("metaTitleNew") };
}
export const dynamic = "force-dynamic";

export default async function NuovoTemplatePage() {
  const allTemplates = await getAllTemplates();
  const t = await getTranslations("admin.content.templates");
  return (
    <div className="p-4 sm:p-6 max-w-3xl">
      <AdminSectionHeader
        icon={PanelTop}
        breadcrumbLabel={t("breadcrumbContent")}
        title={t("pageTitle")}
      />
      <TemplateFormClient
        allTemplates={allTemplates.map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
        }))}
        registeredSlugs={Array.from(REGISTERED_TEMPLATE_SLUGS)}
        saveAction={saveTemplateAction}
      />
    </div>
  );
}
