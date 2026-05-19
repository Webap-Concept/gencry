// Dispatcher delle notifiche admin.
//
// Pattern: reconciliation (idempotente).
//   1. Esegue tutti i generatori → set di candidate (con dedupKey).
//   2. Per ogni candidate fa upsert: brand new → INSERT, già attivo →
//      refresh severity/title/body se cambiati, esistente ma resolved/dismissed →
//      "ri-attiva" (la condizione e' tornata).
//   3. Per ogni notifica attualmente attiva il cui dedupKey NON e' nei
//      candidate → set resolved_at = NOW() (la condizione e' svanita).
//
// Throttle: lazy execution, max una volta/ora. Stato persistito in
// `app_settings.notifications_dispatcher_last_run`.

import "server-only";
import { db } from "@/lib/db/drizzle";
import { adminNotifications, appSettings } from "@/lib/db/schema";
import { updateAppSetting } from "@/lib/db/settings-queries";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { GENERATORS } from "./generators";
import type { NotificationCandidate } from "./types";
import { upsertCandidate } from "./upsert";

const THROTTLE_MS = 60 * 60 * 1000; // 1h
const LAST_RUN_KEY = "notifications_dispatcher_last_run" as const;

async function getLastRun(): Promise<Date | null> {
  const row = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, LAST_RUN_KEY))
    .limit(1);
  if (row.length === 0 || !row[0].value) return null;
  const d = new Date(row[0].value);
  return isNaN(d.getTime()) ? null : d;
}

async function setLastRun(d: Date): Promise<void> {
  await updateAppSetting(LAST_RUN_KEY, d.toISOString());
}

/**
 * Esegue tutti i generatori e riconcilia il DB.
 * Esposto separato dal throttled per i test e per i trigger espliciti
 * (es. dopo un save di credenziali).
 */
export async function runGenerators(): Promise<void> {
  // Generators read disjoint sources (app_settings, users, prices_sync_runs,
  // session_alerts, …) with no shared state, so running them serially was
  // pure latency overhead. Promise.allSettled keeps the previous "one
  // failed generator doesn't block the rest" semantics — the same try/catch
  // body just lives in the .reduce below.
  const generatorResults = await Promise.allSettled(
    GENERATORS.map(async (gen) => ({
      gen,
      candidates: await gen.run(),
    })),
  );

  const collected: Array<{
    candidate: NotificationCandidate;
    requiredPermission: string;
  }> = [];

  for (let i = 0; i < generatorResults.length; i++) {
    const r = generatorResults[i];
    if (r.status === "fulfilled") {
      for (const c of r.value.candidates) {
        collected.push({
          candidate: c,
          requiredPermission: r.value.gen.requiredPermission,
        });
      }
    } else {
      console.warn(
        `[notifications] generator "${GENERATORS[i].type}" failed:`,
        r.reason,
      );
    }
  }

  // Upserts are independent atomic INSERT ... ON CONFLICT (dedup_key)
  // statements — parallelizing them is safe (the conflict resolution
  // happens at the DB level) and turns N round-trips into max-of-N
  // round-trips. Failures are isolated per-upsert as before.
  const upsertResults = await Promise.allSettled(
    collected.map(({ candidate, requiredPermission }) =>
      upsertCandidate(candidate, requiredPermission),
    ),
  );
  for (let i = 0; i < upsertResults.length; i++) {
    const r = upsertResults[i];
    if (r.status === "rejected") {
      console.warn(
        `[notifications] upsert "${collected[i].candidate.dedupKey}" failed:`,
        r.reason,
      );
    }
  }

  // Auto-resolve: notifiche attive il cui dedupKey non e' piu' tra le candidate.
  // Limitato ai type gestiti dai generatori per non toccare notifiche
  // create da altri canali in futuro.
  const managedTypes = [...new Set(GENERATORS.map((g) => g.type))];
  if (managedTypes.length === 0) return;

  const expectedDedupKeys = new Set(collected.map((x) => x.candidate.dedupKey));

  const activeRows = await db
    .select({
      id: adminNotifications.id,
      dedupKey: adminNotifications.dedupKey,
    })
    .from(adminNotifications)
    .where(
      and(
        inArray(adminNotifications.type, managedTypes),
        isNull(adminNotifications.resolvedAt),
        isNull(adminNotifications.dismissedAt),
      ),
    );

  const toResolveIds = activeRows
    .filter((r) => !expectedDedupKeys.has(r.dedupKey))
    .map((r) => r.id);

  if (toResolveIds.length > 0) {
    await db
      .update(adminNotifications)
      .set({ resolvedAt: new Date() })
      .where(inArray(adminNotifications.id, toResolveIds));
  }
}

/**
 * Versione throttled: esegue al massimo ogni THROTTLE_MS. Errori sono
 * silenziati (loggati) per non rompere il render del bell.
 */
export async function runGeneratorsThrottled(): Promise<void> {
  try {
    const last = await getLastRun();
    if (last && Date.now() - last.getTime() < THROTTLE_MS) return;
    await runGenerators();
    await setLastRun(new Date());
  } catch (e) {
    console.warn("[notifications] dispatcher throttled run failed:", e);
  }
}
