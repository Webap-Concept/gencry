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
import Link from "next/link";
import { usePathname } from "next/navigation";

export type AdminSectionTab = {
  /** Path assoluto con slug runtime, es. `/admin/content/pages`. */
  href: string;
  label: string;
  /** Se true, attivo solo su pathname === href (utile per voci-root
   *  di sezione che altrimenti resterebbero attive anche su sub-route). */
  exact?: boolean;
};

export function AdminSectionTabs({ tabs }: { tabs: AdminSectionTab[] }) {
  const pathname = usePathname();

  return (
    <nav
      className="mt-4 flex gap-1 border-b"
      style={{ borderColor: "var(--admin-card-border)" }}
      aria-label="Sezioni">
      {tabs.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="group relative px-3 py-2 text-sm transition-colors hover:text-[var(--admin-accent)]"
            style={{
              color: active ? "var(--admin-accent)" : "var(--admin-text-muted)",
            }}
            aria-current={active ? "page" : undefined}>
            {tab.label}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-3 right-3 -bottom-px h-[2px] rounded-full transition-colors group-hover:bg-[var(--admin-accent)]"
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
