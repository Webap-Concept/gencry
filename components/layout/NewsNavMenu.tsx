"use client";

// components/layout/NewsNavMenu.tsx
//
// Menu di navigazione della sezione news. Mostrato dentro PublicHeader
// quando siamo in un contesto isNews (vedi PublicCmsShell).
//
// Layout responsive:
//   - desktop ≥ 900px: lista inline a destra del logo, voci a link diretto
//   - mobile  < 900px: layout speciale dello header (hamburger | logo |
//     avatar/null) + drawer Sheet a sinistra che contiene menu + CTA
//     Accedi/Iscriviti (i CTA spariscono dalla riga top per non sforare).
//
// Le voci news sono passate come prop dal server (così l'HTML è già
// fatto, niente JS richiesto per il render iniziale). Solo l'apertura
// del drawer richiede client interactivity → questo file `"use client"`.
//
// href: URL reale della page categoria CMS (es. `/news/bitcoin`,
// `/news/mercati`). Costruito server-side da `buildNewsMenu` in
// PublicCmsShell leggendo le active categories dal DB.

import Link from "next/link";
import { useState } from "react";
import { Menu, User } from "lucide-react";
import { useViewer } from "@/components/auth/ViewerProvider";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export interface NewsMenuItem {
  /** Etichetta visibile (es. "Bitcoin"). */
  label: string;
  /** href della page categoria CMS, es. `/news/bitcoin`. */
  href: string;
}

export function NewsNavDesktop({ items }: { items: NewsMenuItem[] }) {
  if (items.length === 0) return null;
  return (
    <nav
      aria-label="Categorie news"
      className="hidden lg:flex items-center gap-1 ml-6"
    >
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          prefetch={false}
          className="px-3.5 py-1.5 rounded-full text-sm font-medium text-gc-fg-2 hover:text-gc-fg hover:bg-gc-line/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-accent"
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Wrapper mobile: hamburger trigger sinistra + drawer Sheet a slide-in
 * che mostra menu categorie + CTA Accedi/Iscriviti per anonimi.
 * Il drawer viene reso ANCHE per loggati (con solo il menu, senza CTA)
 * — su mobile il drawer è l'unico modo di navigare le categorie.
 */
export function NewsNavMobileDrawer({
  items,
  appLogoUrl,
}: {
  items: NewsMenuItem[];
  /** Logo dell'app mostrato come header del drawer (stesso che la top-bar
   *  centra in modalità mobile). Fallback testuale se null. */
  appLogoUrl: string | null;
}) {
  const { isLoggedIn } = useViewer();
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-md text-gc-fg hover:bg-gc-line/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-accent"
          aria-label="Apri menu news"
        >
          <Menu size={20} />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] sm:w-[320px] bg-gc-bg border-gc-line p-0 flex flex-col">
        {/* SheetTitle resta sr-only per accessibilità: la visuale è il logo.
            La X di chiusura è quella default di shadcn Sheet
            (showCloseButton=true di default in absolute top-4 right-4)
            — niente bisogno di emetterne una manuale. */}
        <SheetTitle className="sr-only">Menu news</SheetTitle>
        <div className="flex items-center px-5 py-4 border-b border-gc-line h-20">
          {appLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={appLogoUrl}
              alt="Generazione Crypto"
              className="h-12 w-auto"
            />
          ) : (
            <span className="font-medium text-base leading-none tracking-[-0.01em] text-gc-fg">
              generazione<span className="text-gc-accent">crypto</span>
            </span>
          )}
        </div>

        <nav
          aria-label="Categorie news"
          className="flex-1 overflow-y-auto py-2"
        >
          {items.length === 0 ? (
            <p className="px-5 py-3 text-xs text-gc-fg-3">
              Nessuna categoria disponibile.
            </p>
          ) : (
            items.map((it) => (
              <SheetClose key={it.href} asChild>
                <Link
                  href={it.href}
                  prefetch={false}
                  className="block px-5 py-2.5 text-sm font-medium text-gc-fg-2 hover:text-gc-fg hover:bg-gc-line/40 transition-colors"
                >
                  {it.label}
                </Link>
              </SheetClose>
            ))
          )}
        </nav>

        {!isLoggedIn && (
          <div className="border-t border-gc-line p-4 space-y-2">
            <SheetClose asChild>
              <Button asChild variant="ghost" size="sm" className="w-full justify-center">
                <Link href="/sign-in" prefetch={false}>
                  Accedi
                </Link>
              </Button>
            </SheetClose>
            <SheetClose asChild>
              <Button asChild size="sm" className="w-full justify-center">
                <Link href="/sign-up" prefetch={false}>
                  Iscriviti
                </Link>
              </Button>
            </SheetClose>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Avatar/icon utente mostrato a destra dello header in mobile (e nel
 * dropdown desktop quando loggato — già gestito dal PublicHeader esistente).
 * Wrappato in un componente perché il PublicHeader server-side ha bisogno
 * di un fallback consistente con lo skin gc-* anche quando l'utente è
 * anonimo (in quel caso ritorna null, l'header sa di occupare lo spazio
 * con il logo centrale).
 */
export function NewsNavMobileAvatar({
  avatarUrl,
}: {
  avatarUrl: string | null;
}) {
  return (
    <Link
      href="/"
      prefetch={false}
      className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-full text-gc-fg hover:bg-gc-line/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-accent"
      aria-label="Apri l'app"
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          className="w-8 h-8 rounded-full object-cover"
        />
      ) : (
        <span
          className="w-8 h-8 rounded-full flex items-center justify-center bg-gc-line/60 text-gc-fg-muted"
          aria-hidden
        >
          <User size={16} />
        </span>
      )}
    </Link>
  );
}
