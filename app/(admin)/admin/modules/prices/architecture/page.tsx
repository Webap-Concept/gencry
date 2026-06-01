// app/(admin)/admin/modules/prices/architecture/page.tsx
//
// ╔═══════════════════════════════════════════════════════════════════╗
// ║ ⚠ MAINTENANCE NOTICE — leggi prima di toccare il modulo prices    ║
// ║                                                                   ║
// ║ Questa pagina è la SOURCE OF TRUTH del design del modulo.         ║
// ║ Quando aggiungi/modifichi/elimini feature non banali:             ║
// ║                                                                   ║
// ║   • aggiorna QUESTA pagina nello stesso commit                    ║
// ║   • bump `REVIEWED_AT` qui sotto                                  ║
// ║   • bump `version` nel manifest.ts se cambia user-visible         ║
// ║                                                                   ║
// ║ Memory di riferimento: feedback_architecture_docs_maintenance     ║
// ╚═══════════════════════════════════════════════════════════════════╝
//
// Pagina di documentazione architetturale del modulo Prices Engine.
// Statica, zero query DB. Riassume design, source di dati, hot layer
// Redis, cron QStash, fallback chain, caching, e roadmap.
import type { Metadata } from "next";
import {
  AlertTriangle,
  BookOpen,
  Boxes,
  Database,
  FileText,
  Gauge,
  GitBranch,
  Layers,
  Rocket,
  Wrench,
} from "lucide-react";
import {
  ArchAnchorNav,
  ArchFileLink,
  ArchFutureCard,
  ArchHookBox,
  ArchMaintenanceFooter,
  ArchSchemaTable,
  ArchSection,
  ArchTechBadge,
} from "@/app/(admin)/admin/_components/architecture/arch-primitives";
import { ArchDiagram } from "@/app/(admin)/admin/_components/architecture/arch-diagram";
import { PRICES_MODULE } from "@/lib/modules/prices/manifest";

export const metadata: Metadata = { title: "Prices / Architettura" };

/** ISO date dell'ultima revisione manuale della pagina vs il codice.
 *  Bump-ala ogni volta che rivedi i contenuti (vedi memory
 *  feedback_architecture_docs_maintenance). */
const REVIEWED_AT = "2026-06-01";

const SECTIONS = [
  { id: "overview",    label: "Overview" },
  { id: "stack",       label: "Stack" },
  { id: "schema",      label: "Schema DB" },
  { id: "pipeline",    label: "Pipeline" },
  { id: "caching",     label: "Caching" },
  { id: "hooks",       label: "Hooks" },
  { id: "performance", label: "Performance" },
  { id: "future",      label: "Future" },
  { id: "files",       label: "Files map" },
  { id: "caveats",     label: "Caveats" },
];

const SCHEMA_DIAGRAM = `erDiagram
  price_exchanges ||--o{ prices_coins : "preferred_exchange FK"
  prices_coins ||--o{ prices_history : "symbol FK (charts)"
`;

// Pipeline reale post-refactor Redis-first (2026-05-27) + cutover QStash
// (2026-05-31). NB: il prezzo live finisce SOLO su Redis — prices_data è
// stata droppata, niente più fallback DB per il prezzo corrente.
const PIPELINE_DIAGRAM = `graph TD
  CRON[QStash<br/>every 1 min] --> AUTH{HMAC auth}
  AUTH -->|OK| ACT[active-universe.ts<br/>active+fetchable: recent OR top-rank ≤500]
  ACT --> GROUP[groupByExchange]
  GROUP --> ADAPT[Exchange adapters PRIMARY<br/>Binance · KuCoin · Gate · USDT→USD]
  ACT --> CG[CoinGecko FALLBACK<br/>coin senza routing · tiered by rank]
  ADAPT -->|coin mancanti| CG
  CG -->|ancora mancanti| DEX[DexScreener<br/>fallback long-tail]
  ADAPT --> MERGE[Map symbol→PriceQuote]
  CG --> MERGE
  DEX --> MERGE
  MERGE --> HOT[setHotPrices<br/>Upstash prices:hot:v1 — UNICO store live<br/>TTL = cron_min*60 + 60]
  MERGE --> HIST[prices_history snapshot<br/>gated by snapshot_minutes]
  HOT --> READ[Read: getHotPrices<br/>NIENTE fallback DB per il prezzo live]
  READ --> CDN[coin page ISR 60s · cards · ticker]
  CDN --> USER((User / Bot / Anon))
`;

export default function PricesArchitecturePage() {
  return (
    <div className="grid lg:grid-cols-[180px_1fr] gap-6">
      <ArchAnchorNav sections={SECTIONS} />

      <div className="space-y-4 max-w-3xl">
        {/* ─────────────────────────── Overview ──────────────────────── */}
        <ArchSection
          id="overview"
          title="Overview"
          icon={BookOpen}
          intro={
            <>
              Il modulo Prices Engine è la <strong>pipeline di ingestione
              prezzi crypto</strong> che alimenta tutta la piattaforma: dalla
              coin page pubblica al tooltip <code>$TICKER</code> nei post.
              Niente componenti UI propri visibili agli utenti — solo dati,
              hot layer Redis e admin tooling.{" "}
              <strong>
                Architettura "Redis-first" multi-exchange (refactor 2026-05-27,
                cron su QStash dal 2026-05-31).
              </strong>
            </>
          }>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Multi-exchange routing (PRIMARIO)</strong>: ogni coin ha
              opzionalmente <code>preferred_exchange + exchange_symbol</code>.
              Binance + KuCoin + Gate.io sono i tre adapter live (registry
              pattern in <code>exchanges/registry.ts</code>). Prezzo+volume
              dall'exchange, convertiti USDT→USD.
            </li>
            <li>
              <strong>CoinGecko (FALLBACK, 2 ruoli)</strong>: (1) prezzo per i
              coin <em>senza</em> routing exchange o quando l'exchange fallisce,
              con tiering per market-cap rank; (2) refresh <strong>metadata</strong>{" "}
              (market_cap, rank, weekly_sparkline) ogni 4h via{" "}
              <code>metadata-refresh.ts</code> — gli exchange non espongono il
              market cap. <strong>DexScreener</strong> = fallback finale per i
              coin DEX-only ancora mancanti.{" "}
              <strong>CryptoCompare</strong> NON è nel cron: solo backfill
              storico.
            </li>
            <li>
              <strong>Hot layer Upstash = UNICO store del prezzo live</strong>:
              chiave singola <code>prices:hot:v1</code> con snapshot{" "}
              {`{updatedAt, quotes}`} di tutti i coin attivi. TTL ={" "}
              <code>cron_minutes * 60 + 60s</code>.{" "}
              <strong>
                La tabella <code>prices_data</code> è stata DROPPATA
              </strong>{" "}
              : se Redis è down non c'è fallback DB per il prezzo corrente (i
              grafici storici sopravvivono via <code>prices_history</code>).
            </li>
            <li>
              <strong>Active universe</strong>: coin attivi+fetchabili
              (con <code>coingecko_id</code> o routing exchange) che sono O
              recenti (<code>last_seen_at</code> entro <code>universe_hours</code>)
              O <strong>top per market-cap rank (≤500, sempre)</strong>. Il ramo
              top-rank (aggiunto 2026-06-01) impedisce che un set "fresco"
              piccolo affami i major — vedi Caveats.
            </li>
            <li>
              <strong>Cron 1-min via Upstash QStash</strong> →
              <code className="ml-1">/api/cron/modules/prices/sync</code>{" "}
              (HMAC auth). Cadenza configurabile da
              <code className="ml-1">app_settings.modules.prices.cron_minutes</code>.
            </li>
            <li>
              <strong>Config in app_settings</strong>: tutte le impostazioni del
              modulo vivono in <code>app_settings.modules.prices.*</code>
              (lette da <code>config.ts</code>), servite via snapshot R2.
              <strong> Non esiste una tabella <code>prices_settings</code></strong>.
            </li>
            <li>
              <strong>Coin page ISR 60s + no-404 SEO</strong>: Vercel Edge CDN
              serve <code>/coins/[symbol]</code> ad anon/bot. La pagina
              renderizza SEMPRE se il coin esiste (<code>getCoinDetail</code>):
              se manca il prezzo live nasconde solo prezzo+grafico, niente 404.
            </li>
          </ul>
        </ArchSection>

        {/* ─────────────────────────── Stack ─────────────────────────── */}
        <ArchSection
          id="stack"
          title="Stack tecnologico"
          icon={Layers}
          intro="Niente librerie crypto-specifiche: solo fetch verso REST API esterne + Drizzle per la persistenza. Resilienza fatta in casa (circuit breaker DB-backed + tiering).">
          <div className="flex flex-wrap gap-2">
            <ArchTechBadge label="Next.js 16 (RSC + edge ISR)" variant="accent" />
            <ArchTechBadge label="Upstash Redis (hot layer = unico store live)" variant="accent" />
            <ArchTechBadge label="Upstash QStash (cron 1-min)" variant="accent" />
            <ArchTechBadge label="Drizzle ORM" />
            <ArchTechBadge label="Postgres (Supabase)" />
            <ArchTechBadge label="Binance Spot API (primary)" variant="accent" />
            <ArchTechBadge label="KuCoin Spot API (primary)" variant="accent" />
            <ArchTechBadge label="Gate.io Spot API (long-tail)" variant="accent" />
            <ArchTechBadge label="CoinGecko Free (price fallback + metadata 4h)" />
            <ArchTechBadge label="DexScreener API (DEX-only fallback)" />
            <ArchTechBadge label="CryptoCompare (solo backfill storico)" />
            <ArchTechBadge label="Cloudflare R2 (coin images + config snapshot)" />
            <ArchTechBadge label="HMAC auth (cron endpoints)" />
            <ArchTechBadge label="unstable_cache + updateTag" />
            <ArchTechBadge label="Circuit breaker DB-backed (prices_source_health)" />
          </div>
        </ArchSection>

        {/* ─────────────────────────── Schema ────────────────────────── */}
        <ArchSection
          id="schema"
          title="Schema DB"
          icon={Database}
          intro={
            <>
              Tabelle sotto namespace <code>prices_*</code> (+ <code>price_exchanges</code>).
              Scritture via <code>UPSERT</code> idempotente. Niente trigger.{" "}
              <strong>
                Il prezzo live NON è in DB: vive in Redis (<code>prices:hot:v1</code>).
              </strong>{" "}
              <code>prices_data</code> droppata; config in <code>app_settings</code>.
            </>
          }>
          <ArchDiagram
            id="prices-schema"
            source={SCHEMA_DIAGRAM}
            caption="prices_sync_runs (audit) e prices_source_health (breaker) sono tabelle standalone. Config NON in DB dedicato: vive in app_settings.modules.prices.*."
          />

          <div className="space-y-3 mt-4">
            <ArchSchemaTable
              name="prices_coins"
              description="Registry coin + master-data semi-statico. NB: nessuna colonna di prezzo live (sta in Redis)."
              columns={[
                { name: "symbol",          type: "varchar(20)",  note: "PK, uppercase" },
                { name: "coingecko_id",    type: "varchar(100)?", note: "UNIQUE. ID upstream per fetch fallback + metadata" },
                { name: "name",            type: "varchar(120)" },
                { name: "image_url",       type: "text?",        note: "Hosted su R2" },
                { name: "market_cap",      type: "bigint?",      note: "Aggiornato dal cron metadata-refresh (4h)" },
                { name: "market_cap_rank", type: "integer?",     note: "Ordina universe + tiering + soglia top-500" },
                { name: "category",        type: "varchar(50)?" },
                { name: "is_active",       type: "boolean",      note: "Filtro hard del universe (false = escluso)" },
                { name: "preferred_exchange", type: "varchar(20)?", note: "FK → price_exchanges.id. Routing per-coin (null = CoinGecko)" },
                { name: "exchange_symbol", type: "varchar(50)?", note: "Symbol formato exchange (BTCUSDT, BTC-USDT, BTC_USDT)" },
                { name: "weekly_sparkline", type: "jsonb?",      note: "7 prezzi decorativi, refresh 4h. (NON sparkline_7d)" },
                { name: "weekly_sparkline_at", type: "timestamptz?" },
                { name: "last_seen_at",    type: "timestamptz",  note: "Touch da social/import → finestra universe_hours" },
              ]}
            />

            <ArchSchemaTable
              name="price_exchanges"
              description="Registry exchange. 1 row per adapter in lib/modules/prices/exchanges/<id>.ts. Toggle dalla UI /admin/modules/prices/exchanges."
              columns={[
                { name: "id",                  type: "varchar(20)",  note: "PK lowercase (binance, kucoin, gate). Matcha registry.ts" },
                { name: "label",               type: "varchar(64)" },
                { name: "enabled",             type: "boolean" },
                { name: "api_key",             type: "text?",        note: "Nullable: Binance public no-auth" },
                { name: "api_secret",          type: "text?" },
                { name: "config",              type: "jsonb",        note: "Bag opaco settings per-exchange" },
                { name: "last_health_*",       type: "ts/bool/text", note: "Aggiornato dal Test connessione" },
              ]}
            />

            <ArchSchemaTable
              name="prices_history"
              description="Time series per i chart storici. Scritta dal sync (gated da snapshot_minutes) + backfill CryptoCompare."
              columns={[
                { name: "id",            type: "bigserial",    note: "PK" },
                { name: "symbol",        type: "varchar(20)",  note: "FK prices_coins (cascade)" },
                { name: "ts",            type: "timestamptz" },
                { name: "price",         type: "numeric(24,8)" },
                { name: "idx",           type: "(symbol, ts)", note: "Index NON-unique (no idempotency hard a livello DB)" },
              ]}
            />

            <ArchSchemaTable
              name="prices_sync_runs"
              description="Audit log dei run cron (sync | snapshot | cleanup). Letto dalla pagina Cron + diagnostica."
              columns={[
                { name: "id",            type: "bigserial",     note: "PK" },
                { name: "kind",          type: "varchar(20)",   note: "sync | snapshot | cleanup" },
                { name: "started_at",    type: "timestamptz" },
                { name: "finished_at",   type: "timestamptz?" },
                { name: "duration_ms",   type: "integer?" },
                { name: "coins_total",   type: "integer",       note: "= universe.length nel run" },
                { name: "coins_updated", type: "integer" },
                { name: "source_used",   type: "varchar(20)?",  note: "coingecko | dexscreener | mixed | null" },
                { name: "ok",            type: "boolean" },
                { name: "error",         type: "text?" },
              ]}
            />

            <ArchSchemaTable
              name="prices_source_health"
              description="State del circuit breaker per source — DB-backed (NON in-memory). Apre/chiude il breaker su CoinGecko/DexScreener."
              columns={[
                { name: "source",         type: "varchar(20)",  note: "PK (coingecko, dexscreener)" },
                { name: "status",         type: "varchar(20)",  note: "closed | open" },
                { name: "error_count",    type: "integer" },
                { name: "success_count",  type: "integer" },
                { name: "open_until",     type: "timestamptz?", note: "Breaker aperto fino a questo istante" },
                { name: "avg_latency_ms", type: "integer?" },
              ]}
            />
          </div>
        </ArchSection>

        {/* ─────────────────────────── Pipeline ──────────────────────── */}
        <ArchSection
          id="pipeline"
          title="Pipeline end-to-end"
          icon={GitBranch}
          intro="Dal cron QStash al write su Redis. Exchange-first; CoinGecko/DexScreener solo per i coin scoperti. Resiliente: failure isolation per-exchange + circuit breaker.">
          <ArchDiagram
            id="prices-pipeline"
            source={PIPELINE_DIAGRAM}
            caption="Flow di un sync. Gli exchange sono primari; CoinGecko/DexScreener coprono solo i coin mancanti. Il prezzo live finisce SOLO su Redis."
          />

          <p className="mt-4">
            <strong>Decisioni chiave</strong>:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Auth HMAC sui cron</strong>: gli endpoint{" "}
              <code>/api/cron/modules/prices/*</code> richiedono firma HMAC
              (<code>cron-auth.ts</code>). Chi li chiama è indifferente: i run
              vengono loggati su <code>prices_sync_runs</code> a prescindere.
            </li>
            <li>
              <strong>Exchange-first + failure isolation</strong>: ogni gruppo
              exchange è fetchato in parallelo; se Binance è down gli altri (e
              CoinGecko per i tail) continuano. I coin non coperti ricadono su
              CoinGecko, poi DexScreener.
            </li>
            <li>
              <strong>Tiering CoinGecko</strong>: Tier1 (rank ≤100) ogni tick,
              Tier2 (101-400) ogni 2, Tier3 (&gt;400/null) ogni 6 — riduce le
              call CoinGecko rispettando il rate limit free.
            </li>
            <li>
              <strong>Circuit breaker DB-backed</strong>: stato in{" "}
              <code>prices_source_health</code>. Dopo N errori la source viene
              marcata <code>open</code> per una finestra (config breaker_*),
              evitando di sbatterci contro.
            </li>
            <li>
              <strong>Redis prima del DB</strong>: <code>setHotPrices</code> è la
              scrittura critica. <code>prices_history</code> (snapshot) e{" "}
              <code>syncMasterData</code> (market_cap/rank) sono best-effort,
              non bloccano il tick.
            </li>
            <li>
              <strong>updateTag dopo il sync</strong>: l'endpoint invalida{" "}
              <code>PRICES_DATA_TAG</code> + <code>PRICES_HEALTH_TAG</code> così
              le query <code>unstable_cache</code> dei consumer ripartono fresh.
            </li>
          </ul>
        </ArchSection>

        {/* ─────────────────────────── Caching ───────────────────────── */}
        <ArchSection
          id="caching"
          title="Strategia di caching"
          icon={Boxes}
          intro="4 layer. Il prezzo live è 100% Redis; le query 'global' (config) passano da snapshot R2; i consumer per-coin da unstable_cache; le pagine pubbliche da ISR edge.">
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              <strong>Redis hot (<code>prices:hot:v1</code>)</strong>: unica
              chiave con tutti i coin. 1 GET = snapshot completo (~5-20ms). È
              l'<strong>unico</strong> store del prezzo corrente (no fallback DB).
            </li>
            <li>
              <strong>app_settings via snapshot R2</strong>: la config del
              modulo (<code>modules.prices.*</code>) è servita da un JSON R2 con
              cache in-process 30s/ETag. Pattern in{" "}
              <code>project_config_snapshot_pattern</code>.{" "}
              <strong>⚠ Un UPDATE SQL diretto su app_settings è invisibile a
              prod finché lo snapshot non è risincronizzato</strong>{" "}
              (<code>forceSyncAppSettingsSnapshot</code>).
            </li>
            <li>
              <strong>Next unstable_cache</strong>: <code>getTopCoinsForCards</code>{" "}
              (pool 200), <code>getCoinForCard</code> / <code>getCoinDetail</code>,{" "}
              <code>getCoinNameMap</code> — tag <code>PRICES_DATA_TAG</code>,
              invalidate via <code>updateTag()</code> dopo ogni sync.
            </li>
            <li>
              <strong>Coin page ISR 60s</strong> + <strong>coin images R2</strong>{" "}
              (servite dal nostro dominio, no Hotlink issue).
            </li>
          </ol>

          <div
            className="mt-3 p-3 rounded-lg text-xs"
            style={{
              background:
                "color-mix(in srgb, var(--admin-accent) 8%, transparent)",
              color: "var(--admin-accent)",
            }}>
            <strong>Anti-pattern noto</strong>: NON servire query global a tutto
            il traffico dal pool DB. La regola{" "}
            <em>"global query → Redis / snapshot R2"</em> è non-negoziabile.
          </div>
        </ArchSection>

        {/* ─────────────────────────── Hooks ─────────────────────────── */}
        <ArchSection
          id="hooks"
          title="Hookable services — dove intervenire"
          icon={Wrench}
          intro="Tutto dietro interfaccia stabile. Aggiungere un exchange = 1 file in exchanges/ + 1 row in price_exchanges. Aggiungere una source fallback = 1 file in sources/.">
          <div className="space-y-2.5">
            <ArchHookBox
              title="Exchange adapter (PRIMARIO)"
              description="Ogni exchange implementa fetchCurrentPrices(inputs). Registrato nel registry per id. Binance/KuCoin/Gate live; Kraken/Coinbase = nuovo file + row."
              filePath="lib/modules/prices/exchanges/<id>.ts (+ registry.ts)"
              contract="fetchCurrentPrices(inputs: ExchangeFetchInput[]) → Promise<Map<symbol, PriceQuote>>"
            />
            <ArchHookBox
              title="Source fallback (CoinGecko / DexScreener)"
              description="Source non-exchange per i coin scoperti. CoinGecko = price fallback + metadata. DexScreener = DEX-only."
              filePath="lib/modules/prices/sources/<provider>.ts"
              contract="fetch<Provider>Prices(ids|symbols) → { quotes: Map, latencyMs }"
            />
            <ArchHookBox
              title="Sync orchestrator"
              description="Orchestra exchange → CoinGecko → DexScreener → Redis + prices_history. Il chain vive qui."
              filePath="lib/modules/prices/sync.ts"
              contract="runPricesSync(force?) → SyncResult"
            />
            <ArchHookBox
              title="Active universe"
              description="Quali coin sincronizzare: recenti (universe_hours) OR top-rank (≤500). Estendibile (watchlist, mention nei post)."
              filePath="lib/modules/prices/active-universe.ts"
              contract="getActiveUniverse() → ActiveCoin[]"
            />
            <ArchHookBox
              title="Circuit breaker (DB-backed)"
              description="Stato in prices_source_health. canCall(source) gate; recordSuccess/recordError aggiornano il breaker."
              filePath="lib/modules/prices/circuit-breaker.ts"
              contract="canCall(source) / recordSuccess / recordError"
            />
            <ArchHookBox
              title="Hot layer Redis"
              description="get/set dello snapshot prezzi. Unico store del prezzo live."
              filePath="lib/modules/prices/services/hot-prices.ts"
              contract="setHotPrices(map, {ttl}) / getHotPrices() → {updatedAt, quotes}"
            />
            <ArchHookBox
              title="Queries (consumer-side)"
              description="getTopCoinsForCards, getCoinForCard (null se no prezzo), getCoinDetail (no-404 SEO), getCoinNameMap, getHistorySeries. Cached + tagged."
              filePath="lib/modules/prices/queries.ts"
              contract="getCoinDetail(symbol) → CoinView | null (null SOLO se coin inesistente)"
            />
          </div>
        </ArchSection>

        {/* ─────────────────────────── Performance ───────────────────── */}
        <ArchSection
          id="performance"
          title="Performance"
          icon={Gauge}
          intro="Universe = tutti i coin attivi+fetchabili (~771 oggi), sync ogni 1 min, exchange-first con tiering CoinGecko. Pubblico = 0 query DB sul prezzo grazie a Redis + ISR.">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Sync run</strong>: dominato dalle call exchange (bulk) +
              CoinGecko per i tail. Tiering limita le call CoinGecko per tick.
            </li>
            <li>
              <strong>Redis hot read</strong>: ~5-20ms, 1 GET per l'intero
              snapshot. Scala lineare col traffico (no DB hit).
            </li>
            <li>
              <strong>Coin page</strong>: ISR 60s su edge → 10k visit/min ≈ 1
              req/min al backend.
            </li>
            <li>
              <strong>getCoinNameMap()</strong>: cached, lookup O(1) per parola
              nel parser dei post (indipendente dal numero di coin).
            </li>
            <li>
              <strong>weekly_sparkline</strong>: pre-aggregata in{" "}
              <code>prices_coins</code> (jsonb) — niente GROUP BY al render.
            </li>
          </ul>
        </ArchSection>

        {/* ─────────────────────────── Future ────────────────────────── */}
        <ArchSection
          id="future"
          title="Future optimizations"
          icon={Rocket}
          intro="Modulo in 1.0.0 e in main. Backlog su estensione (più exchange/granularità) e su una pulizia legacy in corso (audit 2026-06-01).">
          <div className="grid sm:grid-cols-2 gap-3">
            <ArchFutureCard
              tier={1}
              title="Cleanup legacy (audit 06/01)"
              description="Rimuovere runPricesSnapshot no-op, decidere su SSE live-prices (scaffold off), igiene universo (coin spazzatura attivi). Vedi memory dell'audit."
              trigger="Subito dopo l'audit dead-code"
            />
            <ArchFutureCard
              tier={2}
              title="Granularità 1min per top-20"
              description="Cron secondario sui top-20 per UI day-trading futura."
              trigger="Apertura modulo trading / alerts realtime"
            />
            <ArchFutureCard
              tier={2}
              title="Source on-chain (Pyth/Chainlink)"
              description="Oracoli on-chain come ulteriore fallback per coin DEX-only. Pattern pronto, manca l'impl provider."
              trigger="Aggiunta memecoin / token Solana al universe"
            />
            <ArchFutureCard
              tier={3}
              title="Edge runtime per /api/modules/prices"
              description="Endpoint API pubblici (history per chart) su edge runtime: CDN cache + 0ms cold start."
              trigger="API traffic > 1M req/giorno"
            />
          </div>
        </ArchSection>

        {/* ─────────────────────────── Files ─────────────────────────── */}
        <ArchSection
          id="files"
          title="Files map — dove cercare cosa"
          icon={FileText}
          intro="Tutto sotto lib/modules/prices/. Layer: orchestrazione, exchanges/, sources/, services/, read (queries).">
          <div className="space-y-2">
            <ArchFileLink path="lib/modules/prices/manifest.ts" description="Slug, nav, permission, 4 cron jobs (sync/snapshot/cleanup/metadata-refresh)" />
            <ArchFileLink path="lib/modules/prices/config.ts" description="getPricesConfig() — legge tutta la config da app_settings.modules.prices.*" />
            <ArchFileLink path="lib/modules/prices/sync.ts" description="Orchestrator: exchange → CoinGecko → DexScreener → Redis + history + masterdata" />
            <ArchFileLink path="lib/modules/prices/active-universe.ts" description="Quali coin sincronizzare (recenti OR top-rank ≤500)" />
            <ArchFileLink path="lib/modules/prices/circuit-breaker.ts" description="Breaker DB-backed (prices_source_health) per CoinGecko/DexScreener" />
            <ArchFileLink path="lib/modules/prices/cron-auth.ts" description="HMAC verification per /api/cron/modules/prices/*" />
            <ArchFileLink path="lib/modules/prices/exchanges/registry.ts" description="Registry adapter per id + binance/kucoin/gate.ts" />
            <ArchFileLink path="lib/modules/prices/services/hot-prices.ts" description="Hot layer Redis prices:hot:v1 (unico store live)" />
            <ArchFileLink path="lib/modules/prices/services/sync-tick.ts" description="Counter Redis per il tiering CoinGecko" />
            <ArchFileLink path="lib/modules/prices/services/metadata-refresh.ts" description="Cron 4h: market_cap/rank/sparkline da CoinGecko" />
            <ArchFileLink path="lib/modules/prices/services/usdt-rate.ts" description="Tasso USDT→USD per convertire i prezzi exchange" />
            <ArchFileLink path="lib/modules/prices/sources/coingecko.ts" description="Fallback prezzo + endpoint markets (free/pro)" />
            <ArchFileLink path="lib/modules/prices/sources/dexscreener.ts" description="Fallback coin DEX-only / long-tail" />
            <ArchFileLink path="lib/modules/prices/queries.ts" description="Read: getTopCoinsForCards, getCoinForCard, getCoinDetail, getCoinNameMap, getHistorySeries" />
            <ArchFileLink path="lib/db/migrations/M_prices_drop_prices_data.sql" description="Drop prices_data — Redis è ora l'unico store del prezzo live" />
          </div>
        </ArchSection>

        {/* ─────────────────────────── Caveats ───────────────────────── */}
        <ArchSection
          id="caveats"
          title="Caveats e pitfall noti"
          icon={AlertTriangle}
          intro="Specifici di questo modulo. Alcuni sono lezioni dolorose (2026-06-01).">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Redis è l'unico store del prezzo live</strong>: con{" "}
              <code>prices_data</code> droppata, se Upstash è down i prezzi
              correnti spariscono (i chart storici da <code>prices_history</code>{" "}
              sopravvivono). Monitorare la chiave <code>prices:hot:v1</code>.
            </li>
            <li>
              <strong>Universe starvation (FIXATO 06/01)</strong>: con{" "}
              <code>universe_hours=24</code> e <code>last_seen_at</code>{" "}
              aggiornato di rado, un seeder che "toccava" pochi coin minori
              collassava l'universo a quel sottoinsieme → major (BTC/ETH) senza
              prezzo → coin page 404. Fix: top-rank ≤500 sempre incluso +{" "}
              <code>universe_hours</code> tenuto alto (8760) finché il social non
              popola <code>last_seen_at</code>.
            </li>
            <li>
              <strong>app_settings snapshot staleness</strong>: la config è
              servita da snapshot R2. Un UPDATE SQL diretto NON si propaga finché
              non risincronizzi (<code>forceSyncAppSettingsSnapshot</code>); usa
              sempre il write path (<code>batchUpdateAppSettings</code>).
            </li>
            <li>
              <strong>Coin page NON deve mai 404 per prezzo mancante</strong>{" "}
              (SEO): usare <code>getCoinDetail</code> (404 solo se il coin non
              esiste); il prezzo/chart si nascondono con{" "}
              <code>priceAvailable=false</code>.
            </li>
            <li>
              <strong>Cron admin "Not on QStash" = falso negativo</strong>: la
              pagina cerca <code>scheduleId = gencry-&lt;jobname&gt;</code>; se non
              combacia mostra "Not on QStash" anche se i job girano davvero su
              QStash (display WIP della migrazione cron). NON è un problema infra.
            </li>
            <li>
              <strong>Igiene universo</strong>: <code>prices_coins</code>{" "}
              contiene coin spazzatura attivi (simboli non-ASCII). Da rivedere
              import + flag <code>is_active</code> (audit).
            </li>
            <li>
              <strong>Load test contro prod</strong>: NON fare. Firewall Vercel
              rate-limita 15-60 min. Vedi <code>feedback_no_load_test_against_prod</code>.
            </li>
          </ul>
        </ArchSection>

        <ArchMaintenanceFooter
          reviewedAt={REVIEWED_AT}
          moduleVersion={PRICES_MODULE.version}
          moduleSlug={PRICES_MODULE.slug}
        />
      </div>
    </div>
  );
}
