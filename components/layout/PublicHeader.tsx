import Link from "next/link";
import { eq } from "drizzle-orm";
import { User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db/drizzle";
import { userProfiles } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { AppLogo } from "@/components/layout/AppLogo";
import {
  NewsNavDesktop,
  NewsNavMobileAvatar,
  NewsNavMobileDrawer,
  type NewsMenuItem,
} from "@/components/layout/NewsNavMenu";

/**
 * Header chrome unica per tutte le pagine in `(cms)/` (CMS catch-all
 * + listing news). Auth-aware lato server:
 *   - anonimo → bottoni "Accedi" + "Iscriviti"
 *   - loggato → avatar + link "Apri l'app" (porta a `/feed`)
 *
 * Layout responsive standard (senza menu news):
 *   - desktop: [logo] [spazio] [CTA/avatar]
 *
 * Quando `newsMenu` è passato (vedi PublicCmsShell con isNews=true):
 *   - desktop ≥ lg: [logo] [menu categorie inline] [spazio] [CTA/avatar]
 *   - mobile  < lg: [hamburger] [logo centrato] [avatar/null]
 *     Il drawer aperto dall'hamburger contiene categorie + Accedi/Iscriviti
 *     (i CTA spariscono dalla riga top mobile per non sforare).
 *
 * Il logo che arriva da app_settings (app_logo_url) include già il
 * lettering "generazione crypto" → niente testo extra accanto.
 * Fallback: lettering testuale "generazione" + "crypto" colorato in
 * accent (lo stesso pattern di AppTopBar).
 */
export async function PublicHeader({
  appLogoUrl,
  appLogoVariantUrl,
  logoHref = "/",
  newsMenu,
}: {
  appLogoUrl: string | null;
  /** Logo per modalità dark — caricato in admin come `app_logo_variant_url`.
   *  Null → fallback al logo principale anche in dark. */
  appLogoVariantUrl?: string | null;
  /** Destinazione del logo. Default "/" (homepage). Il layout (cms)
   *  passa "/news" quando siamo dentro la sezione blog (listing,
   *  articoli, landing categoria) così il logo riporta al feed
   *  editoriale invece che alla home generale. */
  logoHref?: string;
  /** Voci del menu news, popolate solo quando isNews=true. Cambia
   *  anche il layout mobile (hamburger + logo centrato + avatar). */
  newsMenu?: NewsMenuItem[];
}) {
  // Read parallela: sessione + (solo se loggato) avatar URL del profilo.
  // session è già cache-ata per request, profile lookup è 1 indexed SELECT.
  const session = await getSession();
  let avatarUrl: string | null = null;
  if (session) {
    const [row] = await db
      .select({ avatarUrl: userProfiles.avatarUrl })
      .from(userProfiles)
      .where(eq(userProfiles.userId, session.user.id))
      .limit(1);
    avatarUrl = row?.avatarUrl ?? null;
  }

  const hasMenu = !!newsMenu && newsMenu.length > 0;
  const isLoggedIn = !!session;

  const logo = appLogoUrl ? (
    <AppLogo
      url={appLogoUrl}
      variantUrl={appLogoVariantUrl ?? null}
      alt="Generazione Crypto"
      className="h-16 w-auto"
    />
  ) : (
    <span className="font-medium text-lg leading-none tracking-[-0.01em] text-gc-fg">
      generazione<span className="text-gc-accent">crypto</span>
    </span>
  );

  return (
    <header className="sticky top-0 z-30 bg-gc-bg/85 backdrop-blur border-b border-gc-line">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-20 flex items-center gap-4">
        {/* Mobile: hamburger a sinistra SOLO quando c'è il menu news.
            Senza menu il layout mobile resta come prima (logo a sinistra). */}
        {hasMenu && (
          <NewsNavMobileDrawer
            items={newsMenu!}
            appLogoUrl={appLogoUrl}
            appLogoVariantUrl={appLogoVariantUrl}
          />
        )}

        {/* Logo. In modalità news+mobile il logo si centra perché flex-1
            ai 2 lati lo spinge al centro; su desktop e in modalità
            non-news resta a sinistra come sempre. */}
        <Link
          href={logoHref}
          prefetch={false}
          className={
            hasMenu
              ? "flex items-center shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-accent rounded lg:mr-0 mx-auto lg:mx-0"
              : "flex items-center shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-accent rounded"
          }
          aria-label="Home"
        >
          {logo}
        </Link>

        {/* Desktop menu inline subito dopo il logo */}
        {hasMenu && <NewsNavDesktop items={newsMenu!} />}

        <div className="flex-1" />

        {/* Mobile (con menu news): solo avatar se loggato, altrimenti nulla
            (CTA Accedi/Iscriviti sono nel drawer). Nascosto da lg in su. */}
        {hasMenu && isLoggedIn && (
          <NewsNavMobileAvatar avatarUrl={avatarUrl} />
        )}

        {/* Desktop: nav classica (avatar+link / CTA).
            Quando hasMenu è true, la nav è hidden sotto lg perché lo spazio
            è già occupato da hamburger + logo + avatar mobile. */}
        <nav
          className={
            hasMenu
              ? "hidden lg:flex items-center gap-2"
              : "flex items-center gap-2"
          }
        >
          {isLoggedIn ? (
            <Link
              href="/"
              prefetch={false}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-gc-fg hover:bg-gc-line/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-accent"
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
              <span>Apri l&apos;app</span>
            </Link>
          ) : (
            <>
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
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
