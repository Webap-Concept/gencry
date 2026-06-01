// components/modules/rewards/UserBadgesStrip.tsx
//
// Striscia dei badge attivi di un utente (acquistati dal catalogo GCC o di
// sistema), per il profilo pubblico. RSC self-contained: fetcha i propri dati.
// Caricato SOLO via dynamic import guardato da isModuleInstalled("rewards")
// nella profile page → se il modulo viene rimosso, niente import rotto.
import { getUserActiveBadges } from "@/lib/modules/rewards/catalog-queries";

export default async function UserBadgesStrip({ userId }: { userId: string }) {
  const badges = await getUserActiveBadges(userId);
  if (badges.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap justify-end gap-1.5">
      {badges.map((b) => {
        const cat = b.catalog;
        const label = cat?.label ?? b.badgeSlug;
        const bg = cat?.iconBg ?? "#888";
        return (
          <span
            key={b.id}
            title={cat?.description ?? label}
            className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-gc-bg-3 text-xs font-medium text-gc-fg"
          >
            <span
              className="w-4 h-4 rounded-md flex items-center justify-center overflow-hidden shrink-0 text-[9px] font-bold text-white"
              style={{ background: bg }}
            >
              {cat?.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cat.iconUrl} alt="" className="w-full h-full object-contain" />
              ) : (
                label.charAt(0).toUpperCase()
              )}
            </span>
            {label}
          </span>
        );
      })}
    </div>
  );
}
