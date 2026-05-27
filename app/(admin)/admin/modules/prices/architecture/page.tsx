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
// ║ Vale per: nuove tabelle/colonne (ArchSchemaTable), nuovi cron     ║
// ║ /trigger (Pipeline + diagram), nuovi servizi hookable             ║
// ║ (ArchHookBox), nuovi file principali (ArchFileLink), perf         ║
// ║ numbers, bug/pitfall scoperti (Caveats), future ottimizzazioni   ║
// ║ realizzate (rimuovi/sposta ArchFutureCard).                      ║
// ║                                                                   ║
// ║ Memory di riferimento: feedback_architecture_docs_maintenance     ║
// ╚═══════════════════════════════════════════════════════════════════╝
//
// Pagina di documentazione architetturale del modulo Prices Engine.
// Statica, zero query DB. Riassume design, source di dati, snapshot
// pattern R2, cron, fallback chain, e roadmap.
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
const REVIEWED_AT = "2026-05-27";

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
  prices_coins ||--o{ prices_history : "snapshots"
  prices_coins ||--o{ prices_runs : "produced by"
  prices_coins ||--o{ prices_images : "has"
  prices_settings ||--o{ prices_coins : "configures universe"
`;

const PIPELINE_DIAGRAM = `graph TD
  CRON[pg_cron Supabase<br/>every 1 min] --> AUTH{HMAC auth}
  AUTH -->|OK| ACT[active-universe.ts<br/>load coin with preferred_exchange OR coingecko_id]
  ACT --> GROUP[groupByExchange<br/>binance | kucoin | ... | no-routing]
  GROUP --> ADAPT[adapter.fetchCurrentPrices<br/>per exchange in parallel]
  GROUP --> CG[CoinGecko fallback<br/>for unmapped coins]
  ADAPT -->|fails| CG2[CoinGecko fallback<br/>per missing]
  ADAPT --> MERGE[Merge into Map<symbol, PriceQuote>]
  CG --> MERGE
  CG2 --> MERGE
  MERGE --> HOT[setHotPrices<br/>Upstash prices:hot:v1<br/>TTL = cron_min*60 + 60]
  MERGE --> COLD[upsert prices_data<br/>cold DB fallback]
  HOT --> CDN[Vercel Edge CDN<br/>coin page ISR 60s]
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
              prezzi crypto</strong> che alimenta tutta la piattaforma: dal
              chart in homepage al tooltip <code>$TICKER</code> nei post.
              Niente componenti UI propri visibili agli utenti — solo dati e
              admin tooling.{" "}
              <strong>
                Refactor 2026-05-27 → architettura "Redis-first" multi-exchange.
              </strong>
            </>
          }>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Multi-exchange routing</strong>: ogni coin ha
              opzionalmente <code>preferred_exchange + exchange_symbol</code>.
              Binance e' il primo adapter; futuri (KuCoin, Gate, Kraken,
              Coinbase) si aggiungono via registry pattern. Coin senza
              routing → fallback CoinGecko.
            </li>
            <li>
              <strong>Hot layer Upstash</strong>: chiave singola{" "}
              <code>prices:hot:v1</code> con snapshot {`{updatedAt, quotes}`}{" "}
              di tutti i coin attivi. TTL = <code>cron_minutes * 60 + 60s</code>{" "}
              (auto-adatta a cambi cadence). Lettura ~5-20ms vs DB 50-200ms.
            </li>
            <li>
              <strong>Active universe</strong>: tutti i coin attivi con
              ALMENO un percorso fetchabile (coingeckoId o preferred_exchange).
              Group-by-exchange per parallelizzare le call.
            </li>
            <li>
              <strong>Cron 1-min via pg_cron Supabase</strong>, chiama
              l'endpoint Vercel. Cadenza configurabile da
              <code className="ml-1">app_settings.modules.prices.cron_minutes</code>.
            </li>
            <li>
              <strong>Chart on-demand</strong>:{" "}
              <code>/api/coins/[symbol]/chart</code> chiama direttamente
              l'exchange (Binance klines) con edge cache 1-60min. Niente
              piu' scrittura su <code>prices_history</code> per i coin
              mappati.
            </li>
            <li>
              <strong>Coin page ISR 60s</strong>: Vercel Edge CDN serve
              <code className="ml-1">/coins/[symbol]</code> ad anon/bot
              senza toccare il backend. Anche 10k visit/min ≈ 1 req/min.
            </li>
            <li>
              <strong>Dual-write transitorio</strong>: il cron scrive
              SEMPRE sia su Upstash sia su <code>prices_data</code> (DB
              cold fallback). I consumer leggono prima da hot, poi cadono
              su DB. Verra' rimosso quando Upstash sara' validato in prod.
            </li>
          </ul>
        </ArchSection>

        {/* ─────────────────────────── Stack ─────────────────────────── */}
        <ArchSection
          id="stack"
          title="Stack tecnologico"
          icon={Layers}
          intro="Niente librerie crypto-specifiche: solo fetch verso REST API esterne + Drizzle per la persistenza. Resilienza fatta in casa (circuit breaker + retry).">
          <div className="flex flex-wrap gap-2">
            <ArchTechBadge label="Next.js 16 (RSC + edge ISR)" variant="accent" />
            <ArchTechBadge label="Upstash Redis (hot layer)" variant="accent" />
            <ArchTechBadge label="Drizzle ORM" />
            <ArchTechBadge label="Postgres (Supabase)" />
            <ArchTechBadge label="pg_cron Supabase (1-min schedule)" variant="accent" />
            <ArchTechBadge label="Binance Spot API (primary)" variant="accent" />
            <ArchTechBadge label="CoinGecko Free (fallback)" />
            <ArchTechBadge label="CryptoCompare API (historical fallback)" />
            <ArchTechBadge label="DexScreener API (long-tail fallback)" />
            <ArchTechBadge label="Cloudflare R2 (coin images)" />
            <ArchTechBadge label="HMAC auth (cron endpoints)" />
            <ArchTechBadge label="unstable_cache + updateTag" />
            <ArchTechBadge label="In-house circuit breaker (CoinGecko path)" />
          </div>
        </ArchSection>

        {/* ─────────────────────────── Schema ────────────────────────── */}
        <ArchSection
          id="schema"
          title="Schema DB"
          icon={Database}
          intro={
            <>
              4 tabelle principali sotto namespace <code>prices_*</code>.
              Tutte le scritture passano per <code>UPSERT</code> idempotente
              con conflict-on-unique. Niente trigger DB qui — la coerenza
              counter non serve, i prezzi sono sostituiti, non aggregati.
            </>
          }>
          <ArchDiagram
            id="prices-schema"
            source={SCHEMA_DIAGRAM}
            caption="Schema essenziale. prices_settings è singola row con la config del modulo."
          />

          <div className="space-y-3 mt-4">
            <ArchSchemaTable
              name="prices_coins"
              description="Registry coin attive + valori 'last' per query veloce homepage/mercati"
              columns={[
                { name: "symbol",          type: "varchar(20)",  note: "PK, uppercase" },
                { name: "name",            type: "text",         note: "Nome esteso (Bitcoin, Ethereum...)" },
                { name: "coingecko_id",    type: "text",         note: "ID upstream per fetch (legacy)" },
                { name: "preferred_exchange", type: "varchar(20)?", note: "FK → price_exchanges.id. Routing per-coin (migration 0051)" },
                { name: "exchange_symbol",  type: "varchar(50)?", note: "Symbol formato exchange (es. BTCUSDT). 0051" },
                { name: "image_url",       type: "text?",        note: "Hosted su R2 (vedi M_prices_003)" },
                { name: "last_price",      type: "numeric",      note: "Prezzo aggiornato a ogni sync" },
                { name: "market_cap",      type: "numeric?" },
                { name: "market_cap_rank", type: "integer?",     note: "M_prices_005 — ordinamento universe" },
                { name: "change_24h",      type: "numeric?" },
                { name: "change_7d",       type: "numeric?" },
                { name: "sparkline_7d",    type: "jsonb?",       note: "M_prices_004 — array prezzi per chart" },
                { name: "is_active",       type: "boolean",      note: "Filtro hard del feed (false = nascondi)" },
                { name: "last_updated",    type: "timestamptz",  note: "Per freshness check lato app" },
              ]}
            />

            <ArchSchemaTable
              name="price_exchanges"
              description="Registry exchange disponibili (migration 0051 — refactor Redis-first). 1 row per ogni adapter implementato in lib/modules/prices/exchanges/<id>.ts"
              columns={[
                { name: "id",                  type: "varchar(20)",  note: "PK lowercase (binance, kucoin, ...). Matcha registry.ts" },
                { name: "label",               type: "text" },
                { name: "enabled",             type: "boolean",      note: "Toggle dalla UI /admin/modules/prices/exchanges" },
                { name: "api_key",             type: "secret?",      note: "Nullable: Binance public no-auth" },
                { name: "api_secret",          type: "secret?" },
                { name: "config",              type: "jsonb",        note: "Bag opaco per settings per-exchange" },
                { name: "last_health_check",   type: "timestamptz?", note: "Aggiornato dal bottone Test connessione" },
                { name: "last_health_ok",      type: "boolean?" },
                { name: "last_health_error",   type: "text?" },
              ]}
            />

            <ArchSchemaTable
              name="prices_history"
              description="Time series. Solo lettura per chart storici."
              columns={[
                { name: "symbol",        type: "varchar(20)",  note: "FK prices_coins" },
                { name: "ts",            type: "timestamptz" },
                { name: "price",         type: "numeric" },
                { name: "market_cap",    type: "numeric?" },
                { name: "volume_24h",    type: "numeric?" },
                { name: "unique idx",    type: "(symbol, ts)", note: "M_prices_006 — idempotency rerun" },
              ]}
            />

            <ArchSchemaTable
              name="prices_runs"
              description="Audit log dei sync (success/failure/source usata)"
              columns={[
                { name: "id",          type: "uuid v7",       note: "PK" },
                { name: "started_at",  type: "timestamptz" },
                { name: "finished_at", type: "timestamptz?" },
                { name: "source",      type: "varchar(32)",   note: "coingecko | cryptocompare | dexscreener" },
                { name: "coins_count", type: "integer",       note: "quante coin nel batch" },
                { name: "status",      type: "varchar(16)",   note: "ok | partial | error" },
                { name: "error",       type: "text?",         note: "stack trace se status=error" },
              ]}
            />

            <ArchSchemaTable
              name="prices_settings"
              description="Singleton: config del modulo (chiavi API, retention, intervalli, R2 bucket)"
              columns={[
                { name: "id",                   type: "smallint",   note: "always 1 (CHECK)" },
                { name: "active_universe_top",  type: "integer",    note: "default 200" },
                { name: "sync_interval_min",    type: "integer",    note: "default 5" },
                { name: "history_retention_days", type: "integer",  note: "default 90" },
                { name: "r2_*",                 type: "text/secret", note: "M_prices_003 — credenziali bucket" },
                { name: "cryptocompare_api_key", type: "secret?",   note: "M_prices_007" },
              ]}
            />
          </div>
        </ArchSection>

        {/* ─────────────────────────── Pipeline ──────────────────────── */}
        <ArchSection
          id="pipeline"
          title="Pipeline end-to-end"
          icon={GitBranch}
          intro="Dal cron GitHub Actions all'ultimo write su R2. La pipeline è resiliente: se la primary fallisce si scala al fallback senza svegliare nessuno.">
          <ArchDiagram
            id="prices-pipeline"
            source={PIPELINE_DIAGRAM}
            caption="Flow di un sync. Le source sono provate in cascata; il circuit breaker evita di sbattere ripetutamente contro una source down."
          />

          <p className="mt-4">
            <strong>Decisioni chiave</strong>:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Auth HMAC sui cron</strong>: gli endpoint{" "}
              <code>/api/cron/modules/prices/*</code> richiedono header HMAC
              firmato con shared secret. Niente IP allowlist (GitHub Actions
              non garantisce range stabili).
            </li>
            <li>
              <strong>UPSERT idempotente</strong>: due esecuzioni dello stesso
              cron sullo stesso bucket di 5min non duplicano (unique idx su
              <code>prices_history(symbol, ts)</code>).
            </li>
            <li>
              <strong>Source chain con circuit breaker</strong>: se CoinGecko
              fallisce 3 volte di fila viene marcata unhealthy per 10 min e
              ignorata, evitando latenza patologica.
            </li>
            <li>
              <strong>R2 snapshot</strong>: dopo l'UPSERT scriviamo un JSON
              statico <code>coins-top.json</code> su R2. Le pagine pubbliche
              lo leggono direttamente, niente DB hit per ogni request.
            </li>
            <li>
              <strong>updateTag</strong>: invalidiamo <code>prices:*</code>
              così tutte le query <code>unstable_cache</code> riprendono il
              valore fresh al prossimo render.
            </li>
          </ul>
        </ArchSection>

        {/* ─────────────────────────── Caching ───────────────────────── */}
        <ArchSection
          id="caching"
          title="Strategia di caching"
          icon={Boxes}
          intro="4 layer coordinati. Il pattern R2 snapshot è il più importante: scala a 1M user/giorno senza svegliare il DB per query 'global'.">
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              <strong>R2 snapshot config</strong>: query "global" (top 200
              coin, full universe, sparkline) servite da JSON statico in R2.
              Lettura ~10ms da edge, zero query DB. Pattern documentato in{" "}
              <code>project_config_snapshot_pattern</code>.
            </li>
            <li>
              <strong>Next unstable_cache</strong>: query per-coin{" "}
              <code>getCoinView()</code>, <code>getCoinNameMap()</code>,{" "}
              <code>getTrendingTickers()</code> cached con tag{" "}
              <code>prices:*</code>. Invalidate via <code>updateTag()</code>{" "}
              dopo ogni sync.
            </li>
            <li>
              <strong>Image proxy</strong>: le coin image servite da R2{" "}
              <code>gencry-media/coins/&#123;symbol&#125;.png</code>. Una
              sola volta scaricate da CoinGecko, poi servite dal nostro
              dominio (zero Hotlink Protection issue).
            </li>
            <li>
              <strong>Client-side staleness</strong>: il TickerHoverCard del
              modulo posts calcola <code>freshUntil = lastUpdated + 5min</code>{" "}
              così non rifetcha finché il prossimo cron non è girato.
            </li>
          </ol>

          <div
            className="mt-3 p-3 rounded-lg text-xs"
            style={{
              background:
                "color-mix(in srgb, var(--admin-accent) 8%, transparent)",
              color: "var(--admin-accent)",
            }}>
            <strong>Anti-pattern noto</strong>: NON usare il pool DB diretto
            per servire query global a tutto il traffico. La regola{" "}
            <em>"global query → R2 snapshot"</em> è non-negoziabile.
          </div>
        </ArchSection>

        {/* ─────────────────────────── Hooks ─────────────────────────── */}
        <ArchSection
          id="hooks"
          title="Hookable services — dove intervenire"
          icon={Wrench}
          intro="Tutto dietro interfaccia stabile. Aggiungere una source nuova = 1 file in sources/ + push nel chain. Niente toccare il resto.">
          <div className="space-y-2.5">
            <ArchHookBox
              title="Source provider"
              description="Ogni source (CoinGecko, CryptoCompare, DexScreener) implementa la stessa interface 'fetchUniverse(symbols)'. Aggiungerne uno nuovo = 1 file."
              filePath="lib/modules/prices/sources/<provider>.ts"
              contract="fetchUniverse(symbols: string[]) → Promise<PriceTick[]>"
            />
            <ArchHookBox
              title="Sync orchestrator"
              description="sync.ts orchestra il chain. Il loop primary → fallback vive qui. Cambia ordine o aggiungi source nel chain in 5 righe."
              filePath="lib/modules/prices/sync.ts"
              contract="runSync(opts) → { coins, history, source, took_ms }"
            />
            <ArchHookBox
              title="Active universe"
              description="Calcola quali coin sincronizzare per ogni run. Default = top-N + watchlist union. Estendibile (es. + symbols menzionati negli ultimi N post)."
              filePath="lib/modules/prices/active-universe.ts"
              contract="loadActiveUniverse() → string[] symbols"
            />
            <ArchHookBox
              title="Circuit breaker"
              description="State in-memory per source. health() ritorna 'healthy' | 'unhealthy'. Reset automatico dopo cooldown."
              filePath="lib/modules/prices/circuit-breaker.ts"
              contract="recordFailure(source) / health(source)"
            />
            <ArchHookBox
              title="R2 snapshot writer"
              description="Scrive coins-top.json + sparkline su R2 dopo ogni sync. Bucket configurabile via prices_settings."
              filePath="lib/modules/prices/storage.ts"
              contract="writeSnapshot(snapshot) / readSnapshot()"
            />
            <ArchHookBox
              title="Queries (consumer-side)"
              description="getCoinView, getCoinNameMap, getTrendingTickers. Tutte cached con tag invalidabili. Usate dal modulo posts."
              filePath="lib/modules/prices/queries.ts"
              contract="getCoinNameMap() → Record<lower_name, SYMBOL>"
            />
          </div>
        </ArchSection>

        {/* ─────────────────────────── Performance ───────────────────── */}
        <ArchSection
          id="performance"
          title="Performance"
          icon={Gauge}
          intro="Universe top-200, sync ogni 5min, ~12s per run. Pubblico = 0 query DB grazie a R2 snapshot.">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Sync run</strong>: ~12s end-to-end per 200 coin
              (CoinGecko Pro → UPSERT batch → R2 write). Dominato dal round
              trip API esterno.
            </li>
            <li>
              <strong>R2 snapshot read</strong>: ~10ms da edge Cloudflare
              (cached in CDN layer). Zero DB hit. Scalabilità lineare col
              traffico.
            </li>
            <li>
              <strong>getCoinNameMap()</strong>: cached con tag{" "}
              <code>prices:names</code>. Lettura cached &lt;1ms. Usata dal
              parser di posts per ogni body.
            </li>
            <li>
              <strong>Single coin view</strong>: <code>getCoinView(symbol)</code>{" "}
              cached per symbol. p95 ~5ms (memory cache hit) / ~25ms (DB hit).
            </li>
            <li>
              <strong>Sparkline</strong>: pre-aggregata in{" "}
              <code>prices_coins.sparkline_7d</code> come jsonb — niente
              GROUP BY al render.
            </li>
          </ul>
        </ArchSection>

        {/* ─────────────────────────── Future ────────────────────────── */}
        <ArchSection
          id="future"
          title="Future optimizations"
          icon={Rocket}
          intro="Modulo già in 1.0.0 e in main. Il backlog è sull'estensione (più source, più granularità) più che sull'ottimizzazione (i numeri ci sono).">
          <div className="grid sm:grid-cols-2 gap-3">
            <ArchFutureCard
              tier={1}
              title="Sentiment per coin"
              description="Aggregare reaction/post counter dal modulo posts per ottenere un sentiment crowd-sourced inline col prezzo."
              trigger="Quando il modulo posts ha >10k post attivi"
            />
            <ArchFutureCard
              tier={2}
              title="Granularità 1min per top-20"
              description="Cron secondario ogni 1min sui top-20 per supportare day-trading UI futura. CoinGecko Pro lo permette."
              trigger="Apertura modulo trading / alerts realtime"
            />
            <ArchFutureCard
              tier={2}
              title="Source on-chain (Pyth/Chainlink)"
              description="Aggiungere oracoli on-chain come ulteriore fallback per coin DEX-only. Già pronto come pattern, manca solo l'impl provider."
              trigger="Aggiunta di memecoin / token Solana al universe"
            />
            <ArchFutureCard
              tier={2}
              title="DefiLlama TVL integration"
              description="Arricchire prices_coins con TVL per protocolli DeFi. Sync separato (frequenza 30min)."
              trigger="Modulo DeFi metrics in roadmap"
            />
            <ArchFutureCard
              tier={3}
              title="Edge runtime per /api/modules/prices"
              description="Sposta gli endpoint API pubblici (es. history per chart) su edge runtime. CDN cache + 0ms cold start."
              trigger="API traffic > 1M req/giorno"
            />
            <ArchFutureCard
              tier={3}
              title="Predictive caching warmup"
              description="Pre-cachare le coin trending per evitare cold cache su hot path."
              trigger="Solo dopo aver attivato KV anche per posts"
            />
          </div>
        </ArchSection>

        {/* ─────────────────────────── Files ─────────────────────────── */}
        <ArchSection
          id="files"
          title="Files map — dove cercare cosa"
          icon={FileText}
          intro="11 file principali del modulo. Tutti sotto lib/modules/prices/.">
          <div className="space-y-2">
            <ArchFileLink
              path="lib/modules/prices/manifest.ts"
              description="Slug, label, permission, 3 cron jobs"
            />
            <ArchFileLink
              path="lib/modules/prices/sync.ts"
              description="Orchestrator: chain source + UPSERT + R2 write + updateTag"
            />
            <ArchFileLink
              path="lib/modules/prices/active-universe.ts"
              description="Calcola le coin da sincronizzare (top-N + watchlist)"
            />
            <ArchFileLink
              path="lib/modules/prices/circuit-breaker.ts"
              description="State in-memory per source health, cooldown su 5xx"
            />
            <ArchFileLink
              path="lib/modules/prices/cron-auth.ts"
              description="HMAC verification per gli endpoint /api/cron/modules/prices/*"
            />
            <ArchFileLink
              path="lib/modules/prices/sources/coingecko.ts"
              description="Source primaria. Pro plan, supporta batch + sparkline"
            />
            <ArchFileLink
              path="lib/modules/prices/sources/cryptocompare.ts"
              description="Fallback secondario, batch limit 100"
            />
            <ArchFileLink
              path="lib/modules/prices/sources/dexscreener.ts"
              description="Fallback per coin DEX-only (memecoin, low cap)"
            />
            <ArchFileLink
              path="lib/modules/prices/storage.ts"
              description="R2 snapshot writer + reader (coins-top.json)"
            />
            <ArchFileLink
              path="lib/modules/prices/queries.ts"
              description="Read-side: getCoinView, getCoinNameMap, getTrendingTickers (cached + tagged)"
            />
            <ArchFileLink
              path="lib/db/migrations/M_prices_001_init.sql"
              description="Schema iniziale: 4 tabelle + indici"
            />
            <ArchFileLink
              path="lib/db/migrations/M_prices_006_history_unique_index.sql"
              description="Unique (symbol, ts) per idempotency cron rerun"
            />
          </div>
        </ArchSection>

        {/* ─────────────────────────── Caveats ───────────────────────── */}
        <ArchSection
          id="caveats"
          title="Caveats e pitfall noti"
          icon={AlertTriangle}
          intro="Specifici di questo modulo. Alcuni sono lezioni dolorose.">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>1-char symbols esistono</strong>: CoinGecko ha coin con
              symbol di 1 char (es. Sonic = "S"). Il modulo li accetta, ma i
              consumer (posts) devono filtrare prima di INSERT (vedi
              <code>VALID_TICKER_SHAPE</code> nel parser di posts).
            </li>
            <li>
              <strong>Cloudflare Hotlink Protection</strong>: se attivata sul
              dominio R2, le coin image rompono cross-origin (es. localhost
              dev). Attualmente OFF; se riattivata serve whitelist o{" "}
              <code>referrerPolicy="no-referrer"</code>. Vedi memory{" "}
              <code>project_prices_r2_cloudflare_hotlink</code>.
            </li>
            <li>
              <strong>GitHub Actions cron drift</strong>: la schedulazione
              cron di GH Actions può ritardare 1-2min sotto carico. Per
              questo il <code>freshUntil</code> client-side ha un margine.
            </li>
            <li>
              <strong>CoinGecko Pro rate limit</strong>: 500 req/min sul
              piano corrente. Batch size massimo per evitare 429.
            </li>
            <li>
              <strong>Universe drift</strong>: top-N può cambiare day-to-day
              (rank shuffling). Coin che cadono fuori dal top-N rimangono
              nel registry ma <code>is_active=false</code>; non vengono
              eliminate per non rompere FK in altri moduli.
            </li>
            <li>
              <strong>Load test contro prod</strong>: NON fare. Vercel ha
              firewall automatico che rate-limita 15-60 min. Bug history in
              memory <code>feedback_no_load_test_against_prod</code>.
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
