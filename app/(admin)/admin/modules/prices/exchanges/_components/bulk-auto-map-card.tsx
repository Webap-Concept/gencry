"use client";
// app/(admin)/admin/modules/prices/exchanges/_components/bulk-auto-map-card.tsx
//
// Bulk auto-map: prende i top N coin attivi (per market_cap_rank) e li
// routa su un exchange. Per ogni coin candidato verifica via
// exchangeInfo che il pair <SYM>USDT esista; skip i coin gia' mappati e
// quelli non listati. Operazione idempotente.

import { AdminButton } from "@/app/(admin)/admin/_components/admin-button";
import { adminFieldStyle } from "@/app/(admin)/admin/_components/admin-dialog";
import { Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { bulkAutoMapAction, type BulkAutoMapResult } from "../actions";

const BULK_DEFAULT_N = 600;

type Props = {
  /** Lista degli exchange disponibili nel dropdown. Solo gli enabled
   *  effettivamente listano qui (per non bulk-mappare su un exchange
   *  che il cron poi non userebbe). */
  availableExchanges: { id: string; label: string }[];
};

export function BulkAutoMapCard({ availableExchanges }: Props) {
  const router = useRouter();
  const [exchangeId, setExchangeId] = useState<string>(
    availableExchanges[0]?.id ?? "",
  );
  const [topN, setTopN] = useState<number>(BULK_DEFAULT_N);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<BulkAutoMapResult | null>(null);

  function run() {
    if (!exchangeId) return;
    setResult(null);
    startTransition(async () => {
      const res = await bulkAutoMapAction(exchangeId, topN);
      setResult(res);
      router.refresh();
    });
  }

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
            background:
              "color-mix(in srgb, var(--admin-accent) 12%, transparent)",
            color: "var(--admin-accent)",
          }}>
          <Sparkles size={16} strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <h3
            className="text-sm font-semibold"
            style={{ color: "var(--admin-text)" }}>
            Bulk auto-map
          </h3>
          <p
            className="text-[12px] mt-0.5"
            style={{ color: "var(--admin-text-faint)" }}>
            Mappa automaticamente i top N coin (per market cap) su un exchange.
            Per ogni coin verifica via <code>exchangeInfo</code> che il pair{" "}
            <code>&lt;SYM&gt;USDT</code> sia listato; skip quelli gia' mappati e
            quelli non listati. Idempotente.
          </p>
        </div>
      </header>

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-[1fr_140px_auto] items-end">
        <label className="block">
          <span
            className="block text-[11px] uppercase tracking-wider font-medium mb-1.5"
            style={{ color: "var(--admin-text-faint)" }}>
            Exchange target
          </span>
          <select
            value={exchangeId}
            onChange={(e) => setExchangeId(e.target.value)}
            disabled={pending || availableExchanges.length === 0}
            style={adminFieldStyle}>
            {availableExchanges.length === 0 ? (
              <option value="">— nessun exchange abilitato —</option>
            ) : (
              availableExchanges.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.label}
                </option>
              ))
            )}
          </select>
        </label>

        <label className="block">
          <span
            className="block text-[11px] uppercase tracking-wider font-medium mb-1.5"
            style={{ color: "var(--admin-text-faint)" }}>
            Top N coin
          </span>
          <input
            type="number"
            value={topN}
            min={1}
            max={5000}
            step={50}
            onChange={(e) =>
              setTopN(Math.max(1, Math.min(5000, Number(e.target.value) || 1)))
            }
            disabled={pending}
            style={adminFieldStyle}
          />
        </label>

        <AdminButton
          variant="primary"
          size="md"
          icon={pending ? Loader2 : Sparkles}
          onClick={run}
          disabled={pending || !exchangeId}>
          {pending ? "Mappando…" : "Esegui auto-map"}
        </AdminButton>
      </div>

      {result && <ResultPanel result={result} />}
    </section>
  );
}

function ResultPanel({ result }: { result: BulkAutoMapResult }) {
  if (!result.ok) {
    return (
      <div
        className="rounded-lg p-3 text-[12.5px]"
        style={{
          background:
            "color-mix(in srgb, var(--gc-neg, #dc2626) 10%, transparent)",
          color: "var(--gc-neg, #dc2626)",
          border:
            "1px solid color-mix(in srgb, var(--gc-neg, #dc2626) 30%, transparent)",
        }}>
        Errore: {result.error}
      </div>
    );
  }
  return (
    <div
      className="rounded-lg p-3 text-[12.5px] space-y-1"
      style={{
        background:
          "color-mix(in srgb, var(--gc-pos, #10b981) 8%, transparent)",
        border:
          "1px solid color-mix(in srgb, var(--gc-pos, #10b981) 30%, transparent)",
        color: "var(--admin-text-muted)",
      }}>
      <p>
        Top richiesti: <strong>{result.requestedTop}</strong> · Candidati
        valutati (non gia' mappati): <strong>{result.coinsEvaluated}</strong>
      </p>
      <p>
        Mappati ora:{" "}
        <strong style={{ color: "var(--gc-pos, #10b981)" }}>
          {result.mapped}
        </strong>{" "}
        · Non listati sull&apos;exchange:{" "}
        <strong>{result.notListedOnExchange}</strong>
      </p>
      {result.mappedSamples.length > 0 && (
        <p style={{ color: "var(--admin-text-faint)" }}>
          Sample: {result.mappedSamples.join(", ")}
          {result.mapped > result.mappedSamples.length ? "…" : ""}
        </p>
      )}
    </div>
  );
}
