import "server-only";
// lib/modules/prices/services/usdt-rate.ts
//
// Tasso di cambio USDT → USD reale. I prezzi degli exchange (Binance,
// KuCoin) sono quotati in USDT, non in USD: con USDT leggermente
// depeggato (~0.998) il prezzo BTCUSDT è ~0.15% più alto del prezzo USD
// "reale" che mostrano CoinMarketCap / CoinGecko. Moltiplicando per
// questo tasso allineiamo i nostri prezzi exchange a quelli aggregati.
//
// Fonte: CoinGecko /simple/price?ids=tether (la stessa base di CMC).
// Cache Redis 15 min: USDT è uno stablecoin, si muove lentissimo → 1
// fetch ogni 15 min, costo trascurabile.
//
// Fail-safe: qualsiasi errore (CoinGecko down, timeout, valore fuori
// range) → ritorna 1.0, che degrada al comportamento "prezzo = USDT"
// di prima. Mai throw: il cron non deve fallire per questo.

import { getRedisClient } from "@/lib/kv/sdk";

const RATE_KEY = "prices:usdt_usd_rate";
const RATE_TTL_SECONDS = 900; // 15 min
const FALLBACK_RATE = 1.0;
// Clamp difensivo: un tasso fuori da questa banda è dato corrotto, non un
// depeg reale (USDT non si è mai mosso oltre ~0.97-1.02 storicamente).
const MIN_RATE = 0.95;
const MAX_RATE = 1.05;

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=usd";
const TIMEOUT_MS = 6_000;

/**
 * Tasso USDT/USD corrente. Cache-aside su Redis (TTL 15min). Ritorna
 * sempre un numero valido in [MIN_RATE, MAX_RATE]; 1.0 se la fonte non è
 * disponibile (degradazione graceful).
 */
export async function getUsdtUsdRate(): Promise<number> {
  const client = await getRedisClient();

  if (client) {
    try {
      const cached = await client.get<number>(RATE_KEY);
      if (typeof cached === "number" && cached >= MIN_RATE && cached <= MAX_RATE) {
        return cached;
      }
    } catch (err) {
      console.warn("[usdt-rate] cache read failed:", err);
    }
  }

  const rate = await fetchUsdtRate();
  if (rate === null) return FALLBACK_RATE;

  if (client) {
    try {
      await client.set(RATE_KEY, rate, { ex: RATE_TTL_SECONDS });
    } catch (err) {
      console.warn("[usdt-rate] cache write failed:", err);
    }
  }
  return rate;
}

/** Fetch del tasso da CoinGecko. null su qualsiasi errore o valore sospetto. */
async function fetchUsdtRate(): Promise<number | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(COINGECKO_URL, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { tether?: { usd?: number } };
    const rate = data.tether?.usd;
    if (
      typeof rate !== "number" ||
      !Number.isFinite(rate) ||
      rate < MIN_RATE ||
      rate > MAX_RATE
    ) {
      return null;
    }
    return rate;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
