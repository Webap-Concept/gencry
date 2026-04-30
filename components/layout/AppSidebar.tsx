"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Compass,
  Home,
  MoreHorizontal,
  Plus,
  User as UserIcon,
} from "lucide-react";
import useSWR, { mutate } from "swr";
import { signOut } from "@/app/(login)/actions";
import { Avatar } from "@/components/shared/Avatar";
import type { UserWithProfile } from "@/lib/db/schema";
import { fullName } from "@/lib/utils";

// Sidebar fissa della home loggata. Visibile da md in su; su mobile la
// navigazione passa al bottom-nav (vedi AppBottomNav).

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
  { href: "/profilo", label: "Profilo", icon: UserIcon },
  { href: "/notifiche", label: "Notifiche", icon: Bell, hasNotifications: true },
];

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function AppSidebar() {
  const pathname = usePathname();
  const { data: user } = useSWR<UserWithProfile>("/api/user", fetcher, {
    revalidateOnFocus: false,
    revalidateOnMount: true,
    shouldRetryOnError: false,
    keepPreviousData: true,
  });

  return (
    <aside className="hidden md:flex flex-col w-60 lg:w-64 shrink-0 sticky top-0 h-screen px-4 py-6 border-r border-gc-line">
      {/* Logo */}
      <Link href="/" className="mb-8 inline-block">
        <div className="font-medium text-[19px] leading-[1.05] tracking-[-0.01em] text-gc-fg">
          generazione
          <br />
          <span className="text-gc-accent">crypto</span>
        </div>
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

      {/* User mini-card in fondo */}
      <div className="mt-auto pt-4">
        {user ? <UserMiniCard user={user} /> : <UserMiniCardSkeleton />}
      </div>
    </aside>
  );
}

function UserMiniCard({ user }: { user: UserWithProfile }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Click fuori → chiudi menu
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ESC chiude il menu (a11y tastiera)
  useEffect(() => {
    if (!open) return;
    function escHandler(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", escHandler);
    return () => document.removeEventListener("keydown", escHandler);
  }, [open]);

  // Avatar usa la shape User condivisa: ricostruisco da UserWithProfile.
  const initial = (user.firstName?.[0] ?? "U").toUpperCase();
  const avatarUser = {
    handle: "tu",
    name: fullName(user),
    avatar: initial,
    color: "#5c5146",
    followers: 0,
    bio: "",
  };

  async function handleSignOut() {
    await signOut();
    mutate("/api/user");
    window.location.href = "/";
  }

  return (
    <div
      ref={ref}
      className="relative flex items-center gap-2.5 px-2 py-1.5 rounded-gc-sm hover:bg-gc-bg-2 transition"
    >
      <Avatar user={avatarUser} size={32} />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-gc-fg truncate">
          {fullName(user)}
        </div>
        <div className="text-[11.5px] text-gc-fg-3 font-mono truncate">
          @tu
        </div>
      </div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-gc-fg-3 hover:text-gc-fg transition p-1 rounded"
        aria-label="Menu utente"
        aria-expanded={open}
      >
        <MoreHorizontal size={18} strokeWidth={1.75} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-2 bg-gc-bg-2 border border-gc-line rounded-gc-sm shadow-lg py-1 z-10">
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full text-left px-3 py-2 text-sm text-gc-neg hover:bg-gc-bg-3 transition"
          >
            Esci
          </button>
        </div>
      )}
    </div>
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
