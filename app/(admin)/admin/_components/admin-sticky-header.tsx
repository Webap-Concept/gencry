"use client";
// app/(admin)/admin/_components/admin-sticky-header.tsx
//
// Header sticky animato per le sezioni admin con sub-tabs. Quando la
// pagina è scrollabile e l'utente scrolla in giù:
//
//   1. il blocco intero rimane attaccato al top dello scroll container
//      (`<main overflow-y-auto>` del layout admin);
//   2. icona, titolo e padding si comprimono leggermente (transition
//      200ms) per recuperare verticale;
//   3. la description fade-out + collassa via grid-rows trick
//      (animatable height, no max-height hack);
//   4. compare una sottile shadow + bottom border come affordance.
//
// Performance: position:sticky è GPU-accelerated, niente JS in
// animazione. Lo stato `isStuck` è derivato da IntersectionObserver
// (vedi `useIsStuck`) che osserva un sentinel posto SOPRA l'header —
// zero scroll listener a 60fps.
//
// Caveat scroll container: useIsStuck cerca il primo antenato con
// overflow-y auto/scroll. In admin è `<main>`. Se in futuro qualcuno
// wrappa la pagina dentro un altro overflow:auto, lo stuck si calcola
// rispetto a quello (comportamento corretto, non un bug).
//
// Pattern wrapper: i singoli *Header.tsx delle sezioni passano un
// `rightExtras` slot per i loro tooltip-info (CronAdminGuide,
// CacheAdminGuide, ecc.) che restano allineati col titolo anche
// quando l'header è in stato shrunk.
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useIsStuck } from "@/lib/hooks/use-is-stuck";
import { cn } from "@/lib/utils";
import {
  AdminSectionTabs,
  type AdminSectionTab,
} from "./admin-section-tabs";

export function AdminStickyHeader({
  icon: Icon,
  title,
  description,
  rightExtras,
  tabs,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Slot opzionale a destra del titolo (info button, badge, ecc.). */
  rightExtras?: ReactNode;
  tabs: AdminSectionTab[];
}) {
  const { sentinelRef, isStuck } = useIsStuck<HTMLDivElement>();

  return (
    // Wrapper div necessario: il layout sezione (es. posts/layout.tsx)
    // ci wrappa in `<div className="space-y-5">`, e space-y applica
    // margin-top a tutti i child tranne il primo. Se sentinel e header
    // fossero fratelli diretti del wrapper layout, lo space-y aggiungerebbe
    // 20px tra sentinel (1°) e header (2°) → buco visibile sopra l'header.
    // Wrappandoli in un div, il layout vede un solo child (questo div) e
    // dentro non c'è space-y. NON usare display:contents qui — renderebbe
    // il div trasparente al layout box tree e ricomparirebbe il bug.
    <div>
      {/* Sentinel invisibile sopra l'header. Quando esce dalla viewport
          dello scroll container → isStuck=true. */}
      <div ref={sentinelRef} aria-hidden style={{ height: 1 }} />

      <header
        className={cn(
          // Pattern sticky-overlap: `top` NEGATIVO uguale al padding
          // del <main p-4 lg:p-2>, così l'header si attacca SOPRA il
          // top del viewport (il suo top edge va dentro il padding
          // del main → il bg dell'header COPRE quel padding). Il
          // `pt-4 lg:pt-2` interno rimette il content visivo a 0.
          // Risultato: niente gap bianco sopra l'header quando stuck.
          // Se il padding del main cambia, aggiornare entrambi i
          // valori in sync qui sotto.
          "sticky -top-4 lg:-top-2 z-10",
          "-mx-4 lg:-mx-2 px-4 lg:px-2",
          "pt-4 lg:pt-2",
          "transition-shadow duration-200",
          isStuck && "shadow-sm",
        )}
        style={{
          background: "var(--admin-page-bg)",
          borderBottom: isStuck
            ? "1px solid var(--admin-card-border)"
            : "1px solid transparent",
          transition: "all 200ms ease-out",
        }}>
        <div
          className={cn(
            "flex items-center gap-3 transition-all duration-200",
            isStuck ? "py-0.5" : "py-1",
          )}>
          {/* Icon — shrink da 36px a 28px */}
          <div
            className={cn(
              "rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-200",
              isStuck ? "w-7 h-7" : "w-9 h-9",
            )}
            style={{
              background:
                "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))",
              border:
                "1px solid color-mix(in srgb, var(--admin-accent) 25%, transparent)",
            }}>
            <Icon
              size={isStuck ? 14 : 18}
              style={{
                color: "var(--admin-accent)",
                transition: "all 200ms ease-out",
              }}
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2
                className={cn(
                  "font-bold transition-all duration-200",
                  isStuck ? "text-sm" : "text-lg",
                )}
                style={{ color: "var(--admin-text)" }}>
                {title}
              </h2>
              {rightExtras}
            </div>

            {/* Description: grid-rows trick per animare height tra
                1fr (full) e 0fr (collapsed). Più clean di max-height
                arbitrario. Fade simultaneo per non avere stacco. */}
            <div
              className={cn(
                "grid transition-all duration-200",
                isStuck
                  ? "grid-rows-[0fr] opacity-0"
                  : "grid-rows-[1fr] opacity-100",
              )}>
              <p
                className="overflow-hidden text-sm"
                style={{
                  color: "var(--admin-text-faint)",
                  marginTop: isStuck ? 0 : 2,
                  transition: "margin-top 200ms ease-out",
                }}>
                {description}
              </p>
            </div>
          </div>
        </div>

        <AdminSectionTabs tabs={tabs} />
      </header>
    </div>
  );
}
