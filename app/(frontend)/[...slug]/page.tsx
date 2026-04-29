import { getPageWithTemplate } from "@/lib/db/pages-queries";
import { getSeoPage } from "@/lib/db/seo-queries";
import { getAppSettings } from "@/lib/db/settings-queries";
import { getDynamicTemplate } from "@/app/(frontend)/_templates/loader";
import { parseCustomFields } from "@/app/(frontend)/_templates/types";
import { resolvePlaceholders } from "@/lib/utils/content-placeholders";
import { sanitizeRichTextHtml } from "@/lib/utils/sanitize-html";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

// ---------------------------------------------------------------------------
// generateMetadata
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const pathname = "/" + slug.join("/");

  const [seo, page] = await Promise.all([
    getSeoPage(pathname),
    getPageWithTemplate(slug.join("/")),
  ]);

  const title = seo?.title || page?.title || undefined;
  const description = seo?.description || undefined;

  return {
    title,
    description,
    openGraph: {
      title: seo?.ogTitle || title,
      description: seo?.ogDescription || description,
      ...(seo?.ogImage ? { images: [{ url: seo.ogImage }] } : {}),
    },
    robots: seo?.robots || undefined,
  };
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default async function FrontendPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const pageSlug = slug.join("/");

  const [pageData, settings] = await Promise.all([
    getPageWithTemplate(pageSlug),
    getAppSettings(),
  ]);

  if (!pageData || pageData.status !== "published") {
    notFound();
  }

  const templateSlug = pageData.template?.slug ?? null;
  const TemplateComponent = getDynamicTemplate(templateSlug);

  const fields = parseCustomFields(pageData.customFields);

  // Risolvi i placeholder {token} con i valori reali, poi sanitizza l'HTML.
  const resolvedContent = resolvePlaceholders(pageData.content, settings);
  const safePage = {
    ...pageData,
    content: sanitizeRichTextHtml(resolvedContent),
  };

  return (
    <TemplateComponent
      page={safePage}
      template={pageData.template ?? null}
      fields={fields}
    />
  );
}
