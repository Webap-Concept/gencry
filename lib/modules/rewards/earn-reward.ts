"use server";
// lib/modules/rewards/earn-reward.ts
//
// Service per l'accredito applicativo di coin (daily_checkin, post_created).
// Il like_received è gestito direttamente dal trigger DB rewards_reaction_insert_trg
// (zero-latency, niente consumer applicativo — stesso pattern di notifications).
//
// Contract:
//   - Idempotente: ON CONFLICT DO NOTHING sulla UNIQUE(user_id, idempotency_key).
//     Richiamare più volte con la stessa chiave è safe.
//   - Non lancia mai: errori DB vengono swallowati e loggati (fire-and-forget).
//     L'azione utente (createPost, checkin) non deve mai fallire per colpa dei reward.
//   - Il saldo viene aggiornato dal trigger DB rewards_ledger_balance_trg,
//     non da questo service.

import { and, count, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { rewardsLedger, rewardsRules, STREAK_MILESTONE_DAYS } from "@/lib/db/schema";
import type { EarnResult, RewardEventType } from "./types";
import { getUser } from "@/lib/db/queries";
import { getCheckinStreak } from "./queries";

function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Accredita `eventType` coins all'utente con la chiave di idempotency data.
 * Chiamata in fire-and-forget: swallowa errori, non blocca il chiamante.
 *
 * @param userId         UUID dell'utente beneficiario
 * @param eventType      'daily_checkin' | 'post_created'
 * @param idempotencyKey Chiave univoca per questo accredito (es. "post_created:<postId>")
 * @param referenceId    UUID opzionale del contenuto correlato
 */
export async function earnReward(
  userId: string,
  eventType: RewardEventType,
  idempotencyKey: string,
  referenceId?: string,
): Promise<EarnResult> {
  try {
    const [rule] = await db
      .select()
      .from(rewardsRules)
      .where(and(eq(rewardsRules.eventType, eventType), eq(rewardsRules.enabled, true)))
      .limit(1);

    if (!rule) return { awarded: false, amount: 0 };

    // numeric() in Drizzle ritorna string — parseFloat per i confronti
    const amount = parseFloat(rule.amount as unknown as string);

    // Controlla daily_cap se definito
    if (rule.dailyCap !== null) {
      const [{ value: todayCount }] = await db
        .select({ value: count() })
        .from(rewardsLedger)
        .where(
          and(
            eq(rewardsLedger.userId, userId),
            eq(rewardsLedger.eventType, eventType),
            gte(rewardsLedger.createdAt, startOfTodayUtc()),
          ),
        );
      if (todayCount >= rule.dailyCap) return { awarded: false, amount: 0 };
    }

    const rows = await db
      .insert(rewardsLedger)
      .values({
        userId,
        eventType,
        amount: String(amount),
        idempotencyKey,
        referenceId: referenceId ?? null,
      })
      .onConflictDoNothing({
        target: [rewardsLedger.userId, rewardsLedger.idempotencyKey],
      })
      .returning({ id: rewardsLedger.id });

    return { awarded: rows.length > 0, amount: rows.length > 0 ? amount : 0 };
  } catch {
    // Fire-and-forget: errori DB non devono bloccare l'azione utente
    return { awarded: false, amount: 0 };
  }
}

/**
 * Server Action: riscatta il check-in giornaliero con la data LOCALE del
 * browser (es. "2026-06-01"). Risolve il bug timezone: se usassimo la data
 * UTC server-side, un utente a UTC+3 alle 01:00 locale (= 22:00 UTC del
 * giorno prima) e poi alle 11:00 riceverebbe due check-in sullo stesso
 * giorno locale pur essendo UTC-days diversi.
 *
 * Validazione: la data locale deve essere entro ±1 giorno UTC (copre tutti
 * gli offset da -14 a +14) per prevenire claim su date arbitrarie.
 */
/**
 * Controlla e accredita i bonus milestone di streak dopo un check-in riuscito.
 * Chiamata fire-and-forget: errori swallowati.
 * Logica: se la streak corrente è ESATTAMENTE uguale a un milestone, accredita
 * il bonus con idempotency key `streak_N:dateKey` — univoco per streak run
 * (se l'utente rompe e ricostruisce la streak, la data è diversa → nuovo bonus).
 */
async function checkAndAwardStreakMilestones(
  userId: string,
  dateKey: string,
): Promise<void> {
  try {
    const streak = await getCheckinStreak(userId);
    if (streak === 0) return;

    for (const days of STREAK_MILESTONE_DAYS) {
      if (streak === days) {
        await earnReward(
          userId,
          `streak_${days}` as RewardEventType,
          `streak_${days}:${dateKey}`,
        );
      }
    }
  } catch {
    // fire-and-forget
  }
}

export async function claimDailyCheckin(localDateStr?: string): Promise<EarnResult> {
  const user = await getUser();
  if (!user) return { awarded: false, amount: 0 };

  // Se non viene passata la data locale (chiamata server-side legacy), usa UTC
  let dateKey: string;
  if (localDateStr && /^\d{4}-\d{2}-\d{2}$/.test(localDateStr)) {
    // Valida che la data locale sia entro ±1 giorno UTC
    const now = Date.now();
    const yesterday = new Date(now - 86_400_000).toISOString().slice(0, 10);
    const tomorrow  = new Date(now + 86_400_000).toISOString().slice(0, 10);
    const utcToday  = new Date(now).toISOString().slice(0, 10);
    const valid = new Set([yesterday, utcToday, tomorrow]);
    dateKey = valid.has(localDateStr) ? localDateStr : utcToday;
  } else {
    dateKey = new Date().toISOString().slice(0, 10);
  }

  const result = await earnReward(user.id, "daily_checkin", `daily_checkin:${dateKey}`);

  // Se il check-in è stato accreditato oggi, controlla i milestone streak
  if (result.awarded) {
    checkAndAwardStreakMilestones(user.id, dateKey).catch(() => {});
  }

  return result;
}
