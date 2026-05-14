"use client";

import type { LucideIcon } from "lucide-react";
import { Activity, Clock, Coins, HelpCircle, LineChart, Settings, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

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
// Cache & invalidation guide — usa lo stesso pattern modale dell'admin
// (createPortal + style inline coi token --admin-*, niente shadcn Dialog
// che con il theming admin renderizza male).
// ---------------------------------------------------------------------------

function CacheGuideButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Apri guida cache e invalidazione"
        className="inline-flex items-center justify-center w-6 h-6 rounded-full transition-colors"
        style={{
          background: "transparent",
          color: "var(--admin-text-faint)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--admin-hover-bg, rgba(255,255,255,0.06))";
          e.currentTarget.style.color = "var(--admin-text-muted)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--admin-text-faint)";
        }}>
        <HelpCircle size={14} />
      </button>

      {open && <CacheGuideModal onClose={() => setOpen(false)} />}
    </>
  );
}

function CacheGuideModal({ onClose }: { onClose: () => void }) {
  // Chiusura con Escape (stesso pattern di ConfirmModal)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10000,
          background: "rgba(0,0,0,0.45)",
          backdropFilter: "blur(2px)",
          animation: "cg-fade-in 140ms ease",
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cg-title"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10001,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          pointerEvents: "none",
        }}>
        <div
          style={{
            background: "var(--admin-card-bg, #1c1b19)",
            border: "1px solid var(--admin-card-border, #2a2927)",
            borderRadius: "14px",
            boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
            width: "100%",
            maxWidth: 640,
            maxHeight: "85vh",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            pointerEvents: "auto",
            animation: "cg-slide-up 160ms cubic-bezier(0.16,1,0.3,1)",
          }}>
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "18px 20px 14px",
              borderBottom: "1px solid var(--admin-card-border, #2a2927)",
            }}>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 34,
                height: 34,
                borderRadius: 8,
                background: "color-mix(in srgb, var(--admin-accent) 12%, transparent)",
                color: "var(--admin-accent)",
                flexShrink: 0,
              }}>
              <HelpCircle size={18} />
            </span>
            <h2
              id="cg-title"
              style={{
                flex: 1,
                fontSize: 15,
                fontWeight: 600,
                color: "var(--admin-text, #cdccca)",
                margin: 0,
              }}>
              Cache e invalidazione del modulo prezzi
            </h2>
            <button
              onClick={onClose}
              aria-label="Chiudi"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                borderRadius: 6,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--admin-text-faint, #5a5957)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--admin-hover-bg, rgba(255,255,255,0.06))";
                e.currentTarget.style.color = "var(--admin-text-muted, #797876)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--admin-text-faint, #5a5957)";
              }}>
              <X size={15} />
            </button>
          </div>

          {/* Body */}
          <div
            style={{
              padding: "16px 20px 20px",
              fontSize: 13,
              lineHeight: 1.6,
              color: "var(--admin-text-muted, #797876)",
              overflowY: "auto",
            }}>
            <p style={{ margin: "0 0 16px" }}>
              Tutte le query lette dal frontend (card, chart, esplora) passano per{" "}
              <code style={{ fontFamily: "var(--font-mono, monospace)" }}>unstable_cache</code>{" "}
              con tag{" "}
              <code style={{ fontFamily: "var(--font-mono, monospace)" }}>prices-data</code>.
              TTL e invalidazioni qui sotto.
            </p>

            <SectionTitle>
              Tag <code style={{ fontFamily: "var(--font-mono, monospace)" }}>prices-data</code>
            </SectionTitle>
            <div style={{ overflowX: "auto", marginBottom: 16 }}>
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
            <p style={{ margin: "0 0 16px" }}>
              Stats sync runs e endpoint dashboard admin (recent runs, latency). TTL fisso{" "}
              <strong style={{ color: "var(--admin-text)" }}>60s</strong>.
            </p>

            <SectionTitle>Invalidazione automatica</SectionTitle>
            <ul style={{ margin: "0 0 16px", paddingLeft: 20 }}>
              <li style={{ marginBottom: 8 }}>
                <strong style={{ color: "var(--admin-text)" }}>Cron sync</strong> ogni 5 min: a
                fine run riuscito chiama{" "}
                <code style={{ fontFamily: "var(--font-mono, monospace)" }}>
                  revalidateTag(&quot;prices-data&quot;, &quot;max&quot;)
                </code>{" "}
                → al prossimo render le card e i chart 1d/1w vedono i nuovi prezzi.
              </li>
              <li>
                <strong style={{ color: "var(--admin-text)" }}>Admin actions</strong> (backfill
                history/images, refresh metadata, sync now, add/delete/toggle coin): tutte
                chiamano{" "}
                <code style={{ fontFamily: "var(--font-mono, monospace)" }}>
                  updateTag(&quot;prices-data&quot;)
                </code>{" "}
                subito dopo lo scritto, così l&apos;utente vede immediatamente l&apos;effetto
                delle proprie modifiche (anche sulla pagina pubblica del coin).
              </li>
            </ul>

            <SectionTitle>Impatto performance</SectionTitle>
            <p style={{ margin: 0 }}>
              L&apos;invalidazione è <strong style={{ color: "var(--admin-text)" }}>lazy</strong>: butta
              via il marker ma il refetch DB avviene solo al prossimo request reale. Per i
              range con TTL ≤ 5 min (card, chart 1d/1w) l&apos;overhead è zero perché la cache si
              rinnova comunque più frequentemente. Sui range 1m / 1y un coin molto trafficato
              genera qualche query DB in più ma sono SQL veloci col downsampling lato Postgres
              (<code style={{ fontFamily: "var(--font-mono, monospace)" }}>DISTINCT ON</code> con bucket orario/giornaliero).
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes cg-fade-in  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes cg-slide-up { from { opacity: 0; transform: translateY(10px) scale(0.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
      `}</style>
    </>,
    document.body,
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
        margin: "0 0 8px",
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
