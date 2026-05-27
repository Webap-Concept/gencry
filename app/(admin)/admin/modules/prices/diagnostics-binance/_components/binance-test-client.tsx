"use client";
// app/(admin)/admin/services/binance-test/_components/binance-test-client.tsx
//
// UI client per testare manualmente l'adapter Binance. 3 azioni: current
// prices (BTC/ETH/SOL), historical klines (BTCUSDT range selezionabile),
// health ping. Mostra latenza + sample data. Temporanea: sara' sostituita
// in PR4 dalla UI completa di /admin/services/exchanges.

import { AdminButton } from "@/app/(admin)/admin/_components/admin-button";
import { useState, useTransition } from "react";
import { Activity, BarChart3, Heart, Loader2 } from "lucide-react";
import {
  testCurrentPricesAction,
  testHealthAction,
  testHistoricalAction,
  type TestCurrentResult,
  type TestHealthResult,
  type TestHistoricalResult,
} from "../actions";
import type { ChartRange } from "@/lib/modules/prices/exchanges/types";

const RANGES: ChartRange[] = ["1d", "1w", "1m", "3m", "6m", "1y"];

export function BinanceTestClient() {
  const [pending, startTransition] = useTransition();
  const [currentResult, setCurrentResult] = useState<TestCurrentResult | null>(null);
  const [historicalResult, setHistoricalResult] = useState<TestHistoricalResult | null>(null);
  const [healthResult, setHealthResult] = useState<TestHealthResult | null>(null);
  const [range, setRange] = useState<ChartRange>("1m");

  function runCurrent() {
    startTransition(async () => {
      setCurrentResult(null);
      const res = await testCurrentPricesAction();
      setCurrentResult(res);
    });
  }

  function runHistorical() {
    startTransition(async () => {
      setHistoricalResult(null);
      const res = await testHistoricalAction(range);
      setHistoricalResult(res);
    });
  }

  function runHealth() {
    startTransition(async () => {
      setHealthResult(null);
      const res = await testHealthAction();
      setHealthResult(res);
    });
  }

  return (
    <div className="space-y-6">
      {/* Health check */}
      <Section
        icon={Heart}
        title="Health check"
        description="Ping leggero a /api/v3/ping. Misura solo round-trip + auth.">
        <div className="flex items-center gap-2">
          <AdminButton
            variant="secondary"
            size="sm"
            icon={pending ? Loader2 : Heart}
            onClick={runHealth}
            disabled={pending}>
            {pending ? "Ping…" : "Esegui ping"}
          </AdminButton>
        </div>
        {healthResult && (
          <ResultCard ok={healthResult.ok} latencyMs={healthResult.latencyMs}>
            {healthResult.ok ? (
              <p className="text-[12px]" style={{ color: "var(--admin-text-muted)" }}>
                Server raggiungibile.
              </p>
            ) : (
              <p className="text-[12px]" style={{ color: "var(--gc-neg, #dc2626)" }}>
                Errore: {healthResult.error ?? "unknown"}
              </p>
            )}
          </ResultCard>
        )}
      </Section>

      {/* Current prices */}
      <Section
        icon={Activity}
        title="Current prices (BTC / ETH / SOL)"
        description="GET /api/v3/ticker/24hr batched. Risposta normalizzata nel PriceQuote canonico del modulo.">
        <AdminButton
          variant="secondary"
          size="sm"
          icon={pending ? Loader2 : Activity}
          onClick={runCurrent}
          disabled={pending}>
          {pending ? "Fetching…" : "Fetch ticker 24h"}
        </AdminButton>
        {currentResult && (
          <ResultCard ok={currentResult.ok} latencyMs={"latencyMs" in currentResult ? currentResult.latencyMs : null}>
            {currentResult.ok ? (
              <div className="space-y-2">
                {currentResult.quotes.map((q) => (
                  <div
                    key={q.symbol}
                    className="grid grid-cols-[60px_1fr] gap-3 text-[12px]"
                    style={{ color: "var(--admin-text)" }}>
                    <div className="font-semibold">{q.symbol}</div>
                    <div style={{ color: "var(--admin-text-muted)" }}>
                      ${q.price.toLocaleString("en-US", { maximumFractionDigits: 2 })} ·{" "}
                      <span
                        style={{
                          color:
                            q.change24h !== null && q.change24h >= 0
                              ? "var(--gc-pos, #10b981)"
                              : "var(--gc-neg, #dc2626)",
                        }}>
                        {q.change24h !== null ? `${q.change24h.toFixed(2)}%` : "—"}
                      </span>{" "}
                      · vol ${q.volume24h ? (q.volume24h / 1e6).toFixed(1) + "M" : "—"}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12px]" style={{ color: "var(--gc-neg, #dc2626)" }}>
                Errore: {currentResult.error}
              </p>
            )}
          </ResultCard>
        )}
      </Section>

      {/* Historical */}
      <Section
        icon={BarChart3}
        title="Historical klines (BTCUSDT)"
        description="GET /api/v3/klines. Mostra primo + ultimo punto della serie e numero totale di bucket.">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as ChartRange)}
            disabled={pending}
            style={{
              padding: "6px 10px",
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid var(--admin-input-border)",
              background: "var(--admin-page-bg)",
              color: "var(--admin-text)",
            }}>
            {RANGES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <AdminButton
            variant="secondary"
            size="sm"
            icon={pending ? Loader2 : BarChart3}
            onClick={runHistorical}
            disabled={pending}>
            {pending ? "Fetching…" : "Fetch klines"}
          </AdminButton>
        </div>
        {historicalResult && (
          <ResultCard ok={historicalResult.ok} latencyMs={"latencyMs" in historicalResult ? historicalResult.latencyMs : null}>
            {historicalResult.ok ? (
              <div className="space-y-1.5 text-[12px]" style={{ color: "var(--admin-text-muted)" }}>
                <p>
                  <strong style={{ color: "var(--admin-text)" }}>{historicalResult.symbol}</strong> · range{" "}
                  <strong style={{ color: "var(--admin-text)" }}>{historicalResult.range}</strong> ·{" "}
                  <strong style={{ color: "var(--admin-text)" }}>
                    {historicalResult.points.length}
                  </strong>{" "}
                  punti
                </p>
                {historicalResult.first && (
                  <p>
                    Primo: {new Date(historicalResult.first.ts).toLocaleString()} · $
                    {historicalResult.first.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                  </p>
                )}
                {historicalResult.last && (
                  <p>
                    Ultimo: {new Date(historicalResult.last.ts).toLocaleString()} · $
                    {historicalResult.last.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[12px]" style={{ color: "var(--gc-neg, #dc2626)" }}>
                Errore: {historicalResult.error}
              </p>
            )}
          </ResultCard>
        )}
      </Section>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Activity;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-xl p-5 space-y-3"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <header className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: "color-mix(in srgb, var(--admin-accent) 12%, transparent)",
            color: "var(--admin-accent)",
          }}>
          <Icon size={16} strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold" style={{ color: "var(--admin-text)" }}>
            {title}
          </h3>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--admin-text-faint)" }}>
            {description}
          </p>
        </div>
      </header>
      {children}
    </section>
  );
}

function ResultCard({
  ok,
  latencyMs,
  children,
}: {
  ok: boolean;
  latencyMs: number | null;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-lg p-3 space-y-2"
      style={{
        background: "var(--admin-page-bg)",
        border: `1px solid ${
          ok ? "color-mix(in srgb, #10b981 35%, transparent)" : "color-mix(in srgb, #dc2626 35%, transparent)"
        }`,
      }}>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span
          className="font-semibold uppercase tracking-wide"
          style={{ color: ok ? "var(--gc-pos, #10b981)" : "var(--gc-neg, #dc2626)" }}>
          {ok ? "OK" : "Errore"}
        </span>
        {latencyMs !== null && (
          <span style={{ color: "var(--admin-text-faint)" }}>{latencyMs} ms</span>
        )}
      </div>
      {children}
    </div>
  );
}
