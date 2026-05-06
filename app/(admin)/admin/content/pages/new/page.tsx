import { getAllPages } from "@/lib/db/pages-queries";
import { getAllTemplates } from "@/lib/db/template-queries";
import { getAppSettings } from "@/lib/db/settings-queries";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import PageEditor from "../_components/page-editor";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.content.pages");
  return { title: t("metaTitleNew") };
}

export default async function NewPagePage({
  searchParams,
}: {
  searchParams: Promise<{ parentId?: string; templateId?: string; templateLocked?: string }>;
}) {
  const [pages, templates, settings, params] = await Promise.all([
    getAllPages(),
    getAllTemplates(),
    getAppSettings(),
    searchParams,
  ]);

  const initialParentId = params.parentId ? Number(params.parentId) : null;

  // templateId passato via URL (da regola allowedChildTemplateIds)
  const initialTemplateId = params.templateId ? Number(params.templateId) : null;
  // templateLocked=1 significa che il template è imposto dalla regola del padre e non può essere cambiato
  const templateLocked = params.templateLocked === "1";

  return (
    <div className="p-6 max-w-4xl">
      <PageEditor
        pages={pages}
        templates={templates}
        domain={settings?.app_domain ?? ""}
        appName={settings?.app_name ?? ""}
        initialParentId={initialParentId}
        initialTemplateId={initialTemplateId}
        templateLocked={templateLocked}
      />
    </div>
  );
}
