// app/(admin)/admin/modules/prices/coins/[symbol]/_components/coin-stats-cards.tsx
// Stats su prices_history: total / first / last / gap / rounded.
// Aiuta a capire se la coin ha storia sufficiente per i chart e se serve
// un backfill.
import type { CoinHistoryStats, CoinView } from "@/lib/modules/prices/queries";
import { LocalDateTime } from "./local-datetime";

const DATE_FMT: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
};

function daysBetween(a: Date | null, b: Date | null): string {
  if (!a || !b) return "—";
  const ms = Math.abs(b.getTime() - a.getTime());
  const days = ms / (24 * 3600 * 1000);
  if (days < 1) return `${(days * 24).toFixed(1)}h`;
  return `${days.toFixed(1)}gg`;
}

export function CoinStatsCards({
  coin: _coin,
  stats,
}: {
  coin: CoinView;
  stats: CoinHistoryStats;
}) {
  const roundedPct =
    stats.total > 0 ? ((stats.rounded / stats.total) * 100).toFixed(1) : "0";

  return (
    <section
      className="rounded-xl shadow-sm p-6"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--admin-text)" }}>
        Storico in <code className="font-mono text-[12px]">prices_history</code>
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <Stat
          label="Punti totali"
          value={stats.total.toLocaleString("it-IT")}
        />
        <Stat
          label="Copertura"
          value={daysBetween(stats.firstTs, stats.lastTs)}
        />
        <Stat
          label="Primo punto"
          value={stats.firstTs ? <LocalDateTime value={stats.firstTs} options={DATE_FMT} /> : "—"}
          mono
        />
        <Stat
          label="Ultimo punto"
          value={stats.lastTs ? <LocalDateTime value={stats.lastTs} options={DATE_FMT} /> : "—"}
          mono
        />
        <Stat
          label={stats.gaps > 0 ? `Gap (>2× step mediano)` : "Gap"}
          value={String(stats.gaps)}
          tone={stats.gaps > 5 ? "warn" : "ok"}
        />
      </div>

      {stats.rounded > 0 && (
        <div
          className="mt-4 px-3 py-2 rounded-lg text-xs"
          style={{
            background: "color-mix(in srgb, var(--admin-warning, #ca8a04) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--admin-warning, #ca8a04) 30%, transparent)",
            color: "var(--admin-text-muted)",
          }}>
          <strong style={{ color: "var(--admin-text)" }}>
            {stats.rounded.toLocaleString("it-IT")} punti arrotondati
          </strong>{" "}
          ({roundedPct}% del totale): hanno il prezzo come intero (eredità del
          vecchio path snapshot che copiava da <code>prices_data</code>{" "}
          settled). Avvia <em>Backfill price history</em> dalla registry per
          rimpiazzarli con valori precisi da CryptoCompare.
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  tone?: "ok" | "warn";
}) {
  return (
    <div
      style={{
        background: "var(--admin-page-bg)",
        border: "1px solid var(--admin-input-border)",
        borderRadius: 8,
        padding: "10px 12px",
      }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--admin-text-faint)",
        }}>
        {label}
      </div>
      <div
        style={{
          marginTop: 4,
          fontSize: mono ? 12 : 14,
          fontWeight: 600,
          fontFamily: mono ? "var(--font-mono), monospace" : undefined,
          color:
            tone === "warn"
              ? "var(--admin-warning, #ca8a04)"
              : "var(--admin-text)",
          fontVariantNumeric: "tabular-nums",
        }}>
        {value}
      </div>
    </div>
  );
}
