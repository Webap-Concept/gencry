import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { after } from "next/server";
import { Crash404 } from "@/components/not-found/Crash404";
import { logNotFoundHit } from "@/lib/seo/log-not-found";
import { getPageBySystemKey } from "@/lib/db/pages-queries";
import { getSeoPage } from "@/lib/db/seo-queries";
import { getAppSettings } from "@/lib/db/settings-queries";
import { sanitizeRichTextHtml } from "@/lib/utils/sanitize-html";
import { resolvePlaceholders } from "@/lib/utils/content-placeholders";

// Disabilita lo static rendering: `generateMetadata` deve rieseguire
// la query a seo_pages a ogni request, altrimenti l'admin che modifica
// title/description da /admin/seo/meta-tags non vede l'effetto finché
// il prossimo deploy.
export const dynamic = "force-dynamic";

// Pathname usato per i meta della 404 nel sistema SEO interno. Corrisponde
// allo slug della system page in `pages` (gestita da /admin/content/pages
// tab Sistema), così l'admin trova UN SOLO record "/404" in entrambi i
// pannelli — niente duplicati confusi.
// L'URL letterale "/404" non è raggiungibile: `[...slug]/page.tsx` chiama
// notFound() quando incontra la system page, così digitando "/404" parte
// comunque la pagina 404 globale.
const NOT_FOUND_SEO_PATHNAME = "/404";

export async function generateMetadata(): Promise<Metadata> {
  // In pratica questo `generateMetadata` non viene quasi mai invocato:
  // i 404 da URL inesistenti passano per (frontend)/[...slug]/page.tsx
  // e i meta arrivano dal generateMetadata di QUEL handler. Lo teniamo
  // defensive — se per qualche caso il framework lo chiama, vogliamo
  // comunque title valido e placeholder risolti.
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

export default async function NotFound() {
  // Il proxy (vedi proxy.ts) imposta `x-pathname` su ogni request: usiamolo
  // per sapere QUALE URL ha generato il 404. Senza questo, dal not-found.tsx
  // non avremmo modo di recuperare il pathname originario.
  const h = await headers();
  const pathname = h.get("x-pathname");
  const referrer = h.get("referer");
  const userAgent = h.get("user-agent");

  // `after()` esegue il callback DOPO che la response è stata inviata
  // all'utente: l'INSERT/UPDATE non aggiunge latenza percepita al 404.
  after(async () => {
    await logNotFoundHit({ pathname, referrer, userAgent });
  });

  // Logo + content sono gestiti via /admin: l'admin può modificare il
  // sottotitolo da /admin/content/pages tab Sistema, e il logo da
  // /admin/settings/general. Niente fallback hardcoded sull'asset
  // statico — se il logo non è caricato, mostriamo solo il segnale
  // di errore.
  const [settings, systemPage] = await Promise.all([
    getAppSettings(),
    getPageBySystemKey("not_found"),
  ]);

  const logoUrl = settings.app_logo_url ?? settings.app_logo_variant_url;
  // Il content arriva dal rich text editor di Tiptap, già wrappato in
  // <p>...</p> e con eventuale formattazione inline. Sanitizziamo
  // server-side e passiamo HTML al client component, che lo renderizza
  // con dangerouslySetInnerHTML — altrimenti i tag arriverebbero come
  // testo letterale al browser.
  const descriptionHtml = sanitizeRichTextHtml(systemPage?.content).trim();

  // Niente PublicFooter qui: lo monta già FrontendLayout. `flex flex-1
  // flex-col` per stretchare lo sfondo gc-bg a tutta l'altezza disponibile
  // tra topbar di Next e footer pubblico — senza il flex-1, il container
  // si dimensionava sul solo content e lasciava il fondo del viewport
  // scoperto. `overflow-hidden` nasconde le coin che cadono fuori
  // (animation +110vh) senza generare scrollbar verticali decorative.
  return (
    <div className="relative flex w-full flex-1 flex-col overflow-hidden bg-gc-bg text-gc-fg">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            "linear-gradient(var(--gc-line) 1px, transparent 1px), linear-gradient(90deg, var(--gc-line) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          backgroundPosition: "-1px -1px",
          maskImage:
            "radial-gradient(ellipse 80% 70% at 50% 45%, #000 30%, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 70% at 50% 45%, #000 30%, transparent 80%)",
        }}
      />

      <nav className="relative z-10 mx-auto flex w-full max-w-[1280px] items-center justify-between px-5 py-5 md:px-8 md:py-6">
        <Link
          href="/"
          aria-label="Torna alla home"
          className="flex items-center gap-3 no-underline">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={settings.app_name || "Logo"}
              width={160}
              height={40}
              className="h-10 w-auto object-contain"
              priority
              unoptimized
            />
          ) : null}
        </Link>

        <div className="inline-flex items-center gap-2 rounded-full border border-gc-line bg-gc-bg-2 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-gc-fg-3">
          <span className="h-[7px] w-[7px] animate-gc-blink rounded-full bg-gc-neg" />
          Errore 404 · Pagina non trovata
        </div>
      </nav>

      <div className="relative z-10 flex flex-1 items-center justify-center">
        <Crash404 descriptionHtml={descriptionHtml || null} />
      </div>
    </div>
  );
}
