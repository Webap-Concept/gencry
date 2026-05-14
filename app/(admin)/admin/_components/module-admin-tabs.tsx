"use client";
// app/(admin)/admin/_components/module-admin-tabs.tsx
//
// Tab navigator riusabile per gli header dei moduli admin. Ogni modulo
// (prices, posts, ecc.) registra qui le proprie sezioni interne; le
// tabs servono come navigazione SECONDARIA in-section, in più ai link
// della sidebar admin.
//
// Active state derivato da `usePathname()`. Hover/active = accent
// arancio del theme admin (border-bottom + text color).
//
// Pre-req: i `href` arrivano DEJA pre-composti con lo slug admin
// runtime (es. `/${slug}/modules/posts/settings`). Il server header
// del modulo chiama `getAdminUrlSlug()` e costruisce gli href; questo
// component è puro presentational.
import Link from "next/link";
import { usePathname } from "next/navigation";

export type ModuleTab = {
  /** Path assoluto con slug runtime, es. `/admin/modules/posts`. */
  href: string;
  label: string;
  /** Se true, attivo solo su pathname === href (utile per "Overview"
   *  che altrimenti resterebbe attivo anche su /settings).            */
  exact?: boolean;
};

export function ModuleAdminTabs({ tabs }: { tabs: ModuleTab[] }) {
  const pathname = usePathname();

  return (
    <nav
      className="mt-4 flex gap-1 border-b"
      style={{ borderColor: "var(--admin-card-border)" }}
      aria-label="Sezioni modulo"
    >
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
            aria-current={active ? "page" : undefined}
          >
            {tab.label}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-3 right-3 -bottom-px h-[2px] rounded-full transition-colors group-hover:bg-[var(--admin-accent)]"
              style={{
                backgroundColor: active
                  ? "var(--admin-accent)"
                  : "transparent",
              }}
            />
          </Link>
        );
      })}
    </nav>
  );
}
