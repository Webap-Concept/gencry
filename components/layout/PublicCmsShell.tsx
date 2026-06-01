// components/layout/PublicCmsShell.tsx
//
// Shell condivisa tra `(cms)/layout.tsx` e `[locale]/layout.tsx`. Era
// duplicata 1:1 (header + main + rail + footer) e ogni feature
// trasversale (es. il fix isNews del 2026-05-19) andava replicata in
// entrambi — bug garantito alla prossima dimenticanza.
//
// Lo shell legge `x-pathname` dagli headers ed è server async (uguale
// ai 2 layout originali). Calcola da solo:
//   - `isNews`: pathname dentro la sezione blog → layout editoriale.
//   - `showRail`: rail off su legals + news.
//   - `fullBleed`: senza max-w container quando siamo nel blog.
//   - `logoHref`: punta a /news dentro la sezione blog (così il logo
//     non riporta alla landing marketing quando l'utente sta leggendo).
//
// `localePrefix` (opt): il layout `[locale]/layout.tsx` deve poter
// strippare il prefix locale dal pathname prima del match (es.
// `/en/news/bitcoin` → `/news/bitcoin`). `(cms)/layout.tsx` non riceve
// mai un prefix locale (le sue rotte sono senza), quindi non lo passa.
// Tenere la logica di stripping qui dentro evita di centralizzare
// conoscenza i18n nello shell, ma comunque sposta in unico posto la
// regex di strip — invariato a livello di superficie d'API.

import { AppRightRail } from "@/components/layout/AppRightRail";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { PublicHeader } from "@/components/layout/PublicHeader";
import type { NewsMenuItem } from "@/components/layout/NewsNavMenu";
import { ResetScrollOnPath } from "@/app/(cms)/_components/reset-scroll-on-path";
import {
  getSystemPageSlugs,
  isLegalsPathname,
  isNewsPathname,
} from "@/lib/db/pages-queries";
import { getAppSettingsSafe } from "@/lib/db/settings-queries";
import { getCachedActiveNewsCategories } from "@/lib/cms/news-feed-queries";
import { headers } from "next/headers";
import { Suspense } from "react";

// Menu news CMS-driven: la lista delle voci (label + href) viene dal DB
// (cached 60s, invalidato dal tag "pages" al publish articolo / admin save).
// Ritorna le page categoria con ≥1 articolo published, ordinate per
// `pages.sort_order` (seedato in migration M_news_007 in ordine
// editoriale: bitcoin=10 → tech=80). Label = `pages.title`, così
// rinominare una categoria dall'admin si rifletta subito in menu senza
// override hardcoded.
async function buildNewsMenu(): Promise<NewsMenuItem[]> {
  const active = await getCachedActiveNewsCategories();
  return active.map((cat) => ({
    label: cat.title,
    href: `/${cat.slug}`,
  }));
}

export async function PublicCmsShell({
  children,
  localePrefix,
}: {
  children: React.ReactNode;
  /** Prefisso locale dell'URL (es. "en") da strippare prima del match.
   *  Opzionale: se assente, il pathname viene matchato così com'è. */
  localePrefix?: string;
}) {
  const [appSettings, slugs, headerList] = await Promise.all([
    getAppSettingsSafe(),
    getSystemPageSlugs(),
    headers(),
  ]);
  const rawPathname = headerList.get("x-pathname") ?? "/";
  // Strip prefix locale se il caller lo ha fornito. Senza effetto per
  // path già "puliti".
  const pathname = localePrefix
    ? rawPathname.replace(new RegExp(`^/${localePrefix}(?=/|$)`), "") || "/"
    : rawPathname;

  const isNews = isNewsPathname(pathname);
  // Pagine di sistema "content-only" con template coded che renderizza il
  // proprio layout completo (es. /reazioni-post → TemplateReaction): niente
  // right rail, come i legals. Mostrano SOLO il contenuto, centrato.
  const firstSegment = pathname.replace(/^\/+/, "").split("/")[0]?.toLowerCase();
  const isContentOnly = firstSegment === "reazioni-post";
  const showRail = !isLegalsPathname(pathname, slugs) && !isNews && !isContentOnly;
  const fullBleed = isNews;

  // Menu news: 1 query DB cached, eseguita solo in contesto news per non
  // pagare il roundtrip su pagine non-news (la cache `unstable_cache`
  // futura potrebbe muovere questo in lazy senza cambio API).
  const newsMenu = isNews ? await buildNewsMenu() : undefined;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-gc-bg">
      <ResetScrollOnPath />
      <PublicHeader
        appLogoUrl={appSettings.app_logo_url}
        appLogoVariantUrl={appSettings.app_logo_variant_url}
        logoHref={isNews ? "/news" : "/"}
        newsMenu={newsMenu}
      />
      <div className="flex-1">
        <div className={fullBleed ? "w-full" : "mx-auto w-full max-w-7xl flex"}>
          {fullBleed ? (
            <main className="w-full">{children}</main>
          ) : (
            <>
              {/* main flex-1 + min-w-0 per non far esplodere il layout
                  con content larghi. Sui legals il rail è disabilitato,
                  quindi il main occupa tutta la larghezza (max-w-7xl). */}
              <main className="flex flex-1 flex-col min-w-0">{children}</main>
              {showRail && (
                <Suspense fallback={null}>
                  <AppRightRail />
                </Suspense>
              )}
            </>
          )}
        </div>
      </div>
      <Suspense fallback={null}>
        <PublicFooter />
      </Suspense>
    </div>
  );
}
