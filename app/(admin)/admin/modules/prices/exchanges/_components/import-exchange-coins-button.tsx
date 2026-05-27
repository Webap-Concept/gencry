"use client";
// app/(admin)/admin/modules/prices/exchanges/_components/import-exchange-coins-button.tsx
//
// "Import all USDT pairs" — popola prices_coins col catalogo wholesale
// dell'exchange (tutti i pair USDT con volume24h >= soglia). Pensato per
// partire con un universo grande senza dipendere da CoinGecko.
//
// I metadata (name leggibile, immagine, marketCap rank) sono lasciati
// vuoti e popolati dall'enrichment CoinGecko (action separata).

import { AdminButton } from "@/app/(admin)/admin/_components/admin-button";
import {
  AdminDialog,
  AdminDialogCancelButton,
  AdminDialogConfirmButton,
  AdminDialogContent,
  adminFieldStyle,
} from "@/app/(admin)/admin/_components/admin-dialog";
import { Download, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  importExchangeCoinsAction,
  type ImportExchangeCoinsResult,
} from "../actions";

const DEFAULT_MIN_VOLUME = 10_000;

export function ImportExchangeCoinsButton({
  exchangeId,
  exchangeLabel,
}: {
  exchangeId: string;
  exchangeLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [minVolume, setMinVolume] = useState<number>(DEFAULT_MIN_VOLUME);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportExchangeCoinsResult | null>(null);

  function run() {
    setResult(null);
    startTransition(async () => {
      const res = await importExchangeCoinsAction(exchangeId, minVolume);
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  function close() {
    if (pending) return;
    setOpen(false);
    setResult(null);
  }

  return (
    <>
      <AdminButton
        size="sm"
        variant="secondary"
        icon={Download}
        onClick={() => setOpen(true)}
        disabled={pending}>
        Import all USDT pairs
      </AdminButton>
      <AdminDialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <AdminDialogContent
          icon={Download}
          size="md"
          title={`Import wholesale — ${exchangeLabel}`}
          description={
            <>
              Importa TUTTI i pair USDT attivi sull&apos;exchange come nuovi
              coin del registry (routati su questo exchange). Skip dei coin
              gia&apos; esistenti. I metadata (name, image, market cap) restano
              vuoti finch&eacute; non lanci l&apos;enrichment CoinGecko.
            </>
          }
          footer={
            <>
              <AdminDialogCancelButton onClick={close} disabled={pending}>
                Chiudi
              </AdminDialogCancelButton>
              <AdminDialogConfirmButton onClick={run} loading={pending}>
                {pending ? "Importando…" : "Esegui import"}
              </AdminDialogConfirmButton>
            </>
          }>
          <div className="space-y-3">
            <label className="block">
              <span
                className="block text-[11px] uppercase tracking-wider font-medium mb-1.5"
                style={{ color: "var(--admin-text-faint)" }}>
                Volume 24h minimo (USDT) — filtra dust/scam
              </span>
              <input
                type="number"
                value={minVolume}
                min={0}
                step={1000}
                disabled={pending}
                onChange={(e) =>
                  setMinVolume(Math.max(0, Number(e.target.value) || 0))
                }
                style={adminFieldStyle}
              />
              <span
                className="block mt-1 text-[11px]"
                style={{ color: "var(--admin-text-faint)" }}>
                Default 10.000 USDT/24h. Sotto questa soglia i pair sono
                tipicamente illiquidi o scam.
              </span>
            </label>

            {pending && (
              <div
                className="rounded-lg p-3 text-[12.5px] flex items-center gap-2"
                style={{
                  background: "var(--admin-hover-bg)",
                  color: "var(--admin-text-muted)",
                }}>
                <Loader2 size={14} className="animate-spin" />
                Importando… questo puo&apos; richiedere 10-30s per exchange con
                catalogo grande.
              </div>
            )}

            {result && <ResultPanel result={result} />}
          </div>
        </AdminDialogContent>
      </AdminDialog>
    </>
  );
}

function ResultPanel({ result }: { result: ImportExchangeCoinsResult }) {
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
        Market trovati sull&apos;exchange:{" "}
        <strong>{result.marketsFromExchange}</strong>
      </p>
      <p>
        Scartati (sotto soglia volume):{" "}
        <strong>{result.skippedLowVolume}</strong> · Gia&apos; esistenti
        (skip): <strong>{result.skippedExisting}</strong>
      </p>
      <p>
        Inseriti nel registry:{" "}
        <strong style={{ color: "var(--gc-pos, #10b981)" }}>
          {result.inserted}
        </strong>
      </p>
      {result.insertedSamples.length > 0 && (
        <p style={{ color: "var(--admin-text-faint)" }}>
          Sample: {result.insertedSamples.join(", ")}
          {result.inserted > result.insertedSamples.length ? "…" : ""}
        </p>
      )}
    </div>
  );
}
