"use server";
// lib/modules/rewards/redeem.ts
//
// Spending engine: riscatta un item del catalogo spendendo GCC.
// Atomico via transazione Drizzle:
//   1. Verifica saldo sufficiente (SELECT rewards_balances FOR UPDATE)
//   2. Verifica idempotency (già acquistato per is_unique?)
//   3. INSERT negativo in rewards_ledger (event_type='redemption')
//   4. INSERT in rewards_redemptions (audit)
//   5. Se type='badge': INSERT in user_badges
//   6. Il trigger rewards_ledger_balance_trg sottrae dal saldo
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import {
  rewardsCatalog,
  rewardsLedger,
  rewardsRedemptions,
  rewardsBalances,
  userBadges,
} from "@/lib/db/schema";
import { getUser } from "@/lib/db/queries";

export type RedeemResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function redeemCatalogItem(catalogSlug: string): Promise<RedeemResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Devi essere autenticato." };
  if (user.bannedAt) return { ok: false, error: "Account sospeso." };

  return db.transaction(async (tx) => {
    // 1. Legge l'item
    const [item] = await tx
      .select()
      .from(rewardsCatalog)
      .where(and(eq(rewardsCatalog.slug, catalogSlug), eq(rewardsCatalog.isActive, true)))
      .limit(1);
    if (!item) return { ok: false, error: "Item non disponibile." };

    const cost = parseFloat(item.costGcc as unknown as string);

    // 2. Verifica idempotency (già acquistato per is_unique?)
    if (item.isUnique) {
      if (item.type === "badge") {
        const [existing] = await tx
          .select({ id: userBadges.id })
          .from(userBadges)
          .where(
            and(eq(userBadges.userId, user.id), eq(userBadges.badgeSlug, item.slug), isNull(userBadges.revokedAt)),
          )
          .limit(1);
        if (existing) return { ok: false, error: "Hai già questo badge." };
      } else {
        const [existing] = await tx
          .select({ id: rewardsRedemptions.id })
          .from(rewardsRedemptions)
          .where(
            and(eq(rewardsRedemptions.userId, user.id), eq(rewardsRedemptions.catalogItemId, item.id)),
          )
          .limit(1);
        if (existing) return { ok: false, error: "Hai già questo acquisto." };
      }
    }

    // 3. Verifica saldo
    const [balance] = await tx
      .select({ balance: rewardsBalances.balance })
      .from(rewardsBalances)
      .where(eq(rewardsBalances.userId, user.id))
      .for("update") // lock row per evitare race condition
      .limit(1);

    const currentBalance = parseFloat((balance?.balance as unknown as string) ?? "0");
    if (currentBalance < cost) {
      return {
        ok: false,
        error: `GCC insufficienti. Hai ${currentBalance.toLocaleString("it-IT")} GCC, servono ${cost.toLocaleString("it-IT")}.`,
      };
    }

    // 4. INSERT entry negativa nel ledger
    const [ledgerEntry] = await tx
      .insert(rewardsLedger)
      .values({
        userId:         user.id,
        eventType:      "redemption" as const,
        amount:         String(-cost),
        idempotencyKey: `redemption:${item.slug}:${Date.now()}`,
        referenceId:    item.id,
      })
      .returning({ id: rewardsLedger.id });

    // 5. INSERT audit trail
    await tx.insert(rewardsRedemptions).values({
      userId:        user.id,
      catalogItemId: item.id,
      gccSpent:      String(cost),
      ledgerEntryId: ledgerEntry.id,
    });

    // 6. Assegna badge se type='badge'
    if (item.type === "badge") {
      await tx.insert(userBadges).values({
        userId:        user.id,
        badgeSlug:     item.slug,
        source:        "purchase",
        catalogItemId: item.id,
      });
    }

    return { ok: true, message: `Hai acquistato "${item.label}"! −${cost} GCC.` };
  });
}
