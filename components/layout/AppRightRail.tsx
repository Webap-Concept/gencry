import { Suspense } from "react";
import { resolveSlot } from "@/lib/home/registry";
import type { HomeSection } from "@/lib/home/types";
import { SlotBoundary } from "@/components/feed/SlotBoundary";
import { RailLegalFooter } from "./RailLegalFooter";

// Right rail della home loggata. Compone le sezioni registrate negli
// slot `home.rail.*` — vedi project_home_slot_registry.md.
//
// IMPORTANTE: niente `h-screen` né `overflow-y-auto` sull'aside. Il
// rail flue con la pagina (una sola scrollbar — pattern Twitter web)
// e si "taglia" naturalmente quando il contenuto della colonna
// centrale è più alto del rail.
//
// Quando un modulo vuole mettere una propria card nel rail (es.
// "trending coins" del modulo prices), registra la sua sezione su
// `home.rail.top/middle/bottom` — il rail la prende su senza modifiche
// a questo file.

export async function AppRightRail({
  /** Mostra in fondo al rail il mini-footer con link legali +
   *  "Pubblicità". Attivo per gli utenti loggati che NON vedono il
   *  PublicFooter sotto (ProtectedShell è full-height). Default false
   *  così i layout pubblici anonimi non duplicano il footer. */
  showLegalFooter = false,
}: {
  showLegalFooter?: boolean;
} = {}) {
  const [top, middle, bottom] = await Promise.all([
    resolveSlot("home.rail.top"),
    resolveSlot("home.rail.middle"),
    resolveSlot("home.rail.bottom"),
  ]);

  // Rail SEMPRE renderizzato (anche vuoto) per stabilità del layout
  // 3-colonne. Quando un modulo registra una sezione `home.rail.*`,
  // si "incolla" qui senza far saltare il layout. Quando il rail è
  // vuoto, l'aside resta visivamente trasparente (no border, no bg)
  // occupando solo lo spazio.
  return (
    <aside className="hidden lg:flex flex-col shrink-0 w-72 h-full overflow-y-auto py-6 pl-6 pr-4 gap-4">
      {top.map((s) => (
        <SlotBoundary key={s.key} sectionKey={s.key}>
          <Suspense fallback={<s.Skeleton />}>
            <SectionRenderer section={s} />
          </Suspense>
        </SlotBoundary>
      ))}
      {middle.map((s) => (
        <SlotBoundary key={s.key} sectionKey={s.key}>
          <Suspense fallback={<s.Skeleton />}>
            <SectionRenderer section={s} />
          </Suspense>
        </SlotBoundary>
      ))}
      {bottom.map((s) => (
        <SlotBoundary key={s.key} sectionKey={s.key}>
          <SectionRenderer section={s} />
        </SlotBoundary>
      ))}
      {showLegalFooter && (
        <Suspense fallback={null}>
          <RailLegalFooter />
        </Suspense>
      )}
    </aside>
  );
}

async function SectionRenderer({ section }: { section: HomeSection }) {
  return await section.Component();
}
