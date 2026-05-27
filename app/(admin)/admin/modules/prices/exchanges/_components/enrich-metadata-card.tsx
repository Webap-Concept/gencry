"use client";
// app/(admin)/admin/modules/prices/exchanges/_components/enrich-metadata-card.tsx
//
// Enrichment metadata da CoinGecko. Completa name/image/marketCapRank/
// sparkline per i coin senza coingecko_id (tipicamente importati
// wholesale da exchange). Idempotente, rate-limit aware.

import { AdminButton } from "@/app/(admin)/admin/_components/admin-button";
import { adminFieldStyle } from "@/app/(admin)/admin/_components/admin-dialog";
import { Loader2, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  enrichCoinsMetadataAction,
  type EnrichMetadataResult,
} from "../actions";

const DEFAULT_BATCH = 200;

export function EnrichMetadataCard({
  awaitingCount,
}: {
  /** Coin con coingecko_id IS NULL. Quando arriva a 0, niente da fare. */
  awaitingCount: number;
}) {
  const router = useRouter();
  const [batchSize, setBatchSize] = useState<number>(DEFAULT_BATCH);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<EnrichMetadataResult | null>(null);

  function run() {
    setResult(null);
    startTransition(async () => {
      const res = await enrichCoinsMetadataAction(batchSize);
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
          <Wand2 size={16} strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <h3
            className="text-sm font-semibold"
            style={{ color: "var(--admin-text)" }}>
            Enrich metadata from CoinGecko
          </h3>
          <p
            className="text-[12px] mt-0.5"
            style={{ color: "var(--admin-text-faint)" }}>
            Completa <strong>name</strong>, <strong>image</strong> (mirror
            su R2), <strong>market cap rank</strong> e{" "}
            <strong>sparkline 7d</strong> per i coin importati wholesale
            dagli exchange. Match per symbol con <code>/coins/list</code>{" "}
            CoinGecko; in caso di collisione (stesso ticker) vince quello
            con market cap rank piu&apos; basso.
          </p>
          <p
            className="text-[12px] mt-1.5"
            style={{
              color:
                awaitingCount > 0
                  ? "var(--admin-text)"
                  : "var(--admin-text-faint)",
            }}>
            Coin in attesa di enrichment:{" "}
            <strong
              style={{
                color:
                  awaitingCount > 0
                    ? "var(--admin-accent)"
                    : "var(--gc-pos, #10b981)",
              }}>
              {awaitingCount}
            </strong>
          </p>
        </div>
      </header>

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-[140px_auto] items-end">
        <label className="block">
          <span
            className="block text-[11px] uppercase tracking-wider font-medium mb-1.5"
            style={{ color: "var(--admin-text-faint)" }}>
            Batch size
          </span>
          <input
            type="number"
            value={batchSize}
            min={1}
            max={1000}
            step={50}
            onChange={(e) =>
              setBatchSize(
                Math.max(1, Math.min(1000, Number(e.target.value) || 1)),
              )
            }
            disabled={pending || awaitingCount === 0}
            style={adminFieldStyle}
          />
        </label>

        <AdminButton
          variant="primary"
          size="md"
          icon={pending ? Loader2 : Wand2}
          onClick={run}
          disabled={pending || awaitingCount === 0}>
          {pending
            ? "Enriching…"
            : awaitingCount === 0
              ? "Nessun coin da arricchire"
              : "Esegui enrichment"}
        </AdminButton>
      </div>

      {result && <ResultPanel result={result} />}
    </section>
  );
}

function ResultPanel({ result }: { result: EnrichMetadataResult }) {
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
        Caricati: <strong>{result.candidatesLoaded}</strong> · Match symbol
        in CoinGecko: <strong>{result.matched}</strong> · No match (no
        listing CoinGecko): <strong>{result.noMatch}</strong>
      </p>
      <p>
        Arricchiti ora:{" "}
        <strong style={{ color: "var(--gc-pos, #10b981)" }}>
          {result.enriched}
        </strong>
        {result.imageMirrorFailed > 0 && (
          <>
            {" "}
            · Image mirror R2 falliti: <strong>{result.imageMirrorFailed}</strong>
          </>
        )}
        {result.errors > 0 && (
          <>
            {" "}
            · Errori DB:{" "}
            <strong style={{ color: "var(--gc-neg, #dc2626)" }}>
              {result.errors}
            </strong>
          </>
        )}
      </p>
      {result.enrichedSamples.length > 0 && (
        <p style={{ color: "var(--admin-text-faint)" }}>
          Sample: {result.enrichedSamples.join(", ")}
          {result.enriched > result.enrichedSamples.length ? "…" : ""}
        </p>
      )}
    </div>
  );
}
