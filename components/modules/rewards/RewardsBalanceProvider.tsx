"use client";
// components/modules/rewards/RewardsBalanceProvider.tsx
//
// Provider del saldo coin utente. Tiene il balance in state React +
// sottoscrive Supabase Realtime su rewards_balances (INSERT/UPDATE)
// per aggiornamenti live senza page refresh.
//
// Pattern identico a NotificationsUnreadProvider: 1 sola subscription
// per sessione, condivisa via context da tutti i consumer (sidebar, sheet, ecc.).
//
// Degraded-safe: se Supabase non è configurato, il saldo resta quello
// server-rendered e si aggiorna alla prossima navigazione.
import { createContext, useContext, useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser-client";
import { generateSupabaseRealtimeToken } from "@/lib/auth/supabase-realtime-token";

interface RewardsBalanceContextValue {
  balance: number | null;
}

// Default null: segnala "provider non montato" (modulo non installato).
// I consumer (UserMenu) non mostrano il balance row quando null.
const RewardsBalanceContext = createContext<RewardsBalanceContextValue>({
  balance: null,
});

/** Saldo corrente. null = modulo rewards non installato → non mostrare nulla. */
export function useRewardsBalance(): number | null {
  return useContext(RewardsBalanceContext).balance;
}

export function RewardsBalanceProvider({
  viewerUserId,
  initialBalance,
  children,
}: {
  viewerUserId: string;
  initialBalance: number;
  children: React.ReactNode;
}) {
  const [balance, setBalance] = useState<number | null>(initialBalance);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    let cancelled = false;
    let channelRef: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const tokenRes = await generateSupabaseRealtimeToken();
      if (cancelled) return;
      if (tokenRes.ok) {
        await supabase.realtime.setAuth(tokenRes.data.token);
      }
      const channel = supabase
        .channel(`rewards-balance:${viewerUserId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "rewards_balances",
            filter: `user_id=eq.${viewerUserId}`,
          },
          (payload) => {
            const row = payload.new as { balance?: number } | null;
            if (row && typeof row.balance === "number") {
              setBalance(row.balance);
            }
          },
        )
        .subscribe();
      channelRef = channel;
    })();

    return () => {
      cancelled = true;
      if (channelRef) {
        const sb = getBrowserSupabase();
        if (sb) sb.removeChannel(channelRef);
      }
    };
  }, [viewerUserId]);

  return (
    <RewardsBalanceContext.Provider value={{ balance }}>
      {children}
    </RewardsBalanceContext.Provider>
  );
}
