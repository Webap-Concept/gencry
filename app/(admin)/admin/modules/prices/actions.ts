"use server";

import { getAdminPath } from "@/lib/admin-paths";
import { db } from "@/lib/db/drizzle";
import { pricesCoins } from "@/lib/db/schema";
import { getAppSettings, updateAppSetting } from "@/lib/db/settings-queries";
import { getPricesConfig } from "@/lib/modules/prices/config";
import {
  fetchCoinMetadata,
  fetchTopCoinsByMarketCap,
} from "@/lib/modules/prices/sources/coingecko";
import {
  checkR2Connection,
  deleteCoinImage,
  mirrorCoinImage,
} from "@/lib/modules/prices/storage";
import { runPricesCleanup, runPricesSync } from "@/lib/modules/prices/sync";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
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

    // R2 storage settings — campi hidden+text dal form. Salviamo l'intera tupla;
    // il config layer (`getPricesConfig.parseR2Config`) considera R2 attivo solo
    // se TUTTE e 5 le chiavi sono valorizzate non-vuote.
    const r2AccountId    = ((formData.get("modules.prices.r2.account_id")        as string) ?? "").trim();
    const r2AccessKeyId  = ((formData.get("modules.prices.r2.access_key_id")     as string) ?? "").trim();
    const r2SecretRaw    = ((formData.get("modules.prices.r2.secret_access_key") as string) ?? "").trim();
    const r2Bucket       = ((formData.get("modules.prices.r2.bucket")            as string) ?? "").trim();
    const r2PublicBase   = ((formData.get("modules.prices.r2.public_base_url")   as string) ?? "").trim().replace(/\/+$/, "");

    await updateAppSetting("modules.prices.r2.account_id",        r2AccountId    || null);
    await updateAppSetting("modules.prices.r2.access_key_id",     r2AccessKeyId  || null);
    // Sentinel "********" significa "non modificare" (la UI mostra il placeholder
    // mascherato per non rivelare il secret salvato). Aggiorna solo se cambiato.
    if (r2SecretRaw && r2SecretRaw !== "********") {
      await updateAppSetting("modules.prices.r2.secret_access_key", r2SecretRaw);
    } else if (!r2SecretRaw) {
      await updateAppSetting("modules.prices.r2.secret_access_key", null);
    }
    await updateAppSetting("modules.prices.r2.bucket",            r2Bucket       || null);
    await updateAppSetting("modules.prices.r2.public_base_url",   r2PublicBase   || null);

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
// R2 storage — test connection
// ─────────────────────────────────────────────────────────────────────────
//
// HeadBucket verifica auth + esistenza+accesso al bucket in un'unica call.
// Il form invia il sentinel "********" quando l'utente non tocca il secret;
// in quel caso recuperiamo il valore reale dal DB così l'admin può testare
// la combinazione corrente senza dover reincollare il secret.
export async function testR2Action(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const accountId    = ((formData.get("modules.prices.r2.account_id")        as string) ?? "").trim();
    const accessKeyId  = ((formData.get("modules.prices.r2.access_key_id")     as string) ?? "").trim();
    const secretRaw    = ((formData.get("modules.prices.r2.secret_access_key") as string) ?? "").trim();
    const bucket       = ((formData.get("modules.prices.r2.bucket")            as string) ?? "").trim();
    const publicBase   = ((formData.get("modules.prices.r2.public_base_url")   as string) ?? "").trim().replace(/\/+$/, "");

    let secretAccessKey = secretRaw;
    if (!secretAccessKey || secretAccessKey === "********") {
      const settings = await getAppSettings();
      secretAccessKey = (settings["modules.prices.r2.secret_access_key"] ?? "").trim();
    }

    if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBase) {
      return {
        error: "Fill in all 5 R2 fields (and save the secret at least once) before testing.",
        timestamp: Date.now(),
      };
    }

    const result = await checkR2Connection({
      accountId,
      accessKeyId,
      secretAccessKey,
      bucket,
      publicBaseUrl: publicBase,
    });

    if (result.ok) {
      return {
        success: `R2 connection OK · bucket "${bucket}" reachable.`,
        timestamp: Date.now(),
      };
    }

    const message =
      result.reason === "forbidden"
        ? "Forbidden — the token does not have access to this bucket. Check Account ID, Access Key ID and Secret."
        : result.reason === "not_found"
          ? `Bucket "${bucket}" not found on this Cloudflare account.`
          : result.reason === "network"
            ? "Network error reaching the R2 endpoint. Check connectivity and Account ID."
            : result.reason === "timeout"
              ? "Timeout (10s) reaching R2. The endpoint did not respond in time."
              : `Unexpected error${result.detail ? `: ${result.detail}` : ""}.`;

    return { error: message, timestamp: Date.now() };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Test failed.";
    return { error: message, timestamp: Date.now() };
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
    // Snapshot ora vive dentro runPricesSync: forziamo un sync run, che
    // include la scrittura di prices_history con i prezzi freschi. Voce
    // "Trigger snapshot now" dell'admin mantenuta per backward compat
    // ma sotto il cofano fa esattamente lo stesso del trigger sync.
    const result = await runPricesSync(true);
    revalidatePath(await getAdminPath("prices-overview"));
    return {
      success: `Sync+snapshot OK · ${result.coinsUpdated} coins · ${result.durationMs}ms`,
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

    // Mirror dell'image su R2 se configurato — l'URL salvato in DB punta al
    // nostro custom domain, niente fetch esterni dal frontend pubblico. Se R2
    // non è configurato, fallback all'URL CoinGecko (graceful degradation).
    const cfg = await getPricesConfig();
    const finalImageUrl = await mirrorImageWithFallback(
      cfg.r2,
      meta.symbol,
      meta.imageUrl ?? null,
    );

    await db
      .insert(pricesCoins)
      .values({
        symbol: meta.symbol,
        coingeckoId,
        name: meta.name,
        imageUrl: finalImageUrl,
        marketCap: meta.marketCap ?? null,
        category: meta.category ?? null,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: pricesCoins.symbol,
        set: {
          coingeckoId,
          name: meta.name,
          imageUrl: finalImageUrl,
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

// ─────────────────────────────────────────────────────────────────────────
// Bulk import — top coins by market cap
// ─────────────────────────────────────────────────────────────────────────
//
// 1 call CoinGecko /coins/markets (free OK) ritorna fino a 250 coin con
// id+symbol+name+image+market_cap. Insert in DB con ON CONFLICT, mirror R2
// in parallelo a concurrency 5 per restare sotto il timeout serverless (60s
// default Next) anche col massimo batch (250 coin × ~0.5s sequenziali =
// 125s → con 5-wide = ~25s).
//
// Category non popolata: /markets non la include, e fare un /coins/{id}
// per ognuna brucerebbe il rate limit del free tier. Una "Refresh metadata"
// (singola o futura bulk-refresh) può colmare il dato dopo.
export async function bulkImportTopCoinsAction(
  perPage: number,
  page: number,
  updateExisting: boolean,
): Promise<ActionState> {
  try {
    const safePerPage = Math.max(1, Math.min(250, Math.trunc(perPage) || 50));
    const safePage    = Math.max(1, Math.trunc(page) || 1);

    const coins = await fetchTopCoinsByMarketCap(safePerPage, safePage);
    if (coins.length === 0) {
      return {
        error: `CoinGecko returned no coins for page ${safePage} (per_page ${safePerPage}).`,
        timestamp: Date.now(),
      };
    }

    const cfg = await getPricesConfig();

    // Esistenti: vediamo quali symbol sono già nel DB così possiamo decidere
    // skip vs update per ogni coin senza una select-per-coin.
    const symbols = coins.map((c) => c.symbol);
    const existingRows = await db
      .select({ symbol: pricesCoins.symbol })
      .from(pricesCoins)
      .where(inArray(pricesCoins.symbol, symbols));
    const existingSet = new Set(existingRows.map((r) => r.symbol));

    let imported = 0;
    let updated  = 0;
    let skipped  = 0;
    let failed   = 0;
    const failedSymbols: string[] = [];

    // Mirror+upsert in chunks da 5 in parallelo. Niente p-limit dep: chunk
    // semplici sono sufficienti per N≤250, e rispettano comunque il vincolo
    // di concorrenza max contro R2.
    const CHUNK = 5;
    for (let i = 0; i < coins.length; i += CHUNK) {
      const slice = coins.slice(i, i + CHUNK);
      const results = await Promise.all(
        slice.map(async (c) => {
          const exists = existingSet.has(c.symbol);
          if (exists && !updateExisting) return { kind: "skipped" as const };

          try {
            const finalImageUrl = await mirrorImageWithFallback(
              cfg.r2,
              c.symbol,
              c.imageUrl,
            );
            await db
              .insert(pricesCoins)
              .values({
                symbol: c.symbol,
                coingeckoId: c.coingeckoId,
                name: c.name,
                imageUrl: finalImageUrl,
                marketCap: c.marketCap,
                category: null,
                isActive: true,
              })
              .onConflictDoUpdate({
                target: pricesCoins.symbol,
                set: {
                  coingeckoId: c.coingeckoId,
                  name: c.name,
                  imageUrl: finalImageUrl,
                  marketCap: c.marketCap,
                  updatedAt: new Date(),
                  // Niente toggle di isActive on update: rispettiamo la
                  // scelta admin precedente, l'import non riattiva una
                  // coin disattivata di proposito.
                },
              });
            return { kind: exists ? ("updated" as const) : ("imported" as const) };
          } catch (err) {
            console.error(`[bulk-import] ${c.symbol} failed:`, err);
            return { kind: "failed" as const, symbol: c.symbol };
          }
        }),
      );
      for (const r of results) {
        if (r.kind === "imported") imported++;
        else if (r.kind === "updated") updated++;
        else if (r.kind === "skipped") skipped++;
        else if (r.kind === "failed") {
          failed++;
          failedSymbols.push(r.symbol);
        }
      }
    }

    revalidatePath(await getAdminPath("prices-coins"));
    const detail =
      failed > 0
        ? ` · failed: ${failedSymbols.slice(0, 5).join(", ")}${failedSymbols.length > 5 ? "…" : ""}`
        : "";
    return {
      success: `Import done · imported ${imported} · updated ${updated} · skipped ${skipped} · failed ${failed}${detail}`,
      timestamp: Date.now(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bulk import failed";
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

    const cfg = await getPricesConfig();
    const finalImageUrl = await mirrorImageWithFallback(
      cfg.r2,
      meta.symbol,
      meta.imageUrl ?? null,
    );

    await db
      .update(pricesCoins)
      .set({
        name: meta.name,
        imageUrl: finalImageUrl,
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
    // Pulisci R2 prima del delete DB. Se R2 fallisce loggiamo ma proseguiamo:
    // un orphan in R2 è meno grave di un orphan in DB.
    const [existing] = await db
      .select({ imageUrl: pricesCoins.imageUrl })
      .from(pricesCoins)
      .where(eq(pricesCoins.symbol, symbol))
      .limit(1);
    if (existing?.imageUrl) {
      const cfg = await getPricesConfig();
      await deleteCoinImage(cfg.r2, symbol, existing.imageUrl);
    }

    await db.delete(pricesCoins).where(eq(pricesCoins.symbol, symbol));
    revalidatePath(await getAdminPath("prices-coins"));
    return { success: `${symbol} removed.`, timestamp: Date.now() };
  } catch {
    return { error: "Delete failed.", timestamp: Date.now() };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Backfill: rimirror su R2 tutte le coin con image_url legacy CoinGecko
// (URL che non inizia col custom domain R2 configurato). Idempotente:
// ri-runnabile, salta le coin già migrate.
// ─────────────────────────────────────────────────────────────────────────

export async function backfillCoinImagesAction(): Promise<ActionState> {
  try {
    const cfg = await getPricesConfig();
    if (!cfg.r2) {
      return {
        error: "R2 is not configured. Fill in the R2 storage settings first.",
        timestamp: Date.now(),
      };
    }

    const r2Prefix = cfg.r2.publicBaseUrl + "/";
    const allCoins = await db
      .select({
        symbol:      pricesCoins.symbol,
        imageUrl:    pricesCoins.imageUrl,
        coingeckoId: pricesCoins.coingeckoId,
      })
      .from(pricesCoins)
      .where(isNotNull(pricesCoins.imageUrl));

    let migrated = 0;
    let skipped  = 0;
    let failed   = 0;
    const failedSymbols: string[] = [];

    for (const coin of allCoins) {
      const url = coin.imageUrl ?? "";
      if (url.startsWith(r2Prefix)) {
        skipped++;
        continue;
      }
      try {
        const newUrl = await mirrorCoinImage(cfg.r2, coin.symbol, url);
        if (!newUrl) {
          failed++;
          failedSymbols.push(coin.symbol);
          continue;
        }
        await db
          .update(pricesCoins)
          .set({ imageUrl: newUrl, updatedAt: new Date() })
          .where(eq(pricesCoins.symbol, coin.symbol));
        migrated++;
      } catch (err) {
        console.error(`[backfill] ${coin.symbol} failed:`, err);
        failed++;
        failedSymbols.push(coin.symbol);
      }
    }

    revalidatePath(await getAdminPath("prices-coins"));
    const detail =
      failed > 0
        ? ` · failed: ${failedSymbols.slice(0, 5).join(", ")}${failedSymbols.length > 5 ? "…" : ""}`
        : "";
    return {
      success: `Backfill done · migrated ${migrated} · skipped ${skipped} · failed ${failed}${detail}`,
      timestamp: Date.now(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Backfill failed";
    return { error: message, timestamp: Date.now() };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────────

/**
 * Tenta il mirror su R2; se R2 non è configurato o il mirror fallisce,
 * ritorna l'URL sorgente come fallback. Mai throw — i caller non devono
 * preoccuparsi: `null` se non c'è proprio immagine da salvare.
 */
async function mirrorImageWithFallback(
  r2: Awaited<ReturnType<typeof getPricesConfig>>["r2"],
  symbol: string,
  sourceUrl: string | null,
): Promise<string | null> {
  if (!sourceUrl) return null;
  if (!r2) return sourceUrl;
  try {
    const mirrored = await mirrorCoinImage(r2, symbol, sourceUrl);
    return mirrored ?? sourceUrl;
  } catch (err) {
    console.error(`[prices/actions] R2 mirror failed for ${symbol}, using source URL:`, err);
    return sourceUrl;
  }
}
