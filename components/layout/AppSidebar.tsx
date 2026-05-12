"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Compass,
  Home,
  Plus,
  User as UserIcon,
} from "lucide-react";
import useSWR from "swr";
import { UserMenu } from "@/components/layout/UserMenu";
import type { UserWithProfile } from "@/lib/db/schema";

// Sidebar fissa della home loggata. Visibile da md in su; su mobile la
// navigazione passa al bottom-nav (vedi AppBottomNav).
//
// Layout: l'intero aside è `sticky h-screen` e `overflow-y-auto` —
// quando i contenuti (logo + nav + button + user-menu in fondo) sono
// più alti del viewport, lo scroll è INTERNO alla sidebar. Senza
// l'overflow, il blocco user-menu spinto da `mt-auto` veniva tagliato
// quando l'utente scrollava in alto fuori dalla finestra visibile.

type NavItem = {
  href: string;
  label: string;
  icon: typeof Home;
  /** Indicatore di novità (dot arancione). Per ora hardcoded sul mock. */
  hasNotifications?: boolean;
};

const NAV: NavItem[] = [
  { href: "/", label: "Feed", icon: Home },
  { href: "/esplora", label: "Esplora", icon: Compass },
  { href: "/profile", label: "Profilo", icon: UserIcon },
  { href: "/notifiche", label: "Notifiche", icon: Bell, hasNotifications: true },
];

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function AppSidebar({ appLogoUrl }: { appLogoUrl?: string | null }) {
  const pathname = usePathname();
  const { data: user } = useSWR<UserWithProfile>("/api/user", fetcher, {
    revalidateOnFocus: false,
    revalidateOnMount: true,
    shouldRetryOnError: false,
    keepPreviousData: true,
  });

  return (
    <aside className="hidden md:flex flex-col w-60 lg:w-64 shrink-0 sticky top-0 h-screen overflow-y-auto px-4 py-6 border-r border-gc-line">
      {/* Logo dell'app — letto da app_settings.app_logo_url. Se non
          configurato, fallback testuale con "generazionecrypto" minimale. */}
      <Link href="/" className="mb-8 inline-block">
        {appLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={appLogoUrl}
            alt="Home"
            className="h-10 w-auto object-contain"
          />
        ) : (
          <span className="font-medium text-[19px] leading-[1.05] tracking-[-0.01em] text-gc-fg">
            generazione<span className="text-gc-accent">crypto</span>
          </span>
        )}
      </Link>

      {/* Nav */}
      <nav className="flex flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon, hasNotifications }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={[
                "flex items-center gap-3 px-3 py-2.5 rounded-gc-sm text-[14.5px] transition border",
                active
                  ? "bg-gc-bg-2 text-gc-fg font-semibold border-gc-line"
                  : "text-gc-fg-2 border-transparent hover:bg-gc-bg-2",
              ].join(" ")}
            >
              <Icon size={18} strokeWidth={1.6} />
              <span className="flex-1">{label}</span>
              {hasNotifications && (
                <>
                  <span
                    aria-hidden="true"
                    className="w-1.5 h-1.5 rounded-full bg-gc-accent flex-shrink-0"
                  />
                  <span className="sr-only">— nuove notifiche</span>
                </>
              )}
            </Link>
          );
        })}
      </nav>

      {/* CTA Nuova watchlist (placeholder, link/handler nel CP successivo) */}
      <button
        type="button"
        className="mt-5 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-gc-accent text-white font-medium text-sm hover:brightness-95 transition"
      >
        <Plus size={16} strokeWidth={2.5} />
        <span>Nuova watchlist</span>
      </button>

      {/* User menu in fondo (popover che si apre verso l'alto) */}
      <div className="mt-auto pt-4">
        {user ? (
          <UserMenu user={user} variant="popover" />
        ) : (
          <UserMiniCardSkeleton />
        )}
      </div>
    </aside>
  );
}

function UserMiniCardSkeleton() {
  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5">
      <div className="w-8 h-8 rounded-full bg-gc-bg-3 animate-pulse" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-20 rounded bg-gc-bg-3 animate-pulse" />
        <div className="h-2.5 w-12 rounded bg-gc-bg-3 animate-pulse" />
      </div>
    </div>
  );
}
