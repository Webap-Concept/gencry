// components/modules/rewards/UserBadgesStrip.tsx
//
// Striscia dei badge attivi di un utente (acquistati dal catalogo GCC o di
// sistema), per il profilo pubblico. RSC self-contained: fetcha i propri dati.
// Caricato SOLO via dynamic import guardato da isModuleInstalled("rewards")
// nella profile page → se il modulo viene rimosso, niente import rotto.
//
// Design: icone TONDE, grandi, solo-icona, allineate a destra. Tooltip CSS-only
// (RSC-safe, niente JS) con label + stato; hover = lieve lift + zoom.
import { getUserActiveBadges } from "@/lib/modules/rewards/catalog-queries";

export default async function UserBadgesStrip({ userId }: { userId: string }) {
  const badges = await getUserActiveBadges(userId);
  if (badges.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center justify-end gap-2.5">
      {badges.map((b) => {
        const cat = b.catalog;
        const label = cat?.label ?? b.badgeSlug;
        const bg = cat?.iconBg ?? "#888";
        const status = b.source === "purchase" ? "Acquistato" : "Ottenuto";
        return (
          <div key={b.id} className="group relative">
            {/* Icona tonda grande, solo icona */}
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden ring-2 ring-gc-line shadow-md transition-transform duration-200 ease-out group-hover:-translate-y-1 group-hover:scale-105"
              style={{ background: bg }}
            >
              {cat?.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                // ~60% centrata: se l'icona è trasparente il colore iconBg si
                // vede tutt'intorno (icona "dal centro").
                <img src={cat.iconUrl} alt={label} className="w-3/5 h-3/5 object-contain" />
              ) : (
                <span className="text-white text-lg font-bold">
                  {label.charAt(0).toUpperCase()}
                </span>
              )}
            </div>

            {/* Tooltip CSS-only: appare sopra l'icona al mouseover */}
            <div
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg px-3 py-1.5 text-center shadow-lg group-hover:block"
              style={{ background: "#0e2318" }}
            >
              <span className="block text-xs font-semibold text-white">{label}</span>
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-orange-300">
                {status}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
