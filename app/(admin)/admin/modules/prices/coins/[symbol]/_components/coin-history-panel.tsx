// app/(admin)/admin/modules/prices/coins/[symbol]/_components/coin-history-panel.tsx
// Tabella prices_history paginata. Riga arrotondata evidenziata in giallo
// per far riconoscere visivamente i punti che il backfill rimpiazzerà.
import type { HistoryPage } from "@/lib/modules/prices/queries";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

function formatPriceFull(value: number): string {
  if (!Number.isFinite(value)) return "—";
  // Mostra fino a 8 decimali (la precisione di numeric(24,8)). Strippa
  // gli zeri trailing non significativi per leggibilità.
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  })}`;
}

function formatTs(d: Date): string {
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function isRounded(value: number): boolean {
  return Number.isFinite(value) && value === Math.trunc(value);
}

export function CoinHistoryPanel({
  symbol,
  historyPage,
  roundedRows,
}: {
  symbol: string;
  historyPage: HistoryPage;
  roundedRows: number;
}) {
  const { rows, total, page, pageSize } = historyPage;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const baseUrl = `/admin/modules/prices/coins/${symbol.toLowerCase()}`;

  return (
    <section
      className="rounded-xl shadow-sm p-6"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h3 className="text-sm font-semibold" style={{ color: "var(--admin-text)" }}>
          Prezzi storici
          <span className="font-normal" style={{ color: "var(--admin-text-faint)" }}>
            {" "}({total.toLocaleString("it-IT")} totali)
          </span>
        </h3>
        {roundedRows > 0 && (
          <span className="text-[11px]" style={{ color: "var(--admin-text-faint)" }}>
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: 2,
                background: "color-mix(in srgb, var(--admin-warning, #ca8a04) 30%, transparent)",
                marginRight: 6,
                verticalAlign: "middle",
              }}
            />
            = riga arrotondata (rimpiazzabile col Backfill)
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ color: "var(--admin-text)" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--admin-input-border)" }}>
              <th className="text-left py-2 px-3 font-mono uppercase tracking-wide text-[10px]" style={{ color: "var(--admin-text-faint)" }}>
                Timestamp
              </th>
              <th className="text-right py-2 px-3 font-mono uppercase tracking-wide text-[10px]" style={{ color: "var(--admin-text-faint)" }}>
                Prezzo USD
              </th>
              <th className="text-right py-2 px-3 font-mono uppercase tracking-wide text-[10px]" style={{ color: "var(--admin-text-faint)" }}>
                Id
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  className="text-center py-8"
                  style={{ color: "var(--admin-text-faint)" }}>
                  Nessun punto in <code>prices_history</code> per questo simbolo.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const rounded = isRounded(r.price);
                return (
                  <tr
                    key={r.id}
                    style={{
                      borderBottom: "1px solid color-mix(in srgb, var(--admin-input-border) 50%, transparent)",
                      background: rounded
                        ? "color-mix(in srgb, var(--admin-warning, #ca8a04) 8%, transparent)"
                        : "transparent",
                    }}>
                    <td className="py-1.5 px-3 font-mono tabular-nums" style={{ color: "var(--admin-text-muted)" }}>
                      {formatTs(r.ts)}
                    </td>
                    <td className="py-1.5 px-3 font-mono tabular-nums text-right">
                      {formatPriceFull(r.price)}
                    </td>
                    <td className="py-1.5 px-3 font-mono tabular-nums text-right" style={{ color: "var(--admin-text-faint)" }}>
                      {r.id}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-xs" style={{ color: "var(--admin-text-muted)" }}>
          <span>
            Pagina {safePage} di {totalPages} · {rows.length} righe
          </span>
          <div className="flex items-center gap-2">
            {safePage > 1 ? (
              <Link
                href={`${baseUrl}?page=${safePage - 1}`}
                className="flex items-center gap-1 px-2 py-1 rounded-md"
                style={{
                  background: "var(--admin-page-bg)",
                  border: "1px solid var(--admin-input-border)",
                  color: "var(--admin-text)",
                }}>
                <ChevronLeft size={12} />
                Prev
              </Link>
            ) : (
              <span className="opacity-40 flex items-center gap-1 px-2 py-1">
                <ChevronLeft size={12} />
                Prev
              </span>
            )}
            {safePage < totalPages ? (
              <Link
                href={`${baseUrl}?page=${safePage + 1}`}
                className="flex items-center gap-1 px-2 py-1 rounded-md"
                style={{
                  background: "var(--admin-page-bg)",
                  border: "1px solid var(--admin-input-border)",
                  color: "var(--admin-text)",
                }}>
                Next
                <ChevronRight size={12} />
              </Link>
            ) : (
              <span className="opacity-40 flex items-center gap-1 px-2 py-1">
                Next
                <ChevronRight size={12} />
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
