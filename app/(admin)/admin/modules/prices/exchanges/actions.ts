"use server";
// app/(admin)/admin/modules/prices/exchanges/actions.ts
//
// Server actions per la UI /admin/modules/prices/exchanges. Tutte gated
// dal section guard del modulo prices (admin:modules.prices), no extra
// permission necessaria (la gestione exchange e' parte del modulo).

import { db } from "@/lib/db/drizzle";
import { priceExchanges } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAdminSectionPage } from "@/lib/rbac/guards";
import { revalidatePath } from "next/cache";
import { getExchangeAdapter } from "@/lib/modules/prices/exchanges/registry";
import type { HealthCheckResult } from "@/lib/modules/prices/exchanges/types";

const SECTION_PERM = "admin:users"; // PR4 placeholder; modulo prices
// non ha ancora una permission dedicata, usiamo admin:users come gate
// generico admin. Da spostare a `modules:prices` quando arrivera'.

export type ToggleResult =
  | { ok: true }
  | { ok: false; error: string };

export async function toggleExchangeEnabledAction(
  id: string,
  enabled: boolean,
): Promise<ToggleResult> {
  await requireAdminSectionPage(SECTION_PERM);
  try {
    await db
      .update(priceExchanges)
      .set({ enabled, updatedAt: new Date() })
      .where(eq(priceExchanges.id, id));
    revalidatePath("/admin/modules/prices/exchanges");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

export type SetApiKeyResult =
  | { ok: true }
  | { ok: false; error: string };

export async function setExchangeApiKeyAction(
  id: string,
  apiKey: string,
  apiSecret: string,
): Promise<SetApiKeyResult> {
  await requireAdminSectionPage(SECTION_PERM);
  try {
    await db
      .update(priceExchanges)
      .set({
        apiKey: apiKey.trim() || null,
        apiSecret: apiSecret.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(priceExchanges.id, id));
    revalidatePath("/admin/modules/prices/exchanges");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

export type HealthCheckActionResult =
  | { ok: true; latencyMs: number; status: "ok" | "fail"; error?: string }
  | { ok: false; error: string };

/**
 * Esegue health check live + persiste il risultato in
 * price_exchanges.last_health_*. Cosi' la lista mostra sempre lo
 * snapshot piu' recente senza dover hit l'API ogni page load.
 */
export async function healthCheckExchangeAction(
  id: string,
): Promise<HealthCheckActionResult> {
  await requireAdminSectionPage(SECTION_PERM);
  const adapter = getExchangeAdapter(id);
  if (!adapter) {
    return { ok: false, error: "Adapter non implementato in codice." };
  }
  let result: HealthCheckResult;
  try {
    result = await adapter.healthCheck();
  } catch (err) {
    const error = err instanceof Error ? err.message : "unknown";
    await db
      .update(priceExchanges)
      .set({
        lastHealthCheck: new Date(),
        lastHealthOk: false,
        lastHealthError: error,
        updatedAt: new Date(),
      })
      .where(eq(priceExchanges.id, id));
    revalidatePath("/admin/modules/prices/exchanges");
    return { ok: false, error };
  }

  await db
    .update(priceExchanges)
    .set({
      lastHealthCheck: new Date(),
      lastHealthOk: result.ok,
      lastHealthError: result.ok ? null : result.error ?? null,
      updatedAt: new Date(),
    })
    .where(eq(priceExchanges.id, id));
  revalidatePath("/admin/modules/prices/exchanges");
  return {
    ok: true,
    latencyMs: result.latencyMs,
    status: result.ok ? "ok" : "fail",
    error: result.error,
  };
}
