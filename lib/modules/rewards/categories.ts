// lib/modules/rewards/categories.ts
//
// Configurazione canonica delle categorie reward.
// SOURCE OF TRUTH per label, icona, colori e nomi di conteggio.
// Importabile sia in RSC (page.tsx) sia in client components.
// Mai duplicare questa config in pagine o componenti.

import { Zap, PenLine, Flame, MessageSquare } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { RewardEventType } from "./types";

export interface RewardCategoryConfig {
  eventType:   RewardEventType;
  /** Label breve mostrata nella card e nella legenda */
  label:       string;
  /** Descrizione lunga mostrata nella card */
  description: string;
  /** Nome plurale dell'unità di conteggio (es. "accessi", "post") */
  countLabel:  string;
  /** Icona Lucide */
  icon:        LucideIcon;
  /** Classe Tailwind per il bg del quadrato icona */
  iconBg:      string;
  /** Classe Tailwind per la barra proporzionale nella card */
  barColor:    string;
  /** Classe Tailwind per il dot legenda + percentuale */
  accentColor: string;
}

export const REWARD_CATEGORIES: RewardCategoryConfig[] = [
  {
    eventType:   "daily_checkin",
    label:       "Accesso",
    description: "Coin per ogni accesso giornaliero",
    countLabel:  "accessi",
    icon:        Zap,
    iconBg:      "bg-orange-500",
    barColor:    "bg-orange-400",
    accentColor: "text-orange-500",
  },
  {
    eventType:   "post_created",
    label:       "Creazione post",
    description: "Coin per ogni post che pubblichi",
    countLabel:  "post",
    icon:        PenLine,
    iconBg:      "bg-emerald-700",
    barColor:    "bg-emerald-600",
    accentColor: "text-emerald-700",
  },
  {
    eventType:   "like_received",
    label:       "Reactions ricevute",
    description: "Coin per ogni reaction ricevuta sui tuoi post",
    countLabel:  "reactions",
    icon:        Flame,
    iconBg:      "bg-red-700",
    barColor:    "bg-red-600",
    accentColor: "text-red-600",
  },
  {
    eventType:   "comment_created",
    label:       "Commenti",
    description: "Coin per ogni commento che scrivi",
    countLabel:  "commenti",
    icon:        MessageSquare,
    iconBg:      "bg-blue-600",
    barColor:    "bg-blue-500",
    accentColor: "text-blue-600",
  },
];

/** Mappa eventType → config per lookup O(1) */
export const REWARD_CATEGORY_MAP = Object.fromEntries(
  REWARD_CATEGORIES.map((c) => [c.eventType, c]),
) as Record<string, RewardCategoryConfig>;
