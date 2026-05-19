import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import { REGISTERED_TEMPLATE_SLUGS } from "@/app/(cms)/_templates/registered-slugs";
import { getAllTemplates, getTemplateById } from "@/lib/db/template-queries";
import { PanelTop } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import TemplateFormClient from "../_components/template-form-client";
import { saveTemplateAction } from "../actions";

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
    <div className="max-w-4xl">
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
