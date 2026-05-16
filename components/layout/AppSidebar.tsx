"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Bell,
  Compass,
  Home,
  User as UserIcon,
} from "lucide-react";
import useSWR from "swr";
import { NotificationsSheet } from "@/components/layout/NotificationsSheet";
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
  labelKey: "feed" | "explore" | "profile";
  icon: typeof Home;
  /** Indicatore di novità (dot arancione). Per ora hardcoded sul mock. */
  hasNotifications?: boolean;
};

const NAV: NavItem[] = [
  { href: "/", labelKey: "feed", icon: Home },
  { href: "/explore", labelKey: "explore", icon: Compass },
  { href: "/profile", labelKey: "profile", icon: UserIcon },
];

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function AppSidebar({ appLogoUrl }: { appLogoUrl?: string | null }) {
  const pathname = usePathname();
  const t = useTranslations("core.sidebar");
  const { data: user } = useSWR<UserWithProfile>("/api/user", fetcher, {
    revalidateOnFocus: false,
    revalidateOnMount: true,
    shouldRetryOnError: false,
    keepPreviousData: true,
  });

  return (
    <aside className="hidden md:flex flex-col w-60 lg:w-64 shrink-0 h-full px-4 py-6 border-r border-gc-line">
      {/* Header sidebar: logo + bell. shrink-0 → sempre visibile in alto. */}
      <div className="shrink-0 mb-6 flex items-center justify-between gap-2">
        <Link href="/" prefetch={false} className="inline-flex items-center min-w-0">
          {appLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={appLogoUrl}
              alt="Home"
              className="h-16 w-auto object-contain"
            />
          ) : (
            <span className="font-medium text-[19px] leading-[1.05] tracking-[-0.01em] text-gc-fg">
              generazione<span className="text-gc-accent">crypto</span>
            </span>
          )}
        </Link>
        <NotificationsSheet>
          <button
            type="button"
            aria-label={t("notifications")}
            className="relative shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-gc-fg-2 hover:bg-gc-bg-2 hover:text-gc-fg transition"
          >
            <Bell size={18} strokeWidth={1.6} />
            <span
              aria-hidden="true"
              className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-gc-accent ring-2 ring-gc-bg"
            />
            <span className="sr-only">{t("newNotifications")}</span>
          </button>
        </NotificationsSheet>
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
