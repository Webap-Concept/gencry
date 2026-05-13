import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Header per pagine pubbliche servite a utenti anonimi (es. `/coins/btc`
 * lato guest). Sticky top, theme-aware, con logo a sinistra e i due CTA
 * principali ("Accedi" / "Iscriviti") a destra.
 *
 * Per l'utente loggato che visita la stessa rotta, il layout adattivo
 * monta `<ProtectedShell>` al posto di questa header — non passi mai
 * da qui.
 */
export function PublicHeader({ appLogoUrl }: { appLogoUrl: string | null }) {
  return (
    <header className="sticky top-0 z-30 bg-gc-bg/80 backdrop-blur border-b border-gc-line">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          {appLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={appLogoUrl}
              alt=""
              aria-hidden
              width={28}
              height={28}
              className="rounded"
            />
          ) : (
            <span className="w-7 h-7 rounded bg-gc-accent" aria-hidden />
          )}
          <span className="font-semibold text-gc-fg">Generazione Crypto</span>
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
