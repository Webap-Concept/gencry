"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Bell, Bookmark, Radar, Zap } from "lucide-react";
import { NewPostButton } from "@/components/modules/posts/NewPostButton";

// Bottom nav mobile. Visibile <md, pattern social classico:
// 5 slot con il "+" centrale enfatizzato (CTA Nuovo post).
//   feed · explore · +post · watchlist · notifiche
// Il profilo NON sta qui: si raggiunge dall'avatar nella topbar.
// Le notifiche (bell) hanno il badge unread realtime, server-rendered
// e passato come prop (modulo-agnostico, come nella sidebar).

type LinkSlot = {
  href: string;
  /** Chiave i18n nel namespace `core.bottomNav.<labelKey>`. */
  labelKey: "feed" | "explore" | "watchlist" | "notifications";
  icon: typeof Zap;
};

// `null` = slot del bottone +Nuovo post (centrale, non navigabile).
const SLOTS: (LinkSlot | null)[] = [
  { href: "/", labelKey: "feed", icon: Zap },
  { href: "/explore", labelKey: "explore", icon: Radar },
  null,
  { href: "/watchlist", labelKey: "watchlist", icon: Bookmark },
  { href: "/notifiche", labelKey: "notifications", icon: Bell },
];

export function AppBottomNav({
  notificationsBadge,
}: {
  /** Badge unread server-rendered del modulo notifications, posizionato
   *  sull'icona bell. ReactNode opaco per tenere la nav modulo-agnostica. */
  notificationsBadge?: React.ReactNode;
}) {
  const pathname = usePathname();
  const t = useTranslations("core.bottomNav");

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
        const isNotifications = labelKey === "notifications";
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
            <span className="relative">
              <Icon size={20} strokeWidth={1.75} />
              {isNotifications && notificationsBadge ? (
                <span className="absolute -top-1.5 -right-2 pointer-events-none">
                  {notificationsBadge}
                </span>
              ) : null}
            </span>
            <span className="text-[10.5px] font-medium">{t(labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
