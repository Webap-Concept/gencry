"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import useSWR from "swr";
import { Bell } from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { UserMenu } from "@/components/layout/UserMenu";
import type { UserWithProfile } from "@/lib/db/schema";

// Topbar visibile <md (mobile/tablet stretto). Stile alla Twitter:
// logo a sinistra, bell notifiche + avatar a destra (l'avatar apre un
// bottom-sheet col menu utente). La AppSidebar resta autoritativa su md+.
//
// La bell vive QUI su mobile (non nel bottom nav, dove lo slot e' della
// watchlist). Il badge unread realtime e' server-rendered + passato come
// prop dal ProtectedShell (stesso pattern della sidebar, modulo-agnostico).

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function AppTopBar({
  notificationsBadge,
}: {
  /** Badge unread server-rendered del modulo notifications. Reso come
   *  ReactNode opaco per tenere la topbar agnostica al modulo. */
  notificationsBadge?: React.ReactNode;
}) {
  const t = useTranslations("core.shell");
  const tNav = useTranslations("core.bottomNav");
  const { data: user } = useSWR<UserWithProfile>("/api/user", fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  return (
    // z-30 (NAV layer di lib/ui/z-index.ts): sotto banner (z-40) e modali (z-50).
    <header className="md:hidden sticky top-0 z-30 h-14 bg-gc-bg/90 backdrop-blur border-b border-gc-line flex items-center justify-between px-4">
      <Link
        href="/"
        prefetch={false}
        className="font-medium text-[16px] leading-[1.05] tracking-[-0.01em] text-gc-fg"
      >
        generazione<span className="text-gc-accent">crypto</span>
      </Link>

      {user ? (
        <div className="flex items-center gap-1">
          <Link
            href="/notifiche"
            prefetch={false}
            aria-label={tNav("notifications")}
            className="relative inline-flex items-center justify-center w-9 h-9 rounded-full text-gc-fg-2 hover:bg-gc-bg-3 hover:text-gc-fg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gc-accent"
          >
            <Bell size={20} strokeWidth={1.75} aria-hidden />
            {/* Badge unread: posizionato in alto a destra della bell.
                pointer-events-none così il click va sempre al Link. */}
            <span className="absolute -top-0.5 -right-0.5 pointer-events-none">
              {notificationsBadge}
            </span>
          </Link>
          <UserMenu
            user={user}
            variant="sheet"
            trigger={(open, toggle) => (
              <button
                type="button"
                onClick={toggle}
                aria-label={t("openUserMenu")}
                aria-expanded={open}
                className="rounded-full focus:outline-none focus:ring-2 focus:ring-gc-accent"
              >
                <UserAvatar
                  user={{
                    id: user.id,
                    username: user.username,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email,
                    avatarUrl: user.avatarUrl,
                  }}
                  size={32}
                />
              </button>
            )}
          />
        </div>
      ) : (
        <div className="w-8 h-8 rounded-full bg-gc-bg-3 animate-pulse" />
      )}
    </header>
  );
}
