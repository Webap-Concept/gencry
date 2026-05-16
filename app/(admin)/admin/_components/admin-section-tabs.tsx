"use client";
// app/(admin)/admin/_components/admin-section-tabs.tsx
//
// Tab navigator riusabile per gli header delle sezioni admin (sia core,
// sia moduli installati). Ogni parent section costruisce la propria
// lista di tab — i child accessibili dalla sidebar — e la passa qui.
// Active state derivato da `usePathname()`. Hover/active = accent
// arancio del theme admin (border-bottom + text color).
//
// Pre-req: gli `href` arrivano DEJA pre-composti con lo slug admin
// runtime (es. `/${slug}/content/pages`). Il caller server-side
// chiama `getAdminUrlSlug()` (o `getSectionTabs()` in lib/admin-nav)
// e costruisce gli href; questo component è puro presentational.
import { getNavIcon } from "@/lib/admin/nav/icon-map";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type AdminSectionTab = {
  /** Path assoluto con slug runtime, es. `/admin/content/pages`. */
  href: string;
  label: string;
  /** Se true, attivo solo su pathname === href (utile per voci-root
   *  di sezione che altrimenti resterebbero attive anche su sub-route). */
  exact?: boolean;
  /** Nome icona Lucide (chiave NAV_ICON_MAP). Renderizzata solo su
   *  desktop (lg+) prima del label. */
  iconName?: string;
};

export function AdminSectionTabs({ tabs }: { tabs: AdminSectionTab[] }) {
  const pathname = usePathname();

  return (
    <nav
      // overflow-x-auto: su mobile con molte tabs (es. Posts ha 6)
      // si scorre orizzontalmente invece di wrappare o uscire dallo
      // schermo. Scrollbar nascosta inline (no plugin tailwind).
      className="mt-2 flex gap-0.5 sm:gap-1 border-b overflow-x-auto flex-nowrap"
      style={{
        borderColor: "var(--admin-card-border)",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}
      aria-label="Sezioni">
      <style>{`nav[aria-label="Sezioni"]::-webkit-scrollbar{display:none;}`}</style>
      {tabs.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(tab.href + "/");
        const Icon = tab.iconName ? getNavIcon(tab.iconName) : null;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="group relative px-2 sm:px-3 py-2 text-xs sm:text-sm transition-colors hover:text-[var(--admin-accent)] whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
            style={{
              color: active ? "var(--admin-accent)" : "var(--admin-text-muted)",
            }}
            aria-current={active ? "page" : undefined}>
            {/* Icona solo da lg in su — mobile/tablet vincono leggibilità */}
            {Icon ? <Icon size={14} className="hidden lg:inline-block shrink-0" /> : null}
            {tab.label}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-2 sm:left-3 right-2 sm:right-3 -bottom-px h-[2px] rounded-full transition-colors group-hover:bg-[var(--admin-accent)]"
              style={{
                backgroundColor: active ? "var(--admin-accent)" : "transparent",
              }}
            />
          </Link>
        );
      })}
    </nav>
  );
}
