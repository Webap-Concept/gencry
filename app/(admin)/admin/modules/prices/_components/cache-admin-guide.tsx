"use client";

// Contenuto della guida "Cache e invalidazione del modulo prezzi".
// Va passato come `children` di <AdminSectionInfo> (pattern standard
// admin), montato dall'header del modulo prices per le sub-page non-cron.
import { useTranslations as _useTranslations } from "next-intl";

export function CacheAdminGuide() {
  // Non c'è (ancora) i18n dedicata per questa guida → testi inline IT.
  // Replicabile in messages/<locale>/admin.json quando serve EN.
  return (
    <div className="space-y-4">
      <p>
        Tutte le query lette dal frontend (card, chart, esplora) passano per{" "}
        <code style={{ fontFamily: "var(--font-mono, monospace)" }}>unstable_cache</code>{" "}
        con tag{" "}
        <code style={{ fontFamily: "var(--font-mono, monospace)" }}>prices-data</code>.
        TTL e invalidazioni qui sotto.
      </p>

      <SectionTitle>
        Tag <code style={{ fontFamily: "var(--font-mono, monospace)" }}>prices-data</code>
      </SectionTitle>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--admin-input-border)" }}>
              <th style={th()}>Endpoint</th>
              <th style={th()}>TTL</th>
              <th style={th()}>Note</th>
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
                <td style={td("mono")}>{endpoint}</td>
                <td style={td("mono")}>{ttl}</td>
                <td style={td()}>{note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionTitle>
        Tag <code style={{ fontFamily: "var(--font-mono, monospace)" }}>prices-health</code>
      </SectionTitle>
      <p>
        Stats sync runs e endpoint dashboard admin (recent runs, latency). TTL fisso{" "}
        <strong style={{ color: "var(--admin-text)" }}>60s</strong>.
      </p>

      <SectionTitle>Invalidazione automatica</SectionTitle>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        <li style={{ marginBottom: 8 }}>
          <strong style={{ color: "var(--admin-text)" }}>Cron sync</strong> ogni 5 min: a fine
          run riuscito chiama{" "}
          <code style={{ fontFamily: "var(--font-mono, monospace)" }}>
            revalidateTag(&quot;prices-data&quot;, &quot;max&quot;)
          </code>{" "}
          → al prossimo render le card e i chart 1d/1w vedono i nuovi prezzi.
        </li>
        <li>
          <strong style={{ color: "var(--admin-text)" }}>Admin actions</strong> (backfill
          history/images, refresh metadata, sync now, add/delete/toggle coin): tutte chiamano{" "}
          <code style={{ fontFamily: "var(--font-mono, monospace)" }}>
            updateTag(&quot;prices-data&quot;)
          </code>{" "}
          subito dopo lo scritto, così l&apos;utente vede immediatamente l&apos;effetto delle
          proprie modifiche (anche sulla pagina pubblica del coin).
        </li>
      </ul>

      <SectionTitle>Impatto performance</SectionTitle>
      <p>
        L&apos;invalidazione è <strong style={{ color: "var(--admin-text)" }}>lazy</strong>: butta
        via il marker ma il refetch DB avviene solo al prossimo request reale. Per i range con
        TTL ≤ 5 min (card, chart 1d/1w) l&apos;overhead è zero. Sui range 1m / 1y un coin molto
        trafficato genera qualche query DB in più ma sono SQL veloci col downsampling lato
        Postgres (<code style={{ fontFamily: "var(--font-mono, monospace)" }}>DISTINCT ON</code>{" "}
        con bucket orario/giornaliero).
      </p>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4
      style={{
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: "var(--admin-text-faint)",
        margin: "16px 0 8px",
      }}>
      {children}
    </h4>
  );
}

function th(): React.CSSProperties {
  return {
    textAlign: "left",
    padding: "6px 8px",
    fontWeight: 500,
    color: "var(--admin-text-faint)",
    fontSize: 11,
  };
}

function td(variant?: "mono"): React.CSSProperties {
  return {
    padding: "6px 8px",
    color: variant === "mono" ? "var(--admin-text)" : "var(--admin-text-muted)",
    fontFamily: variant === "mono" ? "var(--font-mono, monospace)" : undefined,
    fontVariantNumeric: variant === "mono" ? "tabular-nums" : undefined,
  };
}

// Marker per evitare warning "unused import" del placeholder i18n
void _useTranslations;
