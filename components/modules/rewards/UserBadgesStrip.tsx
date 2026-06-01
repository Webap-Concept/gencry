// components/modules/rewards/UserBadgesStrip.tsx
//
// "Bacheca badge" del profilo: badge attivi di un utente (acquistati dal
// catalogo GCC o di sistema). RSC self-contained: fetcha i propri dati.
// Caricato SOLO via dynamic import guardato da isModuleInstalled("rewards")
// nella profile page → se il modulo viene rimosso, niente import rotto.
//
// Design: titolo a sinistra + icone TONDE grandi solo-icona allineate a
// destra. Tooltip CSS-only (RSC-safe) col solo nome; hover = lieve lift+zoom.
import { getUserActiveBadges } from "@/lib/modules/rewards/catalog-queries";

export default async function UserBadgesStrip({ userId }: { userId: string }) {
  const badges = await getUserActiveBadges(userId);
  if (badges.length === 0) return null;

  return (
    <section className="mt-4 flex items-center justify-between gap-4">
      <h2 className="shrink-0 text-base font-serif text-gc-fg">
        Bacheca <span className="italic text-gc-accent">badge</span>
      </h2>
      <div className="flex flex-wrap items-center justify-end gap-2.5">
        {badges.map((b) => {
          const cat = b.catalog;
          const label = cat?.label ?? b.badgeSlug;
          const bg = cat?.iconBg ?? "#888";
          return (
            <div key={b.id} className="group relative">
              {/* Icona tonda grande, solo icona, centrata ~60% (icona
                  trasparente → il colore iconBg riempie il badge). */}
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden ring-2 ring-gc-line shadow-md transition-transform duration-200 ease-out group-hover:-translate-y-1 group-hover:scale-105"
                style={{ background: bg }}
              >
                {cat?.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cat.iconUrl} alt={label} className="w-3/5 h-3/5 object-contain" />
                ) : (
                  <span className="text-white text-lg font-bold">
                    {label.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>

              {/* Tooltip CSS-only: solo il nome del badge */}
              <div
                role="tooltip"
                className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-lg group-hover:block"
                style={{ background: "#0e2318" }}
              >
                {label}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
