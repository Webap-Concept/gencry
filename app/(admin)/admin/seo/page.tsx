// app/(admin)/admin/seo/page.tsx
// Redirect automatico alla prima sottosezione disponibile.
// Prima puntava a /admin/seo/meta-tags, ora rimosso: la gestione dei
// meta tag per pagina è migrata sotto /admin/content/pages → tab SEO.
import { redirect } from "next/navigation";

export default function SeoIndexPage() {
  redirect("/admin/seo/redirect");
}
