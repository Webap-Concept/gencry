"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Bell,
  Bookmark,
  Radar,
  User as UserIcon,
  Zap,
} from "lucide-react";
import useSWR from "swr";
import { AppLogo } from "@/components/layout/AppLogo";
import { UserMenu } from "@/components/layout/UserMenu";
import { NewPostButton } from "@/components/modules/posts/NewPostButton";
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
  /** Chiave i18n nel namespace `core.sidebar.nav.<labelKey>`. */
  labelKey: "feed" | "explore" | "watchlist" | "profile";
  icon: typeof Zap;
  /** Indicatore di novità (dot arancione). Per ora hardcoded sul mock. */
  hasNotifications?: boolean;
};

// Voci statiche (no dipendenza da username). La voce "Profilo" viene
// aggiunta dinamicamente nel componente perche' l'href dipende dallo
// username dell'utente loggato (/u/<username>). Vecchio /profile era
// un redirect-only page.tsx che ha causato InvariantError Next 16
// (manifest mancante) — ora sostituito da route handler ma evitiamo
// comunque l'hop per cleaner UX + niente client-nav cross-route.
const NAV_STATIC: NavItem[] = [
  { href: "/", labelKey: "feed", icon: Zap },
  { href: "/explore", labelKey: "explore", icon: Radar },
  { href: "/watchlist", labelKey: "watchlist", icon: Bookmark },
];

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function AppSidebar({
  appLogoUrl,
  appLogoVariantUrl,
  notificationsBadge,
}: {
  appLogoUrl?: string | null;
  /** Logo per modalità dark — caricato in admin come `app_logo_variant_url`.
   *  Null → fallback al logo principale anche in dark. */
  appLogoVariantUrl?: string | null;
  /** Badge unread server-rendered dal modulo notifications. Se null
   *  (modulo non installato o nessun unread) la bell appare senza pill. */
  notificationsBadge?: React.ReactNode;
}) {
  const pathname = usePathname();
  const t = useTranslations("core.sidebar");
  const { data: user } = useSWR<UserWithProfile>("/api/user", fetcher, {
    revalidateOnFocus: false,
    revalidateOnMount: true,
    shouldRetryOnError: false,
    keepPreviousData: true,
  });

  // Profilo: href dinamico → /u/<username>. Fallback a /settings/profile
  // se l'utente non ha username (raro: pre-onboarding) o SWR non ha
  // ancora risposto.
  const profileHref = user?.username
    ? `/u/${user.username}`
    : "/settings/profile";
  const NAV: NavItem[] = [
    ...NAV_STATIC,
    { href: profileHref, labelKey: "profile", icon: UserIcon },
  ];

  return (
    <aside className="hidden md:flex flex-col w-60 lg:w-64 shrink-0 h-full px-4 py-6 border-r border-gc-line">
      {/* Header sidebar: logo + bell. shrink-0 → sempre visibile in alto. */}
      <div className="shrink-0 mb-6 flex items-center justify-between gap-2">
        <Link href="/" prefetch={false} className="inline-flex items-center min-w-0">
          {appLogoUrl ? (
            <AppLogo
              url={appLogoUrl}
              variantUrl={appLogoVariantUrl ?? null}
              alt="Home"
              className="h-16 w-auto object-contain"
            />
          ) : (
            <span className="font-medium text-[19px] leading-[1.05] tracking-[-0.01em] text-gc-fg">
              generazione<span className="text-gc-accent">crypto</span>
            </span>
          )}
        </Link>
        {/* Bell → naviga DIRETTAMENTE alla page /notifiche (lista live
            del modulo notifications). Il drawer mockup precedente è
            rimosso: avere 2 UI da sincronizzare (drawer + page) con
            realtime subscribe duplicate è uno sforzo che non aggiunge
            valore finché non vogliamo un quick-view in stile Twitter.
            Quando lo vorremo, riaggiungere un <Sheet> con dentro un
            <NotificationsList> in modalità "compact". */}
        <Link
          href="/notifiche"
          prefetch={false}
          aria-label={t("notifications")}
          className="relative shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-gc-fg-2 hover:bg-gc-bg-2 hover:text-gc-fg transition"
        >
          <Bell size={18} strokeWidth={1.6} />
          {/* Badge unread real-time del modulo notifications. Reso null
              dal componente quando count <= 0. */}
          <span className="absolute -top-1 -right-1 pointer-events-none">
            {notificationsBadge}
          </span>
          <span className="sr-only">{t("newNotifications")}</span>
        </Link>
      </div>

      {/* Blocco scrollabile interno: nav + CTA. Scrolla SOLO se eccede
          (con la nav attuale a 3 voci, mai). Avatar sotto resta sempre
          visibile fuori da questo blocco. */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <nav className="flex flex-col gap-1">
          {NAV.map(({ href, labelKey, icon: Icon, hasNotifications }) => {
            const active =
              href === "/"
                ? pathname === "/"
                : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                prefetch={false}
                className={[
                  "flex items-center gap-3 px-3 py-2.5 rounded-full text-[14.5px] transition border",
                  active
                    ? "bg-gc-bg-2 text-gc-fg font-semibold border-gc-line"
                    : "text-gc-fg-2 border-transparent hover:bg-gc-bg-2",
                ].join(" ")}
              >
                <Icon size={18} strokeWidth={1.6} />
                <span className="flex-1">{t(`nav.${labelKey}`)}</span>
                {hasNotifications && (
                  <>
                    <span
                      aria-hidden="true"
                      className="w-1.5 h-1.5 rounded-full bg-gc-accent flex-shrink-0"
                    />
                    <span className="sr-only">{t("newNotifications")}</span>
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        <NewPostButton variant="sidebar" />
      </div>

      {/* User menu in fondo — fuori dal blocco scrollabile, sempre
          visibile anche se la nav cresce. */}
      <div className="shrink-0 pt-4">
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
    <div className="flex items-center gap-3 px-2 py-1.5">
      <div className="w-10 h-10 rounded-full bg-gc-bg-3 animate-pulse shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-20 rounded bg-gc-bg-3 animate-pulse" />
        <div className="h-2.5 w-12 rounded bg-gc-bg-3 animate-pulse" />
        <div className="h-2.5 w-24 rounded bg-gc-bg-3 animate-pulse" />
      </div>
    </div>
  );
}
