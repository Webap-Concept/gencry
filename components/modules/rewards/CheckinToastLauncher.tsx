"use client";
// components/modules/rewards/CheckinToastLauncher.tsx
//
// Componente self-contained: al mount legge la data LOCALE del browser,
// chiama claimDailyCheckin(localDateStr) e mostra il toast se awarded.
//
// Perché client-side: la data locale del browser è l'unica fonte corretta
// per "che giorno è oggi" per l'utente. Calcolarla server-side in UTC
// causerebbe doppi check-in per utenti con offset positivi (es. UTC+3).
//
// z-[60] = TOAST layer (sopra modal/drawer, vedi lib/ui/z-index.ts).
import { useEffect, useRef, useState } from "react";
import { Coins } from "lucide-react";
import { useTranslations } from "next-intl";
import { claimDailyCheckin } from "@/lib/modules/rewards/earn-reward";

export function CheckinToastLauncher() {
  const [visible, setVisible]   = useState(false);
  const [exiting, setExiting]   = useState(false);
  const [amount, setAmount]     = useState(0);
  const claimed = useRef(false); // previene doppia invocazione in StrictMode
  const t = useTranslations("rewards.ui");

  useEffect(() => {
    if (claimed.current) return;
    claimed.current = true;

    // Data locale del browser nel formato YYYY-MM-DD (en-CA = ISO-like)
    const localDate = new Date().toLocaleDateString("en-CA");

    claimDailyCheckin(localDate).then((result) => {
      if (!result.awarded || result.amount <= 0) return;
      setAmount(result.amount);
      setTimeout(() => setVisible(true), 600);
      setTimeout(() => {
        setExiting(true);
        setTimeout(() => setVisible(false), 300);
      }, 4100);
    });
  }, []);

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
      <span>{t("checkin_success", { amount })}</span>
    </div>
  );
}
