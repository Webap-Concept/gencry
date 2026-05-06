"use server";

import { getAdminPath } from "@/lib/admin-nav";
import { logContentActivity } from "@/lib/db/content-activity";
import {
  deletePageCascade,
  getPageBySlug,
  getPageTranslationsForPage,
  invalidateNavigablePagesCache,
  togglePageStatus,
  upsertPage,
  upsertPageTranslation,
} from "@/lib/db/pages-queries";
import { getUser } from "@/lib/db/queries";
import { createAutoSlugRedirect } from "@/lib/db/redirects-queries";
import { ActivityType } from "@/lib/db/schema";
import {
  deleteSeoPage,
  getSeoPage,
  renameSeoPage,
  upsertSeoPage,
  upsertSeoPageTranslation,
} from "@/lib/db/seo-queries";
import { DEFAULT_LOCALE, LOCALES } from "@/lib/i18n/config";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const schema = z.object({
  id: z.string().optional(),
  originalSlug: z.string().optional(),
  slug: z
    .string()
    .min(1, "slugRequired")
    .max(255)
    .regex(/^[a-z0-9]+(?:[/-][a-z0-9]+)*$/, { message: "slugInvalid" }),
  title: z.string().min(1, "titleRequired").max(255),
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

  const tErrors = await getTranslations("admin.content.pages.errors");
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "invalidData";
    if (
      msg === "slugRequired" ||
      msg === "slugInvalid" ||
      msg === "titleRequired"
    ) {
      return { error: tErrors(msg) };
    }
    return { error: tErrors("invalidData") };
  }

  // Estrai i campi di traduzione per locale (tr_<locale>_title, _slug, _content)
  const trData: Record<string, { title: string; slug: string; content: string }> = {};
  for (const locale of LOCALES) {
    const title = (formData.get(`tr_${locale}_title`) as string) ?? "";
    const slug = (formData.get(`tr_${locale}_slug`) as string) ?? "";
    const content = (formData.get(`tr_${locale}_content`) as string) ?? "";
    trData[locale] = { title, slug, content };
  }

  // Estrai i campi SEO base + traduzioni SEO per locale non-default
  const seoBase = {
    title: (formData.get("seoTitle") as string) ?? "",
    description: (formData.get("seoDescription") as string) ?? "",
    ogTitle: (formData.get("seoOgTitle") as string) ?? "",
    ogDescription: (formData.get("seoOgDescription") as string) ?? "",
    ogImage: (formData.get("seoOgImage") as string) ?? "",
    robots: (formData.get("seoRobots") as string) ?? "",
    jsonLdEnabled: (formData.get("seoJsonLdEnabled") as string) === "true",
    jsonLdType: (formData.get("seoJsonLdType") as string) ?? "",
  };
  const seoTrData: Record<
    string,
    { title: string; description: string; ogTitle: string; ogDescription: string }
  > = {};
  for (const locale of LOCALES) {
    if (locale === DEFAULT_LOCALE) continue;
    seoTrData[locale] = {
      title: (formData.get(`seo_tr_${locale}_title`) as string) ?? "",
      description: (formData.get(`seo_tr_${locale}_description`) as string) ?? "",
      ogTitle: (formData.get(`seo_tr_${locale}_ogTitle`) as string) ?? "",
      ogDescription: (formData.get(`seo_tr_${locale}_ogDescription`) as string) ?? "",
    };
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

  // Server-side guard: il flag UI può essere bypassato. Se la pagina
  // esistente è una system page con slug "locked" (whitelist in
  // schema.ts), rifiutiamo qualunque cambio slug — verrebbe servita
  // dal page handler hardcoded comunque, e il record resterebbe
  // disallineato rispetto alla rotta vera.
  if (slugChanged && id) {
    const { getPageById } = await import("@/lib/db/pages-queries");
    const { isSystemSlugEditable } = await import("@/lib/db/schema");
    const existing = await getPageById(Number(id));
    if (existing) {
      const editable = isSystemSlugEditable({
        isSystem: existing.isSystem ?? false,
        systemKey: existing.systemKey ?? null,
      });
      if (!editable) {
        return { error: tErrors("slugBound") };
      }
    }
  }

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

      await createAutoSlugRedirect({
        pageId: savedId,
        locale: null,
        fromPath: `/${originalSlug}`,
        toPath: `/${data.slug}`,
      });
    }

    // Salva le traduzioni per ogni locale non-default
    if (!isCreating) {
      const existingTrs = await getPageTranslationsForPage(savedId);
      const existingByLocale = Object.fromEntries(existingTrs.map((t) => [t.locale, t]));

      for (const [locale, fields] of Object.entries(trData)) {
        if (locale === DEFAULT_LOCALE) continue;
        const hasInput = fields.title || fields.slug || fields.content;
        if (!hasInput && !existingByLocale[locale]) continue;

        // Rileva cambio slug locale per auto-redirect
        const prevSlug = existingByLocale[locale]?.slug ?? null;
        if (prevSlug && fields.slug && prevSlug !== fields.slug) {
          await createAutoSlugRedirect({
            pageId: savedId,
            locale,
            fromPath: `/${locale}/${prevSlug}`,
            toPath: `/${locale}/${fields.slug}`,
          });
        }

        await upsertPageTranslation({
          pageId: savedId,
          locale,
          title: fields.title || null,
          slug: fields.slug || null,
          content: fields.content || null,
        });
      }
    }

    // Save SEO base + traduzioni SEO. Save unificato col resto: l'admin
    // preme un solo bottone Save e tutto va via insieme. Il SEO viene
    // upsertato solo se ha dati validi oppure se esisteva già un record
    // (per non perdere modifiche pre-esistenti dopo un edit pagina senza
    // toccare il tab SEO).
    const seoPathname = `/${data.slug}`;
    const hasSeoBaseData =
      seoBase.title ||
      seoBase.description ||
      seoBase.ogTitle ||
      seoBase.ogDescription ||
      seoBase.ogImage ||
      seoBase.robots ||
      seoBase.jsonLdEnabled;
    const existingSeoAfterRename = await getSeoPage(seoPathname);
    if (hasSeoBaseData || existingSeoAfterRename) {
      await upsertSeoPage({
        pathname: seoPathname,
        label: data.title,
        title: seoBase.title || null,
        description: seoBase.description || null,
        ogTitle: seoBase.ogTitle || null,
        ogDescription: seoBase.ogDescription || null,
        ogImage: seoBase.ogImage || null,
        robots: seoBase.robots || null,
        jsonLdEnabled: seoBase.jsonLdEnabled,
        jsonLdType: seoBase.jsonLdType || null,
        updatedAt: new Date(),
      });

      // Traduzioni SEO. upsertSeoPageTranslation cancella la riga se
      // tutti i 4 campi sono vuoti — niente record fantasma.
      for (const [locale, fields] of Object.entries(seoTrData)) {
        await upsertSeoPageTranslation({
          pathname: seoPathname,
          locale,
          title: fields.title || null,
          description: fields.description || null,
          ogTitle: fields.ogTitle || null,
          ogDescription: fields.ogDescription || null,
        });
      }
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
    return { error: tErrors("saveError") };
  }
}

export async function deletePageAction(
  slug: string,
): Promise<{ error?: string; success?: boolean; deleted?: number }> {
  const tErrors = await getTranslations("admin.content.pages.errors");
  if (!slug) return { error: tErrors("missingSlug") };
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
      return { error: tErrors("systemPagesProtected") };
    }
    console.error("[deletePageAction] error:", err);
    return { error: tErrors("deleteError") };
  }
}

export async function getPageForEditAction(slug: string) {
  return getPageBySlug(slug);
}

export async function togglePageStatusAction(
  id: number,
  currentStatus: string,
): Promise<{ error?: string; success?: boolean }> {
  const tErrors = await getTranslations("admin.content.pages.errors");
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
    return { error: tErrors("statusToggleError") };
  }
  return { success: true };
}
