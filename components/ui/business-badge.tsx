"use client";
// components/ui/business-badge.tsx
//
// Badge "Profilo Business" sovrapposto all'avatar: valigetta bianca su
// cerchio accent, con tooltip shadcn. Componente unico riusato ovunque
// appare un avatar di azienda verificata (feed, commenti, profilo, ...).
//
// La spunta BadgeCheck è riservata al futuro profilo Pro: il business usa
// un segno distintivo diverso (deciso 2026-05-31).
import { Briefcase } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function BusinessBadge({ size = 16 }: { size?: number }) {
  const t = useTranslations("core.badges");
  const label = t("businessProfile");
  const iconSize = Math.max(8, Math.round(size * 0.62));
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-flex items-center justify-center rounded-full bg-gc-accent text-white ring-2 ring-gc-bg cursor-default"
            style={{ width: size, height: size }}
            aria-label={label}
            role="img"
          >
            <Briefcase
              style={{ width: iconSize, height: iconSize }}
              strokeWidth={2.5}
              aria-hidden
            />
          </span>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
