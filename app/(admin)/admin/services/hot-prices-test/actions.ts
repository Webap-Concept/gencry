"use server";
// app/(admin)/admin/services/hot-prices-test/actions.ts
//
// Server actions diagnostiche per il flow Redis-first prices.
// Temporanea (PR2). Permette di:
//   - verificare che Upstash sia raggiungibile (PING manuale)
//   - leggere lo snapshot corrente (vedi se il cron sta scrivendo)
//   - scrivere un sample (verifica write path)
//   - forzare un run del cron (bypass cadence check)

import { getRedisClient, isUpstashConfigured } from "@/lib/kv/sdk";
import {
  getHotPrices,
  setHotPrices,
} from "@/lib/modules/prices/services/hot-prices";
import { runPricesSync } from "@/lib/modules/prices/sync";
import type { PriceQuote } from "@/lib/modules/prices/types";
import { requireAdminSectionPage } from "@/lib/rbac/guards";

const HOT_PRICES_KEY = "prices:current:all";

export type DiagnosticsState = {
  upstashConfigured: boolean;
  redisPing: { ok: boolean; latencyMs: number; error?: string } | null;
  hotSnapshot:
    | { present: false }
    | {
        present: true;
        updatedAt: number;
        ageSeconds: number;
        quotesCount: number;
        sampleSymbols: string[];
      };
  rawValueLength: number | null;
  ttlSeconds: number | null;
};

export async function loadDiagnostics(): Promise<DiagnosticsState> {
  await requireAdminSectionPage("admin:users");
  const upstashConfigured = await isUpstashConfigured();

  let redisPing: DiagnosticsState["redisPing"] = null;
  let hotSnapshot: DiagnosticsState["hotSnapshot"] = { present: false };
  let rawValueLength: number | null = null;
  let ttlSeconds: number | null = null;

  if (upstashConfigured) {
    const client = await getRedisClient();
    if (client) {
      // Ping leggero
      const t0 = Date.now();
      try {
        await client.ping();
        redisPing = { ok: true, latencyMs: Date.now() - t0 };
      } catch (err) {
        redisPing = {
          ok: false,
          latencyMs: Date.now() - t0,
          error: err instanceof Error ? err.message : "unknown",
        };
      }

      // Snapshot reading via service
      const data = await getHotPrices();
      if (data) {
        const symbols = Object.keys(data.quotes);
        hotSnapshot = {
          present: true,
          updatedAt: data.updatedAt,
          ageSeconds: Math.floor((Date.now() - data.updatedAt) / 1000),
          quotesCount: symbols.length,
          sampleSymbols: symbols.slice(0, 5),
        };
      }

      // TTL della chiave (informativo) e raw size (per capire se il payload
      // viene scritto). Upstash espone `ttl` e `strlen` come comandi standard.
      try {
        const ttl = await client.ttl(HOT_PRICES_KEY);
        ttlSeconds = typeof ttl === "number" ? ttl : null;
      } catch {
        ttlSeconds = null;
      }
      try {
        const raw = await client.get<unknown>(HOT_PRICES_KEY);
        rawValueLength = raw ? JSON.stringify(raw).length : 0;
      } catch {
        rawValueLength = null;
      }
    }
  }

  return {
    upstashConfigured,
    redisPing,
    hotSnapshot,
    rawValueLength,
    ttlSeconds,
  };
}

export type SampleWriteResult =
  | { ok: true; latencyMs: number; quotesWritten: number }
  | { ok: false; error: string };

export async function writeSampleAction(): Promise<SampleWriteResult> {
  await requireAdminSectionPage("admin:users");
  const t0 = Date.now();
  const sample = new Map<string, PriceQuote>([
    [
      "BTC",
      {
        symbol: "BTC",
        price: 99999,
        change24h: 1.23,
        volume24h: 1_000_000_000,
        sparkline7d: null,
        marketCap: null,
        marketCapRank: null,
      },
    ],
    [
      "ETH",
      {
        symbol: "ETH",
        price: 4444,
        change24h: -0.55,
        volume24h: 500_000_000,
        sparkline7d: null,
        marketCap: null,
        marketCapRank: null,
      },
    ],
  ]);
  try {
    const res = await setHotPrices(sample);
    if (!res.ok) {
      return {
        ok: false,
        error:
          "setHotPrices returned ok=false (Upstash not configured or write failed silently — vedi Vercel logs)",
      };
    }
    return { ok: true, latencyMs: Date.now() - t0, quotesWritten: sample.size };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}

export type ForceSyncResult =
  | {
      ok: true;
      durationMs: number;
      coinsTotal: number;
      coinsUpdated: number;
      sourceUsed: string | null;
    }
  | { ok: false; error: string };

export async function forceSyncAction(): Promise<ForceSyncResult> {
  await requireAdminSectionPage("admin:users");
  try {
    const res = await runPricesSync(true);
    return {
      ok: res.ok,
      durationMs: res.durationMs,
      coinsTotal: res.coinsTotal,
      coinsUpdated: res.coinsUpdated,
      sourceUsed: res.sourceUsed,
      error: res.ok ? undefined : res.error,
    } as ForceSyncResult;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}
