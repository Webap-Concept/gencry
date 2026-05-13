"use client";

// app/(admin)/admin/modules/prices/_components/storage-simulator.tsx
// Simulatore costi/storage Supabase per il modulo Prices. Aggiorna live
// righe e dimensione stimata di `prices_history` in base a 3 variabili:
// snapshot_minutes, retention_days, numero coin attivi. L'admin lo usa
// come "what-if" prima di toccare le settings reali.
//
// Numeri usati (allineati a Supabase 2026):
//   - byte/riga prices_history: 90 (overhead Postgres + 8 id + ~22 symbol
//     + 8 ts + ~16 numeric + tuple header)
//   - overhead indice idx_prices_history_symbol_ts: +35%
//   - tier soglie: Free 500MB, Pro 8GB
//   - extra storage Pro: $0.125/GB/mese

import { useMemo, useState } from "react";

const BYTES_PER_ROW = 90;
const INDEX_OVERHEAD = 0.35;
const FREE_TIER_MB = 500;
const PRO_TIER_GB = 8;
const PRO_EXTRA_USD_PER_GB_MONTH = 0.125;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

export function StorageSimulator({
  initialCoinsCount,
  initialSnapshotMinutes,
  initialRetentionDays,
}: {
  initialCoinsCount: number;
  initialSnapshotMinutes: number;
  initialRetentionDays: number;
}) {
  const [coins, setCoins] = useState(initialCoinsCount);
  const [snapshotMinutes, setSnapshotMinutes] = useState(initialSnapshotMinutes);
  const [retentionDays, setRetentionDays] = useState(initialRetentionDays);

  const stats = useMemo(() => {
    const pointsPerDay = (60 / snapshotMinutes) * 24;
    const rowsPerDay = coins * pointsPerDay;
    const rowsTotal = rowsPerDay * retentionDays;
    const bytesTable = rowsTotal * BYTES_PER_ROW;
    const bytesIndex = bytesTable * INDEX_OVERHEAD;
    const bytesTotal = bytesTable + bytesIndex;
    const mbTotal = bytesTotal / (1024 * 1024);
    const gbTotal = mbTotal / 1024;

    // % rispetto ai tier
    const pctFree = (mbTotal / FREE_TIER_MB) * 100;
    const pctPro = (gbTotal / PRO_TIER_GB) * 100;

    // Costo extra oltre Pro (se sfora)
    const extraGb = Math.max(0, gbTotal - PRO_TIER_GB);
    const extraCostMonth = extraGb * PRO_EXTRA_USD_PER_GB_MONTH;

    // Banding: scegliamo il tier minimo necessario e relativo colore
    let tier: "free-ok" | "free-tight" | "pro-ok" | "pro-tight" | "pro-extra";
    if (mbTotal <= FREE_TIER_MB * 0.5) tier = "free-ok";
    else if (mbTotal <= FREE_TIER_MB) tier = "free-tight";
    else if (gbTotal <= PRO_TIER_GB * 0.75) tier = "pro-ok";
    else if (gbTotal <= PRO_TIER_GB) tier = "pro-tight";
    else tier = "pro-extra";

    return {
      rowsPerDay,
      rowsTotal,
      bytesTotal,
      mbTotal,
      gbTotal,
      pctFree,
      pctPro,
      extraGb,
      extraCostMonth,
      tier,
    };
  }, [coins, snapshotMinutes, retentionDays]);

  const tierLabel: Record<typeof stats.tier, { text: string; tone: string }> = {
    "free-ok": { text: "✓ Sta dentro Supabase Free (margine)", tone: "good" },
    "free-tight": { text: "⚠ Sta dentro Free ma stretto", tone: "warn" },
    "pro-ok": { text: "✓ Richiede Pro · margine ok", tone: "good" },
    "pro-tight": { text: "⚠ Pro · prossimo al limite 8GB", tone: "warn" },
    "pro-extra": {
      text: `✗ Sfora Pro · $${stats.extraCostMonth.toFixed(2)}/mese extra storage`,
      tone: "bad",
    },
  };

  return (
    <section
      style={{
        background: "var(--admin-bg-1, #fff)",
        border: "1px solid var(--admin-line, #e5e7eb)",
        borderRadius: 12,
        padding: 16,
      }}
    >
      <header style={{ marginBottom: 12 }}>
        <h3
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--admin-fg, #111827)",
            marginBottom: 4,
          }}
        >
          Storage simulator
        </h3>
        <p style={{ fontSize: 12, color: "var(--admin-fg-3, #6b7280)" }}>
          Stima dimensione di <code>prices_history</code> in base alle 3
          variabili. Modifica i campi qui per fare "what-if" senza salvare.
          Per applicare davvero, usa il form sopra.
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <SliderField
          label="Cadenza snapshot (min)"
          value={snapshotMinutes}
          min={1}
          max={120}
          step={1}
          onChange={(v) => setSnapshotMinutes(clamp(v, 1, 120))}
        />
        <SliderField
          label="Retention (giorni)"
          value={retentionDays}
          min={1}
          max={365}
          step={1}
          onChange={(v) => setRetentionDays(clamp(v, 1, 365))}
        />
        <SliderField
          label="Coin attivi"
          value={coins}
          min={1}
          max={1000}
          step={1}
          onChange={(v) => setCoins(clamp(v, 1, 1000))}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Stat label="Righe / giorno" value={formatNumber(stats.rowsPerDay)} />
        <Stat label="Righe totali" value={formatNumber(stats.rowsTotal)} />
        <Stat label="Storage stimato" value={formatBytes(stats.bytesTotal)} />
        <Stat
          label="Punti / giorno / coin"
          value={String(Math.round((60 / snapshotMinutes) * 24))}
        />
      </div>

      <TierBar pctFree={stats.pctFree} pctPro={stats.pctPro} />

      <p
        style={{
          marginTop: 12,
          fontSize: 13,
          fontWeight: 600,
          color:
            tierLabel[stats.tier].tone === "good"
              ? "var(--admin-success, #16a34a)"
              : tierLabel[stats.tier].tone === "warn"
                ? "var(--admin-warning, #ca8a04)"
                : "var(--admin-error, #dc2626)",
        }}
      >
        {tierLabel[stats.tier].text}
      </p>

      <p
        style={{
          marginTop: 4,
          fontSize: 11,
          color: "var(--admin-fg-3, #6b7280)",
        }}
      >
        Stima ~90 byte/riga + 35% indici. Tier Supabase: Free 500MB, Pro
        8GB + $0.125/GB extra. Numeri ±15%.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: 11,
          fontWeight: 500,
          color: "var(--admin-fg-2, #374151)",
          marginBottom: 4,
        }}
      >
        {label}
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            width: 64,
            padding: "4px 6px",
            fontSize: 13,
            border: "1px solid var(--admin-line, #e5e7eb)",
            borderRadius: 6,
            background: "var(--admin-input-bg, #fff)",
            color: "var(--admin-fg, #111827)",
          }}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "var(--admin-bg-2, #f9fafb)",
        border: "1px solid var(--admin-line, #e5e7eb)",
        borderRadius: 8,
        padding: "8px 10px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--admin-fg-3, #6b7280)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--admin-fg, #111827)",
          marginTop: 2,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function TierBar({ pctFree, pctPro }: { pctFree: number; pctPro: number }) {
  // Disegna una barra con 2 marker (Free 500MB, Pro 8GB). Il fill è il
  // pctFree (clamp 0-200%) — oltre il 200% si capisce comunque dal testo.
  const fillPct = Math.min(200, pctFree);
  const fillColor =
    pctFree <= 50
      ? "var(--admin-success, #16a34a)"
      : pctFree <= 100
        ? "var(--admin-warning, #ca8a04)"
        : pctPro <= 100
          ? "#fb923c"
          : "var(--admin-error, #dc2626)";

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          fontWeight: 500,
          color: "var(--admin-fg-3, #6b7280)",
          marginBottom: 4,
        }}
      >
        <span>Free 500MB ({pctFree.toFixed(0)}%)</span>
        <span>Pro 8GB ({pctPro.toFixed(1)}%)</span>
      </div>
      <div
        style={{
          position: "relative",
          height: 10,
          background: "var(--admin-bg-2, #f3f4f6)",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.min(100, fillPct / 2)}%`,
            height: "100%",
            background: fillColor,
            transition: "width 200ms ease, background 200ms ease",
          }}
        />
        {/* Marker Free 500MB → 25% della barra (Pro è 16× Free) */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "25%",
            width: 1,
            height: "100%",
            background: "var(--admin-fg-3, #6b7280)",
            opacity: 0.4,
          }}
        />
      </div>
    </div>
  );
}
