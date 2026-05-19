import Link from "next/link";
import { eq } from "drizzle-orm";
import { User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db/drizzle";
import { userProfiles } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";

/**
 * Header chrome unica per tutte le pagine in `(cms)/` (CMS catch-all
 * + listing news). Auth-aware lato server:
 *   - anonimo → bottoni "Accedi" + "Iscriviti"
 *   - loggato → avatar + link "Apri l'app" (porta a `/feed`)
 *
 * Niente dropdown / menu utente qui: l'header del frontend è marketing,
 * la navigazione completa vive dentro `ProtectedShell`. Cliccando
 * sull'avatar/link l'utente entra nell'app vera.
 *
 * Il logo che arriva da app_settings (app_logo_url) include già il
 * lettering "generazione crypto" → niente testo extra accanto.
 * Fallback: lettering testuale "generazione" + "crypto" colorato in
 * accent (lo stesso pattern di AppTopBar).
 */
export async function PublicHeader({ appLogoUrl }: { appLogoUrl: string | null }) {
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

  return (
    <header className="sticky top-0 z-30 bg-gc-bg/85 backdrop-blur border-b border-gc-line">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-20 flex items-center gap-4">
        <Link
          href="/"
          prefetch={false}
          className="flex items-center shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-accent rounded"
          aria-label="Home"
        >
          {appLogoUrl ? (
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
          {session ? (
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
