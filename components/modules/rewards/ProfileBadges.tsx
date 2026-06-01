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
import { BadgeIcon } from "./BadgeIcon";

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
                {/* Hover: lieve lift + zoom (specifico del profilo). */}
                <BadgeIcon
                  iconUrl={b.iconUrl}
                  iconBg={b.iconBg}
                  label={b.label}
                  size={48}
                  className="cursor-default transition-transform duration-200 ease-out hover:-translate-y-1 hover:scale-105"
                />
              </TooltipTrigger>
              <TooltipContent sideOffset={6}>{b.label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    </section>
  );
}
