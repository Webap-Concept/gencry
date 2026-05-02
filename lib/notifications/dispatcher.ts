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

async function upsertCandidate(
  c: NotificationCandidate,
  requiredPermission: string,
): Promise<void> {
  const existing = await db
    .select()
    .from(adminNotifications)
    .where(eq(adminNotifications.dedupKey, c.dedupKey))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(adminNotifications).values({
      type: c.type,
      severity: c.severity,
      title: c.title,
      body: c.body ?? null,
      link: c.link ?? null,
      dedupKey: c.dedupKey,
      requiredPermission,
      metadata: c.metadata ?? {},
    });
    return;
  }

  const row = existing[0];

  if (row.dismissedAt !== null) {
    // L'admin ha chiuso manualmente questa notifica. La condizione esiste
    // ancora nel sistema ma la scelta dell'utente va rispettata: non riaprire.
    return;
  }

  if (row.resolvedAt !== null) {
    // Il sistema aveva auto-risolto (condizione scomparsa) ma ora è tornata
    // → ri-apri come nuova notifica.
    await db
      .update(adminNotifications)
      .set({
        type: c.type,
        severity: c.severity,
        title: c.title,
        body: c.body ?? null,
        link: c.link ?? null,
        metadata: c.metadata ?? {},
        requiredPermission,
        resolvedAt: null,
        readAt: null,
        snoozedUntil: null,
        createdAt: new Date(),
      })
      .where(eq(adminNotifications.id, row.id));
    return;
  }

  // Già attiva: aggiorna solo i campi descrittivi se cambiati (es. severity
  // sale a critical mentre invecchia). Non toccare read_at / snoozed_until:
  // quelle sono scelte dell'utente, vanno rispettate.
  const needsUpdate =
    row.severity !== c.severity ||
    row.title !== c.title ||
    row.body !== (c.body ?? null) ||
    row.link !== (c.link ?? null);

  if (needsUpdate) {
    await db
      .update(adminNotifications)
      .set({
        severity: c.severity,
        title: c.title,
        body: c.body ?? null,
        link: c.link ?? null,
        metadata: c.metadata ?? {},
      })
      .where(eq(adminNotifications.id, row.id));
  }
}

/**
 * Esegue tutti i generatori e riconcilia il DB.
 * Esposto separato dal throttled per i test e per i trigger espliciti
 * (es. dopo un save di credenziali).
 */
export async function runGenerators(): Promise<void> {
  const collected: Array<{
    candidate: NotificationCandidate;
    requiredPermission: string;
  }> = [];

  for (const gen of GENERATORS) {
    try {
      const candidates = await gen.run();
      for (const c of candidates) {
        collected.push({ candidate: c, requiredPermission: gen.requiredPermission });
      }
    } catch (e) {
      console.warn(`[notifications] generator "${gen.type}" failed:`, e);
    }
  }

  for (const { candidate, requiredPermission } of collected) {
    try {
      await upsertCandidate(candidate, requiredPermission);
    } catch (e) {
      console.warn(`[notifications] upsert "${candidate.dedupKey}" failed:`, e);
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
