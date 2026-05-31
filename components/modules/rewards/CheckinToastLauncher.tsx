"use client";
// components/modules/rewards/CheckinToastLauncher.tsx
//
// Mostra un toast effimero alla prima navigazione del giorno quando il
// check-in viene accreditato. Montato nel layout (protected) una sola
// volta per sessione RSC. Il toast sparisce automaticamente dopo 3.5s.
// z-[60] = TOAST layer (sopra modal/drawer, vedi lib/ui/z-index.ts).
import { useEffect, useState } from "react";
import { Coins } from "lucide-react";
import { useTranslations } from "next-intl";

export function CheckinToastLauncher({
  awarded,
  amount,
}: {
  awarded: boolean;
  amount: number;
}) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const t = useTranslations("rewards.ui");

  useEffect(() => {
    if (!awarded || amount <= 0) return;
    // Piccolo delay per non schiacciarsi sul render iniziale
    const showTimer = setTimeout(() => setVisible(true), 600);
    // Auto-dismiss dopo 3.5s
    const hideTimer = setTimeout(() => {
      setExiting(true);
      setTimeout(() => setVisible(false), 300);
    }, 4100);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [awarded, amount]);

  if (!visible) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className={[
        "fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2",
        "z-[60] flex items-center gap-2.5 px-4 py-3 rounded-full",
        "bg-gc-bg-2 border border-gc-line shadow-lg",
        "text-sm font-medium text-gc-fg",
        "transition-all duration-300",
        exiting ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0",
      ].join(" ")}
    >
      <Coins size={16} className="text-gc-accent shrink-0" strokeWidth={1.6} />
      <span>
        {t("checkin_success", { amount })}
      </span>
    </div>
  );
}
