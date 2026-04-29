import { db } from "@/lib/db/drizzle";
import {
  pageTemplates,
  templateFields,
  pages,
  type NewPageTemplate,
  type NewTemplateField,
  type PageTemplate,
  type TemplateField,
} from "@/lib/db/schema";
import { asc, eq, sql } from "drizzle-orm";

export type TemplateWithFields = PageTemplate & { fields: TemplateField[] };
export type TemplateWithCount = TemplateWithFields & { pageCount: number };

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export async function getAllTemplates(): Promise<TemplateWithFields[]> {
  const templates = await db
    .select()
    .from(pageTemplates)
    .orderBy(asc(pageTemplates.name));

  const allFields = await db
    .select()
    .from(templateFields)
    .orderBy(asc(templateFields.sortOrder));

  return templates.map((t) => ({
    ...t,
    fields: allFields.filter((f) => f.templateId === t.id),
  }));
}

/**
 * Come getAllTemplates ma include il conteggio delle pagine che usano ogni template.
 */
export async function getAllTemplatesWithPageCount(): Promise<TemplateWithCount[]> {
  const templates = await db
    .select()
    .from(pageTemplates)
    .orderBy(asc(pageTemplates.name));

  const allFields = await db
    .select()
    .from(templateFields)
    .orderBy(asc(templateFields.sortOrder));

  // Conta le pagine raggruppate per templateId
  const counts = await db
    .select({
      templateId: pages.templateId,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(pages)
    .groupBy(pages.templateId);

  const countMap = new Map(counts.map((c) => [c.templateId, c.count]));

  return templates.map((t) => ({
    ...t,
    fields: allFields.filter((f) => f.templateId === t.id),
    pageCount: countMap.get(t.id) ?? 0,
  }));
}

export async function getTemplateById(id: number): Promise<TemplateWithFields | undefined> {
  const [template] = await db
    .select()
    .from(pageTemplates)
    .where(eq(pageTemplates.id, id))
    .limit(1);
  if (!template) return undefined;

  const fields = await db
    .select()
    .from(templateFields)
    .where(eq(templateFields.templateId, id))
    .orderBy(asc(templateFields.sortOrder));

  return { ...template, fields };
}

export async function getTemplateBySlug(slug: string): Promise<TemplateWithFields | undefined> {
  const [template] = await db
    .select()
    .from(pageTemplates)
    .where(eq(pageTemplates.slug, slug))
    .limit(1);
  if (!template) return undefined;

  const fields = await db
    .select()
    .from(templateFields)
    .where(eq(templateFields.templateId, template.id))
    .orderBy(asc(templateFields.sortOrder));

  return { ...template, fields };
}

/**
 * Crea o aggiorna un template con i suoi campi.
 * Strategia: upsert template, poi elimina tutti i campi esistenti e li ricrea.
 *
 * @param id  - ID esistente per update, undefined per insert
 * @param data - dati del template (NewPageTemplate non include id)
 * @param fields - campi del template senza templateId
 */
export async function upsertTemplate(
  id: number | undefined,
  data: NewPageTemplate,
  fields: Omit<NewTemplateField, "templateId">[],
): Promise<PageTemplate> {
  let template: PageTemplate;

  if (id !== undefined) {
    await db
      .update(pageTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(pageTemplates.id, id));
    const [updated] = await db
      .select()
      .from(pageTemplates)
      .where(eq(pageTemplates.id, id))
      .limit(1);
    template = updated;
  } else {
    const [inserted] = await db
      .insert(pageTemplates)
      .values(data)
      .returning();
    template = inserted;
  }

  await db.delete(templateFields).where(eq(templateFields.templateId, template.id));

  if (fields.length > 0) {
    await db.insert(templateFields).values(
      fields.map((f, i) => ({
        ...f,
        templateId: template.id,
        sortOrder: f.sortOrder ?? i,
      })),
    );
  }

  return template;
}

export async function deleteTemplate(id: number): Promise<{ error?: string }> {
  const [tmpl] = await db
    .select()
    .from(pageTemplates)
    .where(eq(pageTemplates.id, id))
    .limit(1);

  if (!tmpl) return { error: "Template non trovato" };
  if (tmpl.isSystem) return { error: "I template di sistema non possono essere eliminati" };

  await db.delete(pageTemplates).where(eq(pageTemplates.id, id));
  return {};
}

export async function duplicateTemplate(id: number): Promise<PageTemplate | undefined> {
  const source = await getTemplateById(id);
  if (!source) return undefined;

  const newSlug = `${source.slug}-copia-${Date.now()}`;

  const [inserted] = await db
    .insert(pageTemplates)
    .values({
      name: `${source.name} (copia)`,
      slug: newSlug,
      description: source.description,
      rules: source.rules,
      thumbnail: source.thumbnail,
      isSystem: false,
    })
    .returning();

  if (source.fields.length > 0) {
    await db.insert(templateFields).values(
      source.fields.map((f) => ({
        templateId: inserted.id,
        fieldKey: f.fieldKey,
        fieldType: f.fieldType,
        label: f.label,
        placeholder: f.placeholder,
        required: f.required,
        defaultValue: f.defaultValue,
        options: f.options,
        sortOrder: f.sortOrder,
      })),
    );
  }

  return inserted;
}
