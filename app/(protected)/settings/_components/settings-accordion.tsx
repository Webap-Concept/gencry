// app/(protected)/settings/_components/settings-accordion.tsx
//
// Item di accordion condiviso dalle sezioni /settings (privacy, security, …):
// header con icona + titolo + subLabel sintetico (stato a colpo d'occhio quando
// chiuso) + dot "attention", contenuto espandibile. Estratto da privacy per
// tenere tutte le sezioni /settings visivamente identiche (un solo posto da
// ritoccare). Wrappare gli item in <Accordion className={settingsAccordionClass}>.

import type { LucideIcon } from "lucide-react";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

/** Classe del contenitore <Accordion> (bordo + radius + sfondo card). */
export const settingsAccordionClass =
  "overflow-hidden rounded-2xl border border-gc-line bg-gc-bg-2";

export function SettingsAccordionItem({
  value,
  icon: Icon,
  title,
  subLabel,
  attention,
  tone,
  children,
}: {
  value: string;
  icon: LucideIcon;
  title: string;
  subLabel?: string | null;
  attention?: boolean;
  tone?: "danger";
  children: React.ReactNode;
}) {
  const iconWrapClass =
    tone === "danger" ? "bg-gc-neg/10 text-gc-neg" : "bg-gc-bg text-gc-fg-3";
  return (
    <AccordionItem
      value={value}
      className="border-b border-gc-line last:border-b-0"
    >
      <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-gc-bg-3/40 transition-colors rounded-none">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconWrapClass}`}
          >
            <Icon size={18} strokeWidth={1.7} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold text-gc-fg truncate">
                {title}
              </span>
              {attention ? (
                <span
                  aria-hidden
                  className="inline-block h-1.5 w-1.5 rounded-full bg-gc-warning-fg shrink-0"
                  title="Richiede attenzione"
                />
              ) : null}
            </div>
            {subLabel ? (
              <p className="text-[12px] text-gc-fg-3 truncate mt-0.5">
                {subLabel}
              </p>
            ) : null}
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-5 pt-1 pb-5">{children}</AccordionContent>
    </AccordionItem>
  );
}
