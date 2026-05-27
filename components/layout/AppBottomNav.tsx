"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import useSWR from "swr";
import { Bell, Radar, User as UserIcon, Zap } from "lucide-react";
import { NewPostButton } from "@/components/modules/posts/NewPostButton";
import type { UserWithProfile } from "@/lib/db/schema";

// Bottom nav mobile. Visibile <md, pattern social classico:
// 5 slot con il "+" centrale enfatizzato (CTA Nuovo post).

type LinkSlot = {
  href: string;
  /** Chiave i18n nel namespace `core.bottomNav.<labelKey>`. */
  labelKey: "feed" | "explore" | "notifications" | "profile";
  icon: typeof Zap;
};

// La voce "Profilo" e' dinamica (href dipende dallo username dell'utente
// loggato). `null` = slot del bottone +Nuovo post (centrale, non navigabile).
const STATIC_SLOTS: (LinkSlot | null)[] = [
  { href: "/", labelKey: "feed", icon: Zap },
  { href: "/explore", labelKey: "explore", icon: Radar },
  null,
  { href: "/notifiche", labelKey: "notifications", icon: Bell },
];

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function AppBottomNav() {
  const pathname = usePathname();
  const t = useTranslations("core.bottomNav");
  const { data: user } = useSWR<UserWithProfile>("/api/user", fetcher, {
    revalidateOnFocus: false,
    revalidateOnMount: true,
    shouldRetryOnError: false,
    keepPreviousData: true,
  });

  // Profilo: /u/<username> dinamico. Fallback a /settings/profile.
  const profileHref = user?.username
    ? `/u/${user.username}`
    : "/settings/profile";
  const SLOTS: (LinkSlot | null)[] = [
    ...STATIC_SLOTS,
    { href: profileHref, labelKey: "profile", icon: UserIcon },
  ];
  return (
    <nav
      aria-label={t("ariaLabel")}
      // z-30 (NAV layer di lib/ui/z-index.ts): sopra il main ma sotto
      // modali/drawer (z-50). Prima era z-50 e si sovrapponeva al
      // shadcn Sheet drawer.
      className="md:hidden fixed bottom-0 inset-x-0 z-30 h-16 bg-gc-bg-2 border-t border-gc-line flex items-center justify-around px-2"
    >
      {SLOTS.map((slot) => {
        if (!slot) {
          return <NewPostButton key="new-post" variant="fab" />;
        }
        const { href, labelKey, icon: Icon } = slot;
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
            <span className="text-[10.5px] font-medium">{t(labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
