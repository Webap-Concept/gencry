// lib/modules/rewards/queries.ts — read path del modulo rewards
import { and, count, desc, eq, gte, sql, sum } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { rewardsBalances, rewardsLedger, rewardsRules, STREAK_MILESTONE_DAYS } from "@/lib/db/schema";

/** Saldo corrente di un utente. Null se l'utente non ha mai guadagnato coin. */
export async function getUserBalance(
  userId: string,
): Promise<{ balance: number; lifetimeEarned: number } | null> {
  const [row] = await db
    .select({ balance: rewardsBalances.balance, lifetimeEarned: rewardsBalances.lifetimeEarned })
    .from(rewardsBalances)
    .where(eq(rewardsBalances.userId, userId));
  if (!row) return null;
  // numeric() in Drizzle ritorna string — convertiamo a number per la UI
  return {
    balance:        parseFloat(row.balance as unknown as string),
    lifetimeEarned: parseFloat(row.lifetimeEarned as unknown as string),
  };
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

/**
 * Streak di check-in consecutivi. Conta i giorni consecutivi (UTC) in cui
 * l'utente ha eseguito il check-in, partendo da oggi o ieri (se oggi non
 * è ancora stato fatto). Cerca negli ultimi 400 giorni.
 */
export async function getCheckinStreak(userId: string): Promise<number> {
  type Row = { day: string };
  const rows = await db.execute<Row>(sql`
    SELECT DISTINCT (created_at AT TIME ZONE 'UTC')::date::text AS day
    FROM rewards_ledger
    WHERE user_id = ${userId}
      AND event_type = 'daily_checkin'
      AND created_at >= (NOW() - INTERVAL '400 days')
    ORDER BY day DESC
  `);

  const days = (Array.isArray(rows) ? rows : (rows as { rows?: Row[] }).rows ?? []).map(
    (r) => r.day,
  );
  if (days.length === 0) return 0;

  const daySet = new Set(days);
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);

  // Se oggi non è ancora stato fatto il check-in, parte da ieri
  if (!daySet.has(cursor.toISOString().slice(0, 10))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  let streak = 0;
  while (daySet.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export interface StreakMilestoneStatus {
  currentStreak: number;
  milestones: Array<{
    days: number;
    amount: number;
    enabled: boolean;
    /** Data in cui il bonus è stato accreditato nel run corrente. Null = non ancora. */
    achievedAt: Date | null;
  }>;
}

/**
 * Stato streak + milestone per la sezione /mycoins.
 * Per ogni milestone controlla se è stata raggiunta nel run di streak CORRENTE
 * (ovvero se c'è un ledger entry streak_N con created_at >= streak start date).
 */
export async function getStreakMilestoneStatus(
  userId: string,
): Promise<StreakMilestoneStatus> {
  const currentStreak = await getCheckinStreak(userId);

  // Data di inizio della streak corrente (o oggi se streak=0)
  const streakStartUtc = new Date();
  streakStartUtc.setUTCHours(0, 0, 0, 0);
  if (currentStreak > 1) {
    streakStartUtc.setUTCDate(streakStartUtc.getUTCDate() - (currentStreak - 1));
  }

  // Legge le regole milestone + controlla achievement in parallelo
  const [rules, ...achievedRows] = await Promise.all([
    db
      .select({ eventType: rewardsRules.eventType, amount: rewardsRules.amount, enabled: rewardsRules.enabled })
      .from(rewardsRules)
      .where(sql`${rewardsRules.eventType} LIKE 'streak_%'`),
    ...STREAK_MILESTONE_DAYS.map((days) =>
      db
        .select({ createdAt: rewardsLedger.createdAt })
        .from(rewardsLedger)
        .where(
          and(
            eq(rewardsLedger.userId, userId),
            eq(rewardsLedger.eventType, `streak_${days}` as const),
            gte(rewardsLedger.createdAt, streakStartUtc),
          ),
        )
        .orderBy(desc(rewardsLedger.createdAt))
        .limit(1),
    ),
  ]);

  const rulesMap = Object.fromEntries(
    rules.map((r) => [r.eventType, { amount: parseFloat(r.amount as unknown as string), enabled: r.enabled }]),
  );

  const milestones = STREAK_MILESTONE_DAYS.map((days, i) => {
    const rule = rulesMap[`streak_${days}`];
    const row = achievedRows[i]?.[0] ?? null;
    return {
      days,
      amount: rule?.amount ?? 0,
      enabled: rule?.enabled ?? false,
      achievedAt: row ? row.createdAt : null,
    };
  });

  return { currentStreak, milestones };
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
      totalCoinsCirculating: 0,
      totalLifetimeEarned: 0,
      todayEarned: 0,
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
    totalCoinsCirculating: parseFloat(statsRow?.total_balance ?? "0"),
    totalLifetimeEarned:   parseFloat(statsRow?.total_lifetime ?? "0"),
    todayEarned:           parseFloat(todayRow?.earned ?? "0"),
    todayTransactions:     todayRow?.txns ?? 0,
  };
}

export interface CategoryBreakdown {
  eventType: string;
  todayEarned: number;
  weekEarned: number;
  totalEarned: number;
  totalTxns: number;
}

/**
 * Breakdown per-utente suddiviso per event_type con finestre temporali.
 * Usato dalla pagina /mycoins. 1 sola query con aggregazione condizionale.
 */
export async function getUserBalanceBreakdown(
  userId: string,
): Promise<{ categories: CategoryBreakdown[] }> {
  // db.execute (postgres.js raw) vuole stringhe ISO, non Date objects
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const weekStart = new Date(todayStart);
  weekStart.setUTCDate(todayStart.getUTCDate() - 6);
  const todayIso = todayStart.toISOString();
  const weekIso  = weekStart.toISOString();

  type Row = {
    event_type: string;
    today_earned: string;
    week_earned: string;
    total_earned: string;
    total_txns: string;
  };

  const rows = await db.execute<Row>(sql`
    SELECT
      event_type,
      COALESCE(SUM(amount) FILTER (WHERE created_at >= ${todayIso}::timestamptz), 0)::text AS today_earned,
      COALESCE(SUM(amount) FILTER (WHERE created_at >= ${weekIso}::timestamptz), 0)::text  AS week_earned,
      COALESCE(SUM(amount), 0)::text                                                        AS total_earned,
      COUNT(*)::text                                                                         AS total_txns
    FROM rewards_ledger
    WHERE user_id = ${userId}
    GROUP BY event_type
    ORDER BY total_earned DESC
  `);

  const categories: CategoryBreakdown[] = (Array.isArray(rows) ? rows : (rows as { rows?: Row[] }).rows ?? []).map(
    (r) => ({
      eventType:   r.event_type,
      todayEarned: parseInt(r.today_earned, 10),
      weekEarned:  parseInt(r.week_earned, 10),
      totalEarned: parseInt(r.total_earned, 10),
      totalTxns:   parseInt(r.total_txns, 10),
    }),
  );

  return { categories };
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
