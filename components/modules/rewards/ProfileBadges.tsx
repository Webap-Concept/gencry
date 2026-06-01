"use client";
// components/modules/rewards/ProfileBadges.tsx
//
// Render client della "Bacheca badge" del profilo. Usa il Tooltip condiviso
// (components/ui/tooltip) → eredita lo sfondo verde del tema (bg-gc-fg) + la
// freccetta. I dati arrivano serializzati dal RSC UserBadgesStrip.
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface ProfileBadgeItem {
  id: string;
  label: string;
  iconUrl: string | null;
  iconBg: string | null;
}

export function ProfileBadges({ items }: { items: ProfileBadgeItem[] }) {
  return (
    <section className="mt-4 flex items-center justify-between gap-4">
      <h2 className="shrink-0 text-base font-serif text-gc-fg">
        Bacheca <span className="italic text-gc-accent">badge</span>
      </h2>
      <TooltipProvider delayDuration={100}>
        <div className="flex flex-wrap items-center justify-end gap-2.5">
          {items.map((b) => (
            <Tooltip key={b.id}>
              <TooltipTrigger asChild>
                {/* Icona tonda grande, solo icona, centrata ~60% (icona
                    trasparente → il colore iconBg riempie il badge).
                    Hover: lieve lift + zoom. */}
                <div
                  className="flex h-12 w-12 cursor-default items-center justify-center overflow-hidden rounded-full shadow-md ring-2 ring-gc-line transition-transform duration-200 ease-out hover:-translate-y-1 hover:scale-105"
                  style={{ background: b.iconBg ?? "#888" }}
                >
                  {b.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.iconUrl} alt={b.label} className="h-3/5 w-3/5 object-contain" />
                  ) : (
                    <span className="text-lg font-bold text-white">
                      {b.label.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent sideOffset={6}>{b.label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    </section>
  );
}
