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

  const [seo, page, settings] = await Promise.all([
    getSeoPage(pathname),
    getPageWithTemplate(slug.join("/")),
    getAppSettings(),
  ]);

  // Helper locale: applica il resolve dei placeholder ({appName},
  // {appDomain}, ecc.) ai testi dei meta. Stesso resolver usato dal
  // content CMS, così l'admin può scrivere ad esempio "Login {appName}"
  // come title in /admin/seo e vedere il valore sostituito.
  const resolve = (text?: string | null) =>
    text ? resolvePlaceholders(text, settings) : undefined;

  // Se la pagina non esiste (e non c'è un override SEO per quel pathname),
  // questa request finirà in notFound() → render di app/not-found.tsx.
  // In Next.js i meta del not-found NON vengono presi da `not-found.tsx`
  // ma da QUESTA generateMetadata (è il page handler che ha triggerato
  // notFound). Per evitare un <title> vuoto, facciamo il fallback al
  // record SEO della 404 globale ('/404'), modificabile dall'admin.
  // Anche le system pages "meta-only" (contentEditable=false) passano da
  // qui se per qualche routing fallback finiscono nel catch-all: il
  // page handler le bloccherà con notFound(), così evitiamo di servire
  // la system page CMS al posto della rotta vera.
  const isMissing = !page || page.status !== "published";
  const isMetaOnlySystemPage =
    page?.isSystem === true && page?.contentEditable === false;
  if (!seo && (isMissing || isMetaOnlySystemPage)) {
    const fallback = await getSeoPage("/404");
    return {
      title: resolve(fallback?.title) ?? "404 — Pagina non trovata",
      description:
        resolve(fallback?.description) ??
        "L'asset che cercavi non è in portafoglio.",
      openGraph: {
        title: resolve(fallback?.ogTitle) ?? resolve(fallback?.title),
        description:
          resolve(fallback?.ogDescription) ?? resolve(fallback?.description),
        ...(fallback?.ogImage ? { images: [{ url: fallback.ogImage }] } : {}),
      },
      robots: fallback?.robots ?? "noindex, follow",
    };
  }

  const title = resolve(seo?.title) ?? page?.title ?? undefined;
  const description = resolve(seo?.description);

  return {
    title,
    description,
    openGraph: {
      title: resolve(seo?.ogTitle) ?? title,
      description: resolve(seo?.ogDescription) ?? description,
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

  // Le system pages "meta-only" (contentEditable=false) sono container
  // amministrativi: l'admin gestisce solo titolo + meta SEO, e le rotte
  // vere sono servite da page handler dedicati (es. /sign-in →
  // (login)/sign-in/page.tsx, /404 → app/not-found.tsx). Non devono
  // essere navigabili come URL CMS — digitare /sign-in deve attivare la
  // login page, non rendere la system page CMS.
  if (pageData.isSystem && !pageData.contentEditable) {
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
