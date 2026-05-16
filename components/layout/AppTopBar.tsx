"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import useSWR from "swr";
import { Avatar } from "@/components/shared/Avatar";
import { UserMenu } from "@/components/layout/UserMenu";
import type { UserWithProfile } from "@/lib/db/schema";
import { fullName } from "@/lib/utils";

// Topbar visibile <md (mobile/tablet stretto). Stile alla Twitter:
// logo a sinistra, avatar a destra che apre un bottom-sheet con il menu utente.
// La AppSidebar resta autoritativa su md+.

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function AppTopBar() {
  const t = useTranslations("core.shell");
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
              <Avatar
                user={{
                  handle: user.username ?? "",
                  name: fullName(user),
                  avatar: (user.firstName?.[0] ?? user.email[0] ?? "U").toUpperCase(),
                  color: "#5c5146",
                  followers: 0,
                  bio: "",
                  avatarUrl: user.avatarUrl,
                }}
                size={32}
              />
            </button>
          )}
        />
      ) : (
        <div className="w-8 h-8 rounded-full bg-gc-bg-3 animate-pulse" />
      )}
    </header>
  );
}
