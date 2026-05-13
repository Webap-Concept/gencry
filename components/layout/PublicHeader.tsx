import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Header chrome unica per tutte le pagine pubbliche servite a utenti
 * anonimi (coin detail, CMS pages, flow auth). Per i loggati che
 * visitano una rotta `(public)`, il layout adattivo monta
 * `<ProtectedShell>` al posto di questa header — non passi mai da qui.
 *
 * Il logo che arriva da app_settings (app_logo_url) include già il
 * lettering "generazione crypto" → niente testo extra accanto.
 * Fallback: lettering testuale "generazione" + "crypto" colorato in
 * accent (lo stesso pattern di AppTopBar).
 */
export function PublicHeader({ appLogoUrl }: { appLogoUrl: string | null }) {
  return (
    <header className="sticky top-0 z-30 bg-gc-bg/85 backdrop-blur border-b border-gc-line">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 h-20 flex items-center gap-4">
        <Link
          href="/"
          prefetch={false}
          className="flex items-center shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-accent rounded"
          aria-label="Home"
        >
          {appLogoUrl ? (
            // Logo upload-ato dall'admin: contiene già il lettering, quindi
            // niente <span> accanto. h-16 (~64px) + w-auto preserva l'aspect
            // ratio originale del file caricato.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={appLogoUrl}
              alt="Generazione Crypto"
              className="h-16 w-auto"
            />
          ) : (
            <span className="font-medium text-lg leading-none tracking-[-0.01em] text-gc-fg">
              generazione<span className="text-gc-accent">crypto</span>
            </span>
          )}
        </Link>

        <div className="flex-1" />

        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/sign-in" prefetch={false}>
              Accedi
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/sign-up" prefetch={false}>
              Iscriviti
            </Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
