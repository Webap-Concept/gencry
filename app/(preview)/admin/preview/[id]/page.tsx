// app/(preview)/admin/preview/[id]/page.tsx
// Anteprima pagina CMS — accessibile solo agli admin.
// Vive nel route group (preview) isolato: niente sidebar/topbar admin.
// Il banner "Anteprima" è gestito da PreviewBar, non dai template.
import { notFound } from "next/navigation";
import { getPageById } from "@/lib/db/pages-queries";
import { db } from "@/lib/db/drizzle";
import { pageTemplates, templateFields } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { getDynamicTemplate } from "@/app/(frontend)/_templates/loader";
import { parseCustomFields } from "@/app/(frontend)/_templates/types";
import { requireAdminPage } from "@/lib/rbac/guards";
import { sanitizeRichTextHtml } from "@/lib/utils/sanitize-html";
import PreviewBar from "./_preview-bar";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PreviewPage({ params }: Props) {
  await requireAdminPage();

  const { id } = await params;
  const pageId = parseInt(id, 10);
  if (isNaN(pageId)) return notFound();

  const page = await getPageById(pageId);
  if (!page) return notFound();

  let template = null;
  if (page.templateId) {
    const [tpl] = await db
      .select()
      .from(pageTemplates)
      .where(eq(pageTemplates.id, page.templateId))
      .limit(1);
    if (tpl) {
      const fields = await db
        .select()
        .from(templateFields)
        .where(eq(templateFields.templateId, tpl.id))
        .orderBy(asc(templateFields.sortOrder));
      template = { ...tpl, fields };
    }
  }

  const templateSlug = template?.slug ?? "default";
  const TemplateComponent = await getDynamicTemplate(templateSlug);
  const fields = parseCustomFields(page.customFields);

  const safePage = { ...page, content: sanitizeRichTextHtml(page.content) };

  return (
    <>
      <PreviewBar
        pageId={pageId}
        pageTitle={page.title}
        pageStatus={page.status}
        pageSlug={page.slug}
      />
      <div style={{ paddingTop: "48px" }}>
        <TemplateComponent
          page={safePage}
          template={template}
          fields={fields}
        />
      </div>
    </>
  );
}
