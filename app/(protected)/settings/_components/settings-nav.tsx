"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock, Shield, User as UserIcon, ScrollText } from "lucide-react";

const TABS = [
  { href: "/settings/profile", label: "Profilo", icon: UserIcon },
  { href: "/settings/account", label: "Account", icon: Lock },
  { href: "/settings/security", label: "Sicurezza", icon: Shield },
  { href: "/settings/privacy", label: "Privacy", icon: ScrollText },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    // La line di separazione vive sul wrapper relative, NON sul nav: con
    // `overflow-x-auto` sul nav i pixel out-of-bounds vengono clippati
    // (il border-b-2 attivo "spariva" finché lo scroll non forzava un
    // repaint). Tenendo border-b sul wrapper esterno e border-b-2 dentro
    // il content area del Link, niente esce mai dal nav.
    <div className="relative border-b border-gc-line">
      <nav
        aria-label="Sezioni impostazioni"
        className="flex gap-1 overflow-x-auto -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={[
                "inline-flex items-center gap-2 px-3 py-2.5 text-[13.5px] font-medium whitespace-nowrap border-b-2 transition",
                active
                  ? "text-gc-fg border-gc-accent"
                  : "text-gc-fg-3 border-transparent hover:text-gc-fg",
              ].join(" ")}
            >
              <Icon size={15} strokeWidth={1.7} />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
