// lib/modules/rewards/catalog-queries.ts — read path per catalog + badges
import { and, count, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import {
  rewardsCatalog,
  rewardsRedemptions,
  userBadges,
  type RewardsCatalogItem,
} from "@/lib/db/schema";

export interface CatalogItemWithMeta extends RewardsCatalogItem {
  redemptionCount: number;
  isLocked: boolean; // slug/type readonly perché ha già redemptions + is_unique
}

/** Tutti gli item del catalogo con conteggio redemptions (per admin). */
export async function getAllCatalogItems(): Promise<CatalogItemWithMeta[]> {
  const rows = await db
    .select({
      item:            rewardsCatalog,
      redemptionCount: count(rewardsRedemptions.id),
    })
    .from(rewardsCatalog)
    .leftJoin(rewardsRedemptions, eq(rewardsRedemptions.catalogItemId, rewardsCatalog.id))
    .groupBy(rewardsCatalog.id)
    .orderBy(rewardsCatalog.type, rewardsCatalog.label);

  return rows.map(({ item, redemptionCount }) => ({
    ...item,
    redemptionCount,
    isLocked: item.isUnique && redemptionCount > 0,
  }));
}

/** Singolo item per edit form admin. */
export async function getCatalogItem(id: string): Promise<CatalogItemWithMeta | null> {
  const [row] = await db
    .select({
      item:            rewardsCatalog,
      redemptionCount: count(rewardsRedemptions.id),
    })
    .from(rewardsCatalog)
    .leftJoin(rewardsRedemptions, eq(rewardsRedemptions.catalogItemId, rewardsCatalog.id))
    .where(eq(rewardsCatalog.id, id))
    .groupBy(rewardsCatalog.id);

  if (!row) return null;
  return {
    ...row.item,
    redemptionCount: row.redemptionCount,
    isLocked: row.item.isUnique && row.redemptionCount > 0,
  };
}

/** Item attivi visibili all'utente nel "Negozio". */
export interface RedeemableItem extends RewardsCatalogItem {
  alreadyOwned: boolean;
}

export async function getRedeemableItems(userId: string): Promise<RedeemableItem[]> {
  const items = await db
    .select()
    .from(rewardsCatalog)
    .where(eq(rewardsCatalog.isActive, true))
    .orderBy(rewardsCatalog.type, rewardsCatalog.costGcc);

  if (items.length === 0) return [];

  // Badge già posseduti (non revocati) — per gli is_unique nasconde il bottone "Acquista"
  const ownedSlugs = new Set(
    (
      await db
        .select({ slug: userBadges.badgeSlug })
        .from(userBadges)
        .where(and(eq(userBadges.userId, userId), isNull(userBadges.revokedAt)))
    ).map((r) => r.slug),
  );

  // Redemptions già fatte (per perk is_unique)
  const ownedCatalogIds = new Set(
    (
      await db
        .select({ id: rewardsRedemptions.catalogItemId })
        .from(rewardsRedemptions)
        .where(eq(rewardsRedemptions.userId, userId))
    ).map((r) => r.id),
  );

  return items.map((item) => {
    const alreadyOwned =
      item.isUnique &&
      (item.type === "badge"
        ? ownedSlugs.has(item.slug)
        : ownedCatalogIds.has(item.id));
    return { ...item, alreadyOwned };
  });
}

/** Badge attivi di un utente (per display nel profilo). */
export async function getUserActiveBadges(userId: string) {
  return db
    .select({
      id:        userBadges.id,
      badgeSlug: userBadges.badgeSlug,
      source:    userBadges.source,
      grantedAt: userBadges.grantedAt,
      expiresAt: userBadges.expiresAt,
      catalog:   rewardsCatalog,
    })
    .from(userBadges)
    .leftJoin(rewardsCatalog, eq(rewardsCatalog.id, userBadges.catalogItemId))
    .where(and(eq(userBadges.userId, userId), isNull(userBadges.revokedAt)))
    .orderBy(userBadges.grantedAt);
}

/** Conteggio watchlist slot extra per l'utente (acquistati). */
export async function getExtraWatchlistSlots(userId: string): Promise<number> {
  const rows = await db
    .select({ perkData: rewardsCatalog.perkData })
    .from(rewardsRedemptions)
    .innerJoin(rewardsCatalog, eq(rewardsCatalog.id, rewardsRedemptions.catalogItemId))
    .where(
      and(
        eq(rewardsRedemptions.userId, userId),
        eq(rewardsCatalog.type, "perk"),
        sql`${rewardsCatalog.perkData}->>'perk_type' = 'watchlist_slot' OR ${rewardsCatalog.slug} = 'watchlist_slot'`,
      ),
    );

  return rows.reduce((sum, r) => {
    const slots = (r.perkData as { slots_granted?: number } | null)?.slots_granted ?? 0;
    return sum + slots;
  }, 0);
}
