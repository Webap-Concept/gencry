"use server";
// app/(admin)/admin/modules/prices/coins/[symbol]/routing-actions.ts
//
// Server action per impostare preferred_exchange + exchange_symbol di
// un singolo coin. Usata dal componente client `coin-routing-form.tsx`
// renderizzato sotto la coin detail page admin.

import { db } from "@/lib/db/drizzle";
import { priceExchanges, pricesCoins } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { requireAdminSectionPage } from "@/lib/rbac/guards";
import { revalidatePath } from "next/cache";

const SECTION_PERM = "admin:users"; // come per exchanges/actions.ts;
// quando arrivera' la permission `modules:prices` dedicata, sostituire.

export type UpdateCoinRoutingResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateCoinRoutingAction(
  symbol: string,
  preferredExchange: string | null,
  exchangeSymbol: string | null,
): Promise<UpdateCoinRoutingResult> {
  await requireAdminSectionPage(SECTION_PERM);

  const symbolUpper = symbol.trim().toUpperCase();
  if (!symbolUpper) {
    return { ok: false, error: "Symbol mancante." };
  }

  const cleanExchange = preferredExchange?.trim() || null;
  const cleanExchangeSymbol = exchangeSymbol?.trim().toUpperCase() || null;

  // Validation:
  //   - se preferredExchange e' impostato, deve esistere su price_exchanges
  //     E exchange_symbol deve essere presente. Niente mezzi mapping.
  //   - se preferredExchange null → exchange_symbol forzato a null
  //     (i due sono accoppiati: senza exchange, il symbol non ha senso).
  if (cleanExchange) {
    if (!cleanExchangeSymbol) {
      return {
        ok: false,
        error:
          "Inserisci anche l'exchange symbol (es. BTCUSDT) quando imposti un preferred exchange.",
      };
    }
    const [exists] = await db
      .select({ id: priceExchanges.id })
      .from(priceExchanges)
      .where(and(eq(priceExchanges.id, cleanExchange), eq(priceExchanges.enabled, true)))
      .limit(1);
    if (!exists) {
      return {
        ok: false,
        error: `Exchange '${cleanExchange}' non trovato o disabilitato.`,
      };
    }
  }

  const result = await db
    .update(pricesCoins)
    .set({
      preferredExchange: cleanExchange,
      exchangeSymbol: cleanExchange ? cleanExchangeSymbol : null,
      updatedAt: new Date(),
    })
    .where(eq(pricesCoins.symbol, symbolUpper))
    .returning({ symbol: pricesCoins.symbol });

  if (result.length === 0) {
    return { ok: false, error: `Coin ${symbolUpper} non trovato nel registry.` };
  }

  // Invalida le cache che dipendono dal routing del coin:
  //   - chart route cache (per ogni range)
  //   - coin-routing lookup nel chart route
  // Pattern: la cache si auto-refresh al prossimo revalidate o tag bump.
  // updateTag('coin-routing:<sym>') sarebbe piu' chirurgico ma non lo
  // abbiamo wirato. Per ora revalidatePath e basta.
  revalidatePath(`/admin/modules/prices/coins/${symbolUpper.toLowerCase()}`);
  revalidatePath(`/coins/${symbolUpper.toLowerCase()}`);

  // Force-suggest sql.identity per silenziare ts: la query la fa
  // l'invalidator next.
  void sql;

  return { ok: true };
}
