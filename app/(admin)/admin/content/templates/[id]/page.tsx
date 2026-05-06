import { notFound } from "next/navigation";
import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { REGISTERED_TEMPLATE_SLUGS } from "@/app/(frontend)/_templates/registered-slugs";
import { getTemplateById, getAllTemplates } from "@/lib/db/template-queries";
import { PanelTop } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { saveTemplateAction } from "../actions";
import TemplateFormClient from "../_components/template-form-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.content.templates");
  return { title: t("metaTitleEdit") };
}
export const dynamic = "force-dynamic";

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [template, allTemplates] = await Promise.all([
    getTemplateById(Number(id)),
    getAllTemplates(),
  ]);
  if (!template) notFound();

  let rules: Record<string, unknown> = {};
  try {
    rules = JSON.parse(template.rules ?? "{}");
  } catch {
    // noop
  }

  const t = await getTranslations("admin.content.templates");

  return (
    <div className="p-4 sm:p-6 max-w-3xl">
      <AdminSectionHeader
        icon={PanelTop}
        breadcrumbLabel={t("breadcrumbContent")}
        title={t("pageTitle")}
      />
      <TemplateFormClient
        template={{
          id: template.id,
          name: template.name,
          slug: template.slug,
          description: template.description ?? "",
          rules,
          fields: template.fields,
          isSystem: template.isSystem,
        }}
        allTemplates={allTemplates.map((t) => ({ id: t.id, name: t.name, slug: t.slug }))}
        registeredSlugs={Array.from(REGISTERED_TEMPLATE_SLUGS)}
        saveAction={saveTemplateAction}
      />
    </div>
  );
}
