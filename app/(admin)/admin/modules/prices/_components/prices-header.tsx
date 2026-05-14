"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { LucideIcon } from "lucide-react";
import { Activity, Clock, Coins, Info, LineChart, Settings } from "lucide-react";
import { usePathname } from "next/navigation";

type SectionMeta = {
  label: string;
  description: string;
  icon: LucideIcon;
};

const SECTIONS: Record<string, SectionMeta> = {
  prices: {
    label: "Health",
    description: "Live status of the price ingestion pipeline and recent runs.",
    icon: Activity,
  },
  coins: {
    label: "Coins Registry",
    description: "Tracked coins, last seen, force re-fetch metadata.",
    icon: Coins,
  },
  cron: {
    label: "Cron Jobs",
    description: "pg_cron jobs owned by the Prices Engine module.",
    icon: Clock,
  },
  settings: {
    label: "Settings",
    description: "Cron interval, active universe window, thresholds.",
    icon: Settings,
  },
};

const DEFAULT: SectionMeta = {
  label: "",
  description: "Crypto prices ingestion pipeline.",
  icon: LineChart,
};

export function PricesHeader() {
  const pathname = usePathname();
  const segment = pathname.split("/").pop() ?? "";
  const section = SECTIONS[segment] ?? DEFAULT;
  const Icon = section.icon;

  return (
    <div className="flex items-center gap-3">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{
          background: "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))",
          border: "1px solid color-mix(in srgb, var(--admin-accent) 25%, transparent)",
        }}>
        <Icon size={18} style={{ color: "var(--admin-accent)" }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold" style={{ color: "var(--admin-text)" }}>
            {section.label ? (
              <>
                <span style={{ color: "var(--admin-text-muted)" }}>Prices Engine</span>
                <span style={{ color: "var(--admin-text-faint)" }}> / </span>
                <span>{section.label}</span>
              </>
            ) : (
              "Prices Engine"
            )}
          </h2>
          <CacheGuideButton />
        </div>
        <p className="text-sm mt-0.5" style={{ color: "var(--admin-text-faint)" }}>
          {section.description}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Guida cache + invalidation (modale di documentazione)
// ---------------------------------------------------------------------------

function CacheGuideButton() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Guida cache e invalidazione"
          className="inline-flex items-center justify-center w-6 h-6 rounded-full transition-colors"
          style={{
            background: "transparent",
            color: "var(--admin-text-faint)",
          }}>
          <Info size={14} />
        </button>
      </DialogTrigger>
      <DialogContent
        className="max-w-2xl"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
          color: "var(--admin-text)",
        }}>
        <DialogHeader>
          <DialogTitle>Cache e invalidazione del modulo prezzi</DialogTitle>
          <DialogDescription style={{ color: "var(--admin-text-muted)" }}>
            Tutte le query lette dal frontend (card, chart, esplora) passano per{" "}
            <code className="font-mono">unstable_cache</code> con tag{" "}
            <code className="font-mono">prices-data</code>. TTL e
            invalidazioni qui sotto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm" style={{ color: "var(--admin-text)" }}>
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--admin-text-faint)" }}>
              Tag <code className="font-mono">prices-data</code>
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--admin-input-border)" }}>
                    <th className="text-left py-1.5 px-2 font-medium" style={{ color: "var(--admin-text-faint)" }}>
                      Endpoint
                    </th>
                    <th className="text-left py-1.5 px-2 font-medium" style={{ color: "var(--admin-text-faint)" }}>
                      TTL
                    </th>
                    <th className="text-left py-1.5 px-2 font-medium" style={{ color: "var(--admin-text-faint)" }}>
                      Note
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Card singola (CoinCard)", "60s", "Prezzo + sparkline 7gg + change24h"],
                    ["Pool top-200 (esplora/home)", "60s", "Una query batch sliceata in memoria"],
                    ["Chart 1d", "60s", "Granularità fine, segue il cron 5min"],
                    ["Chart 1w", "5 min", "Allineato col cron sync"],
                    ["Chart 1m", "30 min", "Carico DB più basso"],
                    ["Chart 1y", "1 h", "Dati storici stabili"],
                    ["fetchEarliestHistoryTs", "5 min", "Detect coverage per fallback CoinGecko"],
                  ].map(([endpoint, ttl, note]) => (
                    <tr key={endpoint} style={{ borderBottom: "1px solid color-mix(in srgb, var(--admin-input-border) 40%, transparent)" }}>
                      <td className="py-1.5 px-2 font-mono">{endpoint}</td>
                      <td className="py-1.5 px-2 font-mono tabular-nums">{ttl}</td>
                      <td className="py-1.5 px-2" style={{ color: "var(--admin-text-muted)" }}>
                        {note}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--admin-text-faint)" }}>
              Tag <code className="font-mono">prices-health</code>
            </h4>
            <p className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
              Stats sync runs e endpoint dashboard admin (recent runs, latency).
              TTL fisso <strong>60s</strong>.
            </p>
          </section>

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--admin-text-faint)" }}>
              Invalidazione automatica
            </h4>
            <ul className="text-xs space-y-1.5 list-disc list-outside ml-4" style={{ color: "var(--admin-text-muted)" }}>
              <li>
                <strong>Cron sync</strong> ogni 5 min: a fine run riuscito chiama{" "}
                <code className="font-mono">revalidateTag("prices-data", "max")</code>{" "}
                → al prossimo render le card e i chart 1d/1w vedono i nuovi
                prezzi.
              </li>
              <li>
                <strong>Admin actions</strong> (backfill history/images, refresh
                metadata, sync now, add/delete/toggle coin): tutte chiamano{" "}
                <code className="font-mono">updateTag("prices-data")</code>{" "}
                subito dopo lo scritto, così l'utente vede immediatamente
                l'effetto delle proprie modifiche (anche sulla pagina
                pubblica del coin).
              </li>
            </ul>
          </section>

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--admin-text-faint)" }}>
              Impatto performance
            </h4>
            <p className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
              L'invalidazione è <strong>lazy</strong>: butta via il marker ma
              il refetch DB avviene solo al prossimo request reale. Per i
              range con TTL ≤ 5 min (card, chart 1d/1w) l'overhead è zero
              perché la cache si rinnova comunque più frequentemente. Sui
              range 1m / 1y un coin molto trafficato genera qualche query
              DB in più ma sono SQL veloci col downsampling lato Postgres
              (<code className="font-mono">DISTINCT ON</code> con bucket
              orario/giornaliero).
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
