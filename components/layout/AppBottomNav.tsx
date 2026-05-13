"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Compass, Home, Plus, User as UserIcon } from "lucide-react";

// Bottom nav mobile. Visibile <md, pattern social classico:
// 5 slot con il "+" centrale enfatizzato (CTA Nuova watchlist).

type LinkSlot = {
  href: string;
  label: string;
  icon: typeof Home;
};

// `null` = slot del bottone +Nuova watchlist (centrale, non navigabile)
const SLOTS: (LinkSlot | null)[] = [
  { href: "/", label: "Feed", icon: Home },
  { href: "/explore", label: "Explore", icon: Compass },
  null,
  { href: "/notifiche", label: "Notifiche", icon: Bell },
  { href: "/profile", label: "Profilo", icon: UserIcon },
];

export function AppBottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navigazione principale"
      // z-30 (NAV layer di lib/ui/z-index.ts): sopra il main ma sotto
      // modali/drawer (z-50). Prima era z-50 e si sovrapponeva al
      // shadcn Sheet drawer.
      className="md:hidden fixed bottom-0 inset-x-0 z-30 h-16 bg-gc-bg-2 border-t border-gc-line flex items-center justify-around px-2"
    >
      {SLOTS.map((slot) => {
        if (!slot) {
          return (
            <button
              key="new-watchlist"
              type="button"
              aria-label="Nuova watchlist"
              className="w-12 h-12 rounded-full bg-gc-accent text-white flex items-center justify-center -mt-3 shadow-md hover:brightness-95 transition"
            >
              <Plus size={22} strokeWidth={2.5} />
            </button>
          );
        }
        const { href, label, icon: Icon } = slot;
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            prefetch={false}
            aria-current={active ? "page" : undefined}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 transition ${
              active ? "text-gc-accent" : "text-gc-fg-3 hover:text-gc-fg"
            }`}
          >
            <Icon size={20} strokeWidth={1.75} />
            <span className="text-[10.5px] font-medium">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
