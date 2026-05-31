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
import { rewardsLedger, rewardsRules } from "@/lib/db/schema";
import type { EarnResult, RewardEventType } from "./types";
import { getUser } from "@/lib/db/queries";

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
 * Server Action pubblica: l'utente riscatta il check-in giornaliero.
 * Idempotente per data UTC: chiamarla più volte nello stesso giorno non
 * accredita più di una volta. Da chiamare dal frontend al primo load
 * di ogni sessione autenticata (PR-2: widget saldo + UI).
 */
export async function claimDailyCheckin(): Promise<EarnResult> {
  const user = await getUser();
  if (!user) return { awarded: false, amount: 0 };

  const dateKey = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD" UTC
  return earnReward(user.id, "daily_checkin", `daily_checkin:${dateKey}`);
}
