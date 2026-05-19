/**
 * NotFoundShell — body condiviso della pagina 404.
 *
 * Usato da entrambi i `not-found.tsx`:
 *   - app/(cms)/not-found.tsx  (caso normale: 404 generata dentro
 *                                    una rotta del group frontend, viene
 *                                    wrappata da (cms)/layout.tsx
 *                                    che importa frontend.css)
 *   - app/not-found.tsx             (fallback root: URL totalmente fuori
 *                                    dai groups; in Next 16 viene
 *                                    renderizzata SOLO sotto il root
 *                                    layout, senza i token gc-*)
 *
 * Il root layout NON importa frontend.css (le variabili CSS dei token
 * `--gc-bg`, `--gc-fg` ecc. e i @keyframes `gc-blink` vivono in
 * `(cms)/frontend.css`). Per questo serve un not-found dentro
 * `(cms)/`: senza, l'intero shell rimane senza CSS — fondo nero
 * e niente animazione del blink.
 */
import { Crash404 } from "@/components/not-found/Crash404";
import { GridBackdrop } from "@/components/decor/grid-backdrop";
import { getCachedPageBySystemKey } from "@/lib/db/pages-queries";
import { getCachedAppSettings } from "@/lib/seo";
import { sanitizeRichTextHtml } from "@/lib/utils/sanitize-html";
import Image from "next/image";
import Link from "next/link";
// Import diretto di frontend.css: garantisce che i token gc-* (--gc-bg,
// --gc-fg, ecc.) e i @keyframes (gc-blink, coin-fall) siano disponibili
// anche quando Next 16 sceglie di renderizzare il root not-found senza
// passare per (cms)/layout.tsx. L'import è scoped alla pagina che
// renderizza questo shell, quindi non inquina admin/login.
import "@/app/(cms)/frontend.css";

export async function NotFoundShell() {
  // Stesso ragionamento di app/not-found.tsx: la 404 viene martellata da
  // bot/scanner, prima ogni hit faceva una query a pages e una a settings.
  // Con la cache i lookup sopravvivono il timeout 57014 visto su Sentry.
  const [settings, systemPage] = await Promise.all([
    getCachedAppSettings(),
    getCachedPageBySystemKey("not_found"),
  ]);

  const logoUrl = settings.app_logo_url ?? settings.app_logo_variant_url;
  const descriptionHtml = sanitizeRichTextHtml(systemPage?.content).trim();

  return (
    <div className="relative flex min-h-[100dvh] w-full flex-1 flex-col overflow-hidden bg-gc-bg text-gc-fg">
      <GridBackdrop />

      <nav className="relative z-10 mx-auto flex w-full max-w-[1280px] items-center justify-between px-5 py-5 md:px-8 md:py-6">
        <Link
          href="/"
          aria-label="Torna alla home"
          className="flex items-center gap-3 no-underline">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={settings.app_name || "Logo"}
              width={256}
              height={64}
              className="h-16 w-auto object-contain"
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
