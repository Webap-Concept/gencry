import type { Metadata } from "next";
import { NotFoundShell } from "@/components/not-found/NotFoundShell";
import { getSeoPage } from "@/lib/db/seo-queries";
import { getAppSettings } from "@/lib/db/settings-queries";
import { resolvePlaceholders } from "@/lib/utils/content-placeholders";

// Disabilita lo static rendering: `generateMetadata` deve rieseguire la
// query a seo_pages a ogni request, altrimenti l'admin che modifica
// title/description da /admin/seo/meta-tags non vede l'effetto finché il
// prossimo deploy.
export const dynamic = "force-dynamic";

// Pathname usato per i meta della 404 nel sistema SEO interno. Corrisponde
// allo slug della system page in `pages` (gestita da /admin/content/pages
// tab Sistema), così l'admin trova UN SOLO record "/404" in entrambi i
// pannelli — niente duplicati confusi.
const NOT_FOUND_SEO_PATHNAME = "/404";

export async function generateMetadata(): Promise<Metadata> {
  // In pratica raramente invocato: i 404 da URL inesistenti passano per
  // (frontend)/[...slug]/page.tsx e i meta arrivano dal generateMetadata
  // di QUEL handler. Lo teniamo defensive — se per qualche caso il
  // framework lo chiama, vogliamo title valido e placeholder risolti.
  const [seo, settings] = await Promise.all([
    getSeoPage(NOT_FOUND_SEO_PATHNAME),
    getAppSettings(),
  ]);
  const resolve = (text?: string | null) =>
    text ? resolvePlaceholders(text, settings) : undefined;
  return {
    title: resolve(seo?.title) ?? "404 — Pagina non trovata",
    description:
      resolve(seo?.description) ?? "L'asset che cercavi non è in portafoglio.",
    openGraph: {
      title:
        resolve(seo?.ogTitle) ?? resolve(seo?.title) ?? "404 — Pagina non trovata",
      description: resolve(seo?.ogDescription) ?? resolve(seo?.description),
      images: seo?.ogImage ? [{ url: seo.ogImage }] : undefined,
    },
    robots: seo?.robots ?? "noindex, follow",
  };
}

// Fallback per URL totalmente fuori dai groups. Renderizzato dal solo
// root layout: niente frontend.css, quindi i token gc-* sono undefined
// e lo shell ricade sui colori di base. Per le 404 generate dentro
// `(frontend)` il file dedicato `app/(frontend)/not-found.tsx` prende
// la precedenza e produce il rendering completo.
export default async function NotFound() {
  return <NotFoundShell />;
}
