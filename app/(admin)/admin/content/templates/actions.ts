"use server";

import { getAdminPath } from "@/lib/admin-paths";
import { logContentActivity } from "@/lib/db/content-activity";
import { getUser } from "@/lib/db/queries";
import type { NewPageTemplate, NewTemplateField } from "@/lib/db/schema";
import { ActivityType } from "@/lib/db/schema";
import {
  deleteTemplate,
  duplicateTemplate,
  upsertTemplate,
} from "@/lib/db/template-queries";
import { slugify } from "@/lib/utils/slugify";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function saveTemplateAction(formData: FormData) {
  const id = formData.get("id") ? Number(formData.get("id")) : undefined;
  const name = (formData.get("name") as string).trim();
  const rawSlug = (formData.get("slug") as string).trim();
  const slug = slugify(rawSlug);
  const description =
    (formData.get("description") as string | null)?.trim() || null;
  const isCreating = !id;

  let allowedChildTemplateIds: number[] = [];
  const allowedJson = formData.get("allowedChildTemplateIdsJson") as
    | string
    | null;
  if (allowedJson) {
    try {
      const parsed = JSON.parse(allowedJson);
      if (Array.isArray(parsed))
        allowedChildTemplateIds = parsed.map(Number).filter(Boolean);
    } catch {
      /* noop */
    }
  }

  const rules = { allowedChildTemplateIds };

  const fieldsJson = formData.get("fieldsJson") as string | null;
  let fields: Omit<NewTemplateField, "templateId">[] = [];
  if (fieldsJson) {
    try {
      fields = JSON.parse(fieldsJson);
    } catch {
      // JSON non valido — procedi senza campi
    }
  }

  // id è passato separatamente; templateData non include più id
  const templateData: NewPageTemplate = {
    name,
    slug,
    description,
    rules: JSON.stringify(rules),
  };

  await upsertTemplate(id, templateData, fields);

  const user = await getUser();
  const detail = `slug: ${slug} | nome: ${name}`;
  await logContentActivity(
    isCreating ? ActivityType.TEMPLATE_CREATED : ActivityType.TEMPLATE_UPDATED,
    detail,
    user?.id ?? null,
  );

  revalidatePath(await getAdminPath("content-templates"));
  redirect(await getAdminPath("content-templates"));
}

export async function deleteTemplateAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;
  const result = await deleteTemplate(id);
  if (!result.error) {
    revalidatePath(await getAdminPath("content-templates"));
    const user = await getUser();
    await logContentActivity(
      ActivityType.TEMPLATE_DELETED,
      `id: ${id}`,
      user?.id ?? null,
    );
  }
}

export async function duplicateTemplateAction(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;
  await duplicateTemplate(id);
  revalidatePath(await getAdminPath("content-templates"));
  const user = await getUser();
  await logContentActivity(
    ActivityType.TEMPLATE_CREATED,
    `duplicated from id: ${id}`,
    user?.id ?? null,
  );
}
