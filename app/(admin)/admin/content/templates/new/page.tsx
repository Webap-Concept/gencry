import { REGISTERED_TEMPLATE_SLUGS } from "@/app/(frontend)/_templates/registered-slugs";
import { getAllTemplates } from "@/lib/db/template-queries";
import TemplateFormClient from "../_components/template-form-client";
import { saveTemplateAction } from "../actions";

export const metadata = { title: "New template" };
export const dynamic = "force-dynamic";

export default async function NuovoTemplatePage() {
  const allTemplates = await getAllTemplates();
  return (
    <div className="p-4 sm:p-6 max-w-3xl">
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
