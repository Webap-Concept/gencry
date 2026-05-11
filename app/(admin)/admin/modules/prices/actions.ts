"use server";

import { getAdminPath } from "@/lib/admin-paths";
import { db } from "@/lib/db/drizzle";
import { pricesCoins } from "@/lib/db/schema";
import { updateAppSetting } from "@/lib/db/settings-queries";
import { fetchCoinMetadata } from "@/lib/modules/prices/sources/coingecko";
import { runPricesCleanup, runPricesSnapshot, runPricesSync } from "@/lib/modules/prices/sync";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export type ActionState =
  | {}
  | { success: string; timestamp: number }
  | { error: string; timestamp: number };

// ─────────────────────────────────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────────────────────────────────

function clampInt(raw: FormDataEntryValue | null, min: number, max: number, fallback: number): string {
  const n = raw == null ? NaN : Number(String(raw));
  if (!Number.isFinite(n) || n < min || n > max) return String(fallback);
  return String(Math.trunc(n));
}

function clampFloat01(raw: FormDataEntryValue | null, fallback: number): string {
  const n = raw == null ? NaN : Number(String(raw));
  if (!Number.isFinite(n) || n <= 0 || n >= 1) return String(fallback);
  return String(n);
}

export async function savePricesSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await updateAppSetting("modules.prices.cron_minutes",     clampInt(formData.get("modules.prices.cron_minutes"),     1, 60,    5));
    await updateAppSetting("modules.prices.universe_hours",   clampInt(formData.get("modules.prices.universe_hours"),   1, 168,   24));
    await updateAppSetting("modules.prices.delta_threshold",  clampFloat01(formData.get("modules.prices.delta_threshold"), 0.0005));
    await updateAppSetting("modules.prices.kv_ttl_seconds",   clampInt(formData.get("modules.prices.kv_ttl_seconds"),   1, 3600,  30));
    await updateAppSetting("modules.prices.breaker_max_err",  clampInt(formData.get("modules.prices.breaker_max_err"),  1, 100,   3));
    await updateAppSetting("modules.prices.breaker_window_s", clampInt(formData.get("modules.prices.breaker_window_s"), 10, 86400, 300));
    await updateAppSetting("modules.prices.breaker_open_s",   clampInt(formData.get("modules.prices.breaker_open_s"),   10, 86400, 600));
    await updateAppSetting("modules.prices.snapshot_minutes", clampInt(formData.get("modules.prices.snapshot_minutes"), 1, 60,    5));
    await updateAppSetting("modules.prices.retention_days",   clampInt(formData.get("modules.prices.retention_days"),   1, 365,   30));

    // CoinGecko Pro
    const proEnabledRaw = formData.get("modules.prices.coingecko_pro_enabled");
    await updateAppSetting(
      "modules.prices.coingecko_pro_enabled",
      proEnabledRaw === "true" || proEnabledRaw === "on" ? "true" : "false",
    );
    const proApiKey = ((formData.get("modules.prices.coingecko_pro_api_key") as string) ?? "").trim();
    await updateAppSetting("modules.prices.coingecko_pro_api_key", proApiKey || null);

    revalidatePath(await getAdminPath("prices-settings"));
    return { success: "Prices settings saved.", timestamp: Date.now() };
  } catch {
    return { error: "Save failed.", timestamp: Date.now() };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// CoinGecko Pro — test connection
// ─────────────────────────────────────────────────────────────────────────
//
// Verifica che la chiave Pro sia valida facendo un /ping authenticato.
// Chiavi invalide restituiscono 401/403, valide 200 con { gecko_says: ... }.
export async function testCoinGeckoProAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const apiKey = ((formData.get("modules.prices.coingecko_pro_api_key") as string) ?? "").trim();
    if (!apiKey) {
      return { error: "Enter the API key before testing.", timestamp: Date.now() };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let res: Response;
    try {
      res = await fetch("https://pro-api.coingecko.com/api/v3/ping", {
        headers: {
          Accept: "application/json",
          "x-cg-pro-api-key": apiKey,
        },
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "fetch failed";
      return { error: `Network error: ${message}`, timestamp: Date.now() };
    } finally {
      clearTimeout(timeout);
    }

    if (res.status === 401 || res.status === 403) {
      return { error: "Invalid API key (401/403 from CoinGecko Pro).", timestamp: Date.now() };
    }
    if (res.status === 429) {
      return { error: "Rate limit hit (429). Key may be valid but quota exhausted.", timestamp: Date.now() };
    }
    if (!res.ok) {
      return { error: `CoinGecko Pro returned HTTP ${res.status}.`, timestamp: Date.now() };
    }
    const data = (await res.json().catch(() => null)) as { gecko_says?: string } | null;
    if (data?.gecko_says) {
      return { success: `Connected. ${data.gecko_says}`, timestamp: Date.now() };
    }
    return { success: "Connected (response OK).", timestamp: Date.now() };
  } catch {
    return { error: "Test failed.", timestamp: Date.now() };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Manual triggers (force = bypass early-exit)
// ─────────────────────────────────────────────────────────────────────────

export async function triggerSyncNowAction(): Promise<ActionState> {
  try {
    const result = await runPricesSync(true);
    revalidatePath(await getAdminPath("prices-overview"));
    return {
      success: result.ok
        ? `Sync OK · ${result.coinsUpdated}/${result.coinsTotal} coins · ${result.durationMs}ms`
        : `Sync error: ${result.error ?? "unknown"}`,
      timestamp: Date.now(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return { error: message, timestamp: Date.now() };
  }
}

export async function triggerSnapshotNowAction(): Promise<ActionState> {
  try {
    const result = await runPricesSnapshot(true);
    revalidatePath(await getAdminPath("prices-overview"));
    return {
      success: `Snapshot OK · ${result.coinsUpdated} coins · ${result.durationMs}ms`,
      timestamp: Date.now(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Snapshot failed";
    return { error: message, timestamp: Date.now() };
  }
}

export async function triggerCleanupNowAction(): Promise<ActionState> {
  try {
    const result = await runPricesCleanup();
    revalidatePath(await getAdminPath("prices-overview"));
    return {
      success: `Cleanup OK · ${result.coinsUpdated} rows deleted · ${result.durationMs}ms`,
      timestamp: Date.now(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cleanup failed";
    return { error: message, timestamp: Date.now() };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Coins registry CRUD
// ─────────────────────────────────────────────────────────────────────────

export async function addCoinAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const coingeckoId = ((formData.get("coingecko_id") as string) ?? "").trim().toLowerCase();
    if (!coingeckoId) {
      return { error: "Enter the CoinGecko ID (e.g. bitcoin, ethereum).", timestamp: Date.now() };
    }
    const meta = await fetchCoinMetadata(coingeckoId);
    if (!meta) {
      return { error: `CoinGecko ID "${coingeckoId}" not found.`, timestamp: Date.now() };
    }
    await db
      .insert(pricesCoins)
      .values({
        symbol: meta.symbol,
        coingeckoId,
        name: meta.name,
        imageUrl: meta.imageUrl ?? null,
        marketCap: meta.marketCap ?? null,
        category: meta.category ?? null,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: pricesCoins.symbol,
        set: {
          coingeckoId,
          name: meta.name,
          imageUrl: meta.imageUrl ?? null,
          marketCap: meta.marketCap ?? null,
          category: meta.category ?? null,
          isActive: true,
          updatedAt: new Date(),
        },
      });
    revalidatePath(await getAdminPath("prices-coins"));
    return { success: `${meta.symbol} (${meta.name}) added.`, timestamp: Date.now() };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Add coin failed";
    return { error: message, timestamp: Date.now() };
  }
}

export async function refetchCoinAction(symbol: string): Promise<ActionState> {
  try {
    const row = await db.select().from(pricesCoins).where(eq(pricesCoins.symbol, symbol)).limit(1);
    if (!row[0] || !row[0].coingeckoId) {
      return { error: `${symbol}: missing CoinGecko ID.`, timestamp: Date.now() };
    }
    const meta = await fetchCoinMetadata(row[0].coingeckoId);
    if (!meta) {
      return { error: `${symbol}: CoinGecko returned no data.`, timestamp: Date.now() };
    }
    await db
      .update(pricesCoins)
      .set({
        name: meta.name,
        imageUrl: meta.imageUrl ?? null,
        marketCap: meta.marketCap ?? null,
        category: meta.category ?? null,
        updatedAt: new Date(),
      })
      .where(eq(pricesCoins.symbol, symbol));
    revalidatePath(await getAdminPath("prices-coins"));
    return { success: `${symbol} metadata refreshed.`, timestamp: Date.now() };
  } catch {
    return { error: "Refetch failed.", timestamp: Date.now() };
  }
}

export async function toggleCoinActiveAction(
  symbol: string,
  isActive: boolean,
): Promise<ActionState> {
  try {
    await db
      .update(pricesCoins)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(pricesCoins.symbol, symbol));
    revalidatePath(await getAdminPath("prices-coins"));
    return {
      success: `${symbol} ${isActive ? "activated" : "deactivated"}.`,
      timestamp: Date.now(),
    };
  } catch {
    return { error: "Toggle failed.", timestamp: Date.now() };
  }
}

export async function deleteCoinAction(symbol: string): Promise<ActionState> {
  try {
    await db.delete(pricesCoins).where(eq(pricesCoins.symbol, symbol));
    revalidatePath(await getAdminPath("prices-coins"));
    return { success: `${symbol} removed.`, timestamp: Date.now() };
  } catch {
    return { error: "Delete failed.", timestamp: Date.now() };
  }
}
