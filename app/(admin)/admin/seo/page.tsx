// app/(admin)/[adminSlug]/seo/page.tsx
// Redirect automatico alla prima sottosezione disponibile.
// Prima puntava a /admin/seo/meta-tags, ora rimosso: la gestione dei
// meta tag per pagina è migrata sotto /<adminSlug>/content/pages → tab SEO.
import { redirect } from "next/navigation";

export default async function SeoIndexPage({
  params,
}: {
  params: Promise<{ adminSlug: string }>;
}) {
  const { adminSlug } = await params;
  redirect(`/${adminSlug}/seo/redirect`);
}
