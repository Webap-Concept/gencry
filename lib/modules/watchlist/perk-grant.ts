"use server";
// lib/modules/watchlist/perk-grant.ts
//
// Applica il perk 'watchlist_slot' (riscattato con GCC dal catalogo rewards):
// incrementa gli slot watchlist extra dell'utente in watchlist_extra_slots.
//
// "use server" (NON "server-only"): questo file è dynamic-importato dal
// manifest watchlist (afterPerkRedeemed), che è raggiungibile dal client
// bundle (admin nav → registry → manifest). Il boundary server-action tiene
// il codice DB fuori dal client. Stesso pattern di rewards/earn-reward.ts.
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { watchlistExtraSlots } from "@/lib/db/schema";

export async function grantWatchlistSlotPerk(
  userId: string,
  slug: string,
  perkData: Record<string, unknown> | null,
): Promise<void> {
  const isWatchlistSlot =
    slug === "watchlist_slot" || perkData?.perk_type === "watchlist_slot";
  if (!isWatchlistSlot) return;

  const rawGranted = perkData?.slots_granted;
  const granted =
    typeof rawGranted === "number" && rawGranted > 0 ? Math.trunc(rawGranted) : 1;

  await db
    .insert(watchlistExtraSlots)
    .values({ userId, extraSlots: granted })
    .onConflictDoUpdate({
      target: watchlistExtraSlots.userId,
      set: {
        extraSlots: sql`${watchlistExtraSlots.extraSlots} + ${granted}`,
        updatedAt: sql`now()`,
      },
    });
}
