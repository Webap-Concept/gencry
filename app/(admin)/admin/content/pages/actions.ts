"use server";

import { getAdminPath } from "@/lib/admin-nav";
import { logContentActivity } from "@/lib/db/content-activity";
import {
  deletePageCascade,
  getPageBySlug,
  invalidateNavigablePagesCache,
  togglePageStatus,
  upsertPage,
} from "@/lib/db/pages-queries";
import { getUser } from "@/lib/db/queries";
import { upsertRedirect } from "@/lib/db/redirects-queries";
import { ActivityType } from "@/lib/db/schema";
import { deleteSeoPage, getSeoPage, renameSeoPage } from "@/lib/db/seo-queries";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const schema = z.object({
  id: z.string().optional(),
  originalSlug: z.string().optional(),
  slug: z
    .string()
    .min(1, "Lo slug è obbligatorio")
    .max(255)
    .regex(/^[a-z0-9]+(?:[/-][a-z0-9]+)*$/, {
      message:
        "Slug non valido: usa solo lettere minuscole, numeri, trattini e slash",
    }),
  title: z.string().min(1, "Il titolo è obbligatorio").max(255),
  content: z.string().default(""),
  status: z.enum(["draft", "published"]).default("draft"),
  visibility: z.enum(["public", "private"]).default("public"),
  publishedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  parentId: z.string().optional(),
  templateId: z.string().optional(),
  customFields: z.string().optional(),
  pageType: z.string().optional(),
  sortOrder: z.string().optional(),
  // Necessario per il versioning automatico delle pagine di sistema
  isSystem: z.string().optional(),
});

export async function upsertPageAction(
  _: unknown,
  formData: FormData,
): Promise<{
  error?: string;
  success?: boolean;
  savedAt?: string;
  createdId?: number;
}> {
  const raw = {
    id: formData.get("id") || undefined,
    originalSlug: formData.get("originalSlug") || undefined,
    slug: formData.get("slug"),
    title: formData.get("title"),
    content: formData.get("content") ?? "",
    status: formData.get("status") ?? "draft",
    visibility: formData.get("visibility") ?? "public",
    publishedAt: formData.get("publishedAt") || undefined,
    expiresAt: formData.get("expiresAt") || undefined,
    parentId: formData.get("parentId") || undefined,
    templateId: formData.get("templateId") || undefined,
    customFields: formData.get("customFields") || undefined,
    pageType: formData.get("pageType") || undefined,
    sortOrder: formData.get("sortOrder") || undefined,
    isSystem: formData.get("isSystem") || undefined,
  };

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi" };
  }

  const {
    id,
    originalSlug,
    publishedAt,
    expiresAt,
    parentId,
    templateId,
    customFields,
    pageType,
    sortOrder,
    isSystem,
    ...data
  } = parsed.data;
  const isCreating = !id;

  let resolvedPublishedAt: Date | null = null;
  if (data.status === "published") {
    resolvedPublishedAt = publishedAt ? new Date(publishedAt) : new Date();
  } else if (publishedAt) {
    resolvedPublishedAt = new Date(publishedAt);
  }

  const resolvedExpiresAt = expiresAt ? new Date(expiresAt) : null;

  let parsedCustomFields: Record<string, unknown> = {};
  if (customFields) {
    try {
      parsedCustomFields = JSON.parse(customFields);
    } catch {
      /* noop */
    }
  }

  const slugChanged = originalSlug && originalSlug !== data.slug;

  try {
    const savedId = await upsertPage({
      ...(id ? { id: Number(id) } : {}),
      ...data,
      publishedAt: resolvedPublishedAt,
      expiresAt: resolvedExpiresAt,
      parentId: parentId ? Number(parentId) : null,
      templateId: templateId ? Number(templateId) : null,
      customFields: JSON.stringify(parsedCustomFields),
      pageType: pageType ?? "page",
      sortOrder: sortOrder ? Number(sortOrder) : 0,
      // Passa isSystem a upsertPage così il versioning automatico funziona
      isSystem: isSystem === "1" || isSystem === "true",
    });

    if (slugChanged) {
      const existingSeo = await getSeoPage(`/${originalSlug}`);
      if (existingSeo) {
        await renameSeoPage(`/${originalSlug}`, {
          ...existingSeo,
          pathname: `/${data.slug}`,
          label: data.title,
          updatedAt: new Date(),
        });
      }

      await upsertRedirect({
        fromPath: `/${originalSlug}`,
        toPath: `/${data.slug}`,
        statusCode: 301,
      });
    }

    revalidatePath(getAdminPath("content-pages"));
    revalidatePath(`/${data.slug}`);
    if (slugChanged) {
      revalidatePath(`/${originalSlug}`);
      revalidatePath(getAdminPath("seo-meta"));
      revalidatePath(getAdminPath("seo-redirects"));
    }

    // Cache del proxy: invalida la lista navigable, altrimenti per
    // ~60s il proxy può ancora vedere lo slug vecchio o la visibility
    // precedente. Importante quando si cambia status (draft↔published)
    // o visibility (public↔private).
    invalidateNavigablePagesCache();

    // ── Activity log ──────────────────────────────────────────────────────────
    const user = await getUser();
    const uid = user?.id ?? null;
    const detail = `slug: /${data.slug} | titolo: ${data.title}`;

    if (isCreating) {
      await logContentActivity(ActivityType.PAGE_CREATED, detail, uid);
    } else {
      if (data.status === "published") {
        await logContentActivity(ActivityType.PAGE_PUBLISHED, detail, uid);
      }
      await logContentActivity(ActivityType.PAGE_UPDATED, detail, uid);
    }
    // ─────────────────────────────────────────────────────────────────────────

    return {
      success: true,
      savedAt: new Date().toISOString(),
      ...(isCreating ? { createdId: savedId } : {}),
    };
  } catch (err) {
    console.error("[upsertPageAction] error:", err);
    return { error: "Errore nel salvataggio. Riprova." };
  }
}

export async function deletePageAction(
  slug: string,
): Promise<{ error?: string; success?: boolean; deleted?: number }> {
  if (!slug) return { error: "Slug mancante" };
  try {
    const deleted = await deletePageCascade(slug);
    await deleteSeoPage(`/${slug}`);

    revalidatePath(getAdminPath("content-pages"));
    revalidatePath(`/${slug}`);
    revalidatePath(getAdminPath("seo-meta"));
    invalidateNavigablePagesCache();

    const user = await getUser();
    await logContentActivity(
      ActivityType.PAGE_DELETED,
      `slug: /${slug}`,
      user?.id ?? null,
    );

    return { success: true, deleted };
  } catch (err) {
    // Guard: pagina di sistema non eliminabile
    if (err instanceof Error && err.message === "SYSTEM_PAGE_PROTECTED") {
      return { error: "Le pagine di sistema non possono essere eliminate." };
    }
    console.error("[deletePageAction] error:", err);
    return { error: "Errore nell'eliminazione. Riprova." };
  }
}

export async function getPageForEditAction(slug: string) {
  return getPageBySlug(slug);
}

export async function togglePageStatusAction(
  id: number,
  currentStatus: string,
): Promise<{ error?: string; success?: boolean }> {
  try {
    await togglePageStatus(id, currentStatus);
    revalidatePath(getAdminPath("content-pages"));
    invalidateNavigablePagesCache();

    const user = await getUser();
    const nextStatus = currentStatus === "published" ? "draft" : "published";
    const actType =
      nextStatus === "published"
        ? ActivityType.PAGE_PUBLISHED
        : ActivityType.PAGE_UNPUBLISHED;
    await logContentActivity(
      actType,
      `id: ${id} | nuovo stato: ${nextStatus}`,
      user?.id ?? null,
    );
  } catch (err) {
    console.error("[togglePageStatusAction] error:", err);
    return { error: "Errore nel cambio stato. Riprova." };
  }
  return { success: true };
}
