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
// `/en/altcoin/foo` → `/altcoin/foo`). `(cms)/layout.tsx` non riceve
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
import { getActiveNewsCategories } from "@/lib/modules/news/queries";
import { newsCategoryUrlPrefix } from "@/lib/modules/news/url-prefixes";
import { headers } from "next/headers";
import { Suspense } from "react";

// Ordine fisso editoriale delle voci menu (Bitcoin first, "other" droppato
// perché /news è già la home dell'archivio). Solo le voci la cui categoria
// ha ≥1 articolo published (vedi getActiveNewsCategories) finiscono in UI.
//
// Link per ora: `/news#cat-<prefix>` come placeholder — le landing
// categoria reali (/altcoin, /bitcoin, …) verranno in PR successiva
// (decisione 2026-05-20). Quando esisteranno, basta sostituire l'href.
const NEWS_MENU_EDITORIAL_ORDER: ReadonlyArray<{
  category: string;
  label: string;
}> = [
  { category: "bitcoin",    label: "Bitcoin" },
  { category: "ethereum",   label: "Ethereum" },
  { category: "altcoin",    label: "Altcoin" },
  { category: "defi",       label: "DeFi" },
  { category: "market",     label: "Mercati" },
  { category: "regulation", label: "Regolamentazione" },
  { category: "tech",       label: "Tech" },
];

async function buildNewsMenu(): Promise<NewsMenuItem[]> {
  const active = await getActiveNewsCategories();
  return NEWS_MENU_EDITORIAL_ORDER.filter((it) => active.has(it.category)).map(
    (it) => ({
      label: it.label,
      // /news#cat-<urlprefix>: usa il prefix italianizzato (regolamentazione,
      // mercati) coerente con il path degli articoli (/regolamentazione/...).
      href: `/news#cat-${newsCategoryUrlPrefix(it.category)}`,
    }),
  );
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
  const showRail = !isLegalsPathname(pathname, slugs) && !isNews;
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
