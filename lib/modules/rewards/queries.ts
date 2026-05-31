// lib/modules/rewards/queries.ts — read path del modulo rewards
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { rewardsBalances, rewardsLedger, rewardsRules } from "@/lib/db/schema";

/** Saldo corrente di un utente. Null se l'utente non ha mai guadagnato coin. */
export async function getUserBalance(
  userId: string,
): Promise<{ balance: number; lifetimeEarned: number } | null> {
  const [row] = await db
    .select({ balance: rewardsBalances.balance, lifetimeEarned: rewardsBalances.lifetimeEarned })
    .from(rewardsBalances)
    .where(eq(rewardsBalances.userId, userId));
  return row ?? null;
}

/** Ultime N transazioni del ledger per un utente (per la history UI). */
export async function getUserLedger(userId: string, limit = 20) {
  return db
    .select()
    .from(rewardsLedger)
    .where(eq(rewardsLedger.userId, userId))
    .orderBy(desc(rewardsLedger.createdAt))
    .limit(limit);
}

/** Tutte le regole configurate (per la settings page admin). */
export async function getAllRules() {
  return db.select().from(rewardsRules).orderBy(rewardsRules.eventType);
}

/** Statistiche globali per l'overview admin. */
export async function getAdminOverviewStats() {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return {
      totalUsersWithBalance: 0,
      totalCoinsCirculating: BigInt(0),
      totalLifetimeEarned: BigInt(0),
      todayEarned: BigInt(0),
      todayTransactions: 0,
    };
  }

  type StatsRow = {
    users_with_balance: string;
    total_balance: string;
    total_lifetime: string;
  };
  const [statsRow] = await db.execute<StatsRow>(sql`
    SELECT
      COUNT(*)::text            AS users_with_balance,
      COALESCE(SUM(balance),0)::text         AS total_balance,
      COALESCE(SUM(lifetime_earned),0)::text AS total_lifetime
    FROM rewards_balances
    WHERE balance > 0
  `);

  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);

  const [todayRow] = await db
    .select({
      earned: sql<string>`COALESCE(SUM(${rewardsLedger.amount}),0)::text`,
      txns:   count(),
    })
    .from(rewardsLedger)
    .where(gte(rewardsLedger.createdAt, startOfToday));

  return {
    totalUsersWithBalance: parseInt(statsRow?.users_with_balance ?? "0", 10),
    totalCoinsCirculating: BigInt(statsRow?.total_balance ?? "0"),
    totalLifetimeEarned:   BigInt(statsRow?.total_lifetime ?? "0"),
    todayEarned:           BigInt(todayRow?.earned ?? "0"),
    todayTransactions:     todayRow?.txns ?? 0,
  };
}

/** Breakdown delle transazioni di oggi per event_type (per l'overview chart). */
export async function getTodayBreakdown() {
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);

  return db
    .select({
      eventType: rewardsLedger.eventType,
      txns:      count(),
      total:     sql<string>`SUM(${rewardsLedger.amount})::text`,
    })
    .from(rewardsLedger)
    .where(gte(rewardsLedger.createdAt, startOfToday))
    .groupBy(rewardsLedger.eventType)
    .orderBy(rewardsLedger.eventType);
}
