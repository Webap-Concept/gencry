// app/(admin)/admin/modules/watchlist/architecture/page.tsx
//
// ╔═══════════════════════════════════════════════════════════════════╗
// ║ ⚠ MAINTENANCE NOTICE — leggi prima di toccare il modulo           ║
// ║ Questa pagina è la SOURCE OF TRUTH del design del modulo.         ║
// ║ Quando aggiungi/modifichi feature non banali:                     ║
// ║   • aggiorna QUESTA pagina nello stesso commit                    ║
// ║   • bump `REVIEWED_AT` qui sotto                                  ║
// ║   • bump `version` nel manifest.ts se cambia user-visible         ║
// ║ Memory di riferimento: feedback_architecture_docs_maintenance     ║
// ╚═══════════════════════════════════════════════════════════════════╝
//
// Pagina di documentazione architetturale del modulo Watchlist.
// Statica, zero query DB. Pattern allineato a social-graph/architecture.
import type { Metadata } from "next";
import {
  AlertTriangle,
  BookOpen,
  Database,
  GitBranch,
  Gauge,
  Layers,
  Rocket,
  Shield,
  Sparkles,
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
import { WATCHLIST_MODULE } from "@/lib/modules/watchlist/manifest";

export const metadata: Metadata = { title: "Watchlist / Architettura" };

const REVIEWED_AT = "2026-05-29 (PR1–PR5: schema, data layer, UI utente, pagina pubblica, copy, coin-page, admin; counter batch reale su griglie home/explore)";

const SECTIONS = [
  { id: "overview",    label: "Overview" },
  { id: "stack",       label: "Stack" },
  { id: "schema",      label: "Schema DB" },
  { id: "triggers",    label: "Triggers" },
  { id: "perf",        label: "Perf cache" },
  { id: "hooks",       label: "Hooks" },
  { id: "pages",       label: "Pagine" },
  { id: "decisions",   label: "Decisioni" },
  { id: "files",       label: "Files map" },
  { id: "future",      label: "Future" },
  { id: "caveats",     label: "Caveats" },
];

const SCHEMA_DIAGRAM = `erDiagram
  users ||--o{ watchlists : "user_id"
  watchlists ||--o{ watchlist_coins : "watchlist_id"
  watchlists ||--o{ watchlist_followers : "watchlist_id (V2)"
  users ||--o{ watchlist_followers : "watcher_user_id (V2)"
`;

const PERF_DIAGRAM = `graph LR
  REQ[render lista/detail] --> AVG[averagePerf su N coin]
  AVG --> MGET[getCoinsPerf30d MGET]
  MGET -->|hit| RET[return pct]
  MGET -->|miss per-coin| COMP[computeCoinPerf30d]
  COMP --> HIST[getHistorySeries 1m del modulo prices]
  HIST --> DELTA["(last-first)/first * 100"]
  DELTA --> SETEX[SETEX watchlist:coin-perf:SYM:30d TTL 300s]
  SETEX --> RET
`;

export default function WatchlistArchitecturePage() {
  return (
    <div className="grid lg:grid-cols-[180px_1fr] gap-6">
      <ArchAnchorNav sections={SECTIONS} />

      <div className="space-y-4 max-w-3xl">
        {/* ─── Overview ─── */}
        <ArchSection
          id="overview"
          title="Overview"
          icon={BookOpen}
          intro={
            <>
              Il modulo Watchlist permette agli utenti di creare liste di
              crypto (cap per-utente), vederne la <strong>performance 30g</strong>
              {" "}aggregata e <strong>condividerle pubblicamente</strong> su{" "}
              <code>/w/&lt;username&gt;/&lt;slug&gt;</code>. Una watchlist
              pubblica può essere <strong>copiata</strong> da altri utenti
              (snapshot). La coin page mostra un counter &quot;in N watchlist&quot;
              {" "}e un bottone &quot;Aggiungi a watchlist&quot;.
            </>
          }
        >
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Cap per-utente</strong>: function PL/pgSQL{" "}
              <code>get_user_watchlist_cap(uid)</code> single source of truth.
              Oggi ritorna sempre il free cap (default 5); pronta al wiring
              premium senza migration.
            </li>
            <li>
              <strong>Perf 30g</strong>: cache Redis <em>per-coin</em> (non
              per-watchlist), così BTC in 5 liste = 1 sola compute. Media
              semplice delle coin contenute.
            </li>
            <li>
              <strong>Visibility</strong>: <code>private</code> /{" "}
              <code>public</code>, toggleabile. Le pubbliche esposte via SEO +
              JSON-LD ItemList.
            </li>
            <li>
              <strong>Copy</strong>: duplica una watchlist pubblica nelle
              proprie come snapshot privato (no sync con la source).
            </li>
          </ul>
        </ArchSection>

        {/* ─── Stack ─── */}
        <ArchSection
          id="stack"
          title="Stack tecnologico"
          icon={Layers}
          intro="Nessuna dipendenza nuova. Postgres triggers + Drizzle + Upstash KV + RSC."
        >
          <div className="flex flex-wrap gap-2">
            <ArchTechBadge label="Next.js 16 (RSC + server actions)" />
            <ArchTechBadge label="Drizzle ORM" />
            <ArchTechBadge label="Postgres (Supabase)" />
            <ArchTechBadge label="pg trigger plpgsql (5 trigger)" />
            <ArchTechBadge label="Upstash Redis (perf cache per-coin)" />
            <ArchTechBadge label="React.cache (counter dedup)" />
            <ArchTechBadge label="ISR 60s (coin + public page)" />
            <ArchTechBadge label="JSON-LD ItemList (SEO)" />
          </div>
        </ArchSection>

        {/* ─── Schema ─── */}
        <ArchSection
          id="schema"
          title="Schema DB"
          icon={Database}
          intro={
            <>
              3 tabelle. <code>watchlist_followers</code> è un placeholder V2
              (vuota in V1). Cleanup CASCADE su <code>users</code> e{" "}
              <code>watchlists</code>.
            </>
          }
        >
          <ArchDiagram
            id="watchlist-schema"
            source={SCHEMA_DIAGRAM}
            caption="watchlists = la lista owned. watchlist_coins = PK composta (watchlist_id, symbol). watchlist_followers = V2 (segui-watchlist)."
          />
          <div className="space-y-3 mt-4">
            <ArchSchemaTable
              name="watchlists"
              description="Lista owned dall'utente. Soft-delete via archived_at (in V1 il delete e' hard, la colonna resta per un futuro archivio personale)."
              columns={[
                { name: "id",              type: "uuid",        note: "PK, uuid_generate_v7()" },
                { name: "user_id",         type: "uuid",        note: "FK users(id) ON DELETE CASCADE" },
                { name: "name",            type: "varchar(64)", note: "CHECK length>0" },
                { name: "slug",            type: "varchar(64)", note: "UNIQUE(user_id, slug) WHERE archived_at IS NULL" },
                { name: "description",     type: "text",        note: "opzionale, max 500 app-side" },
                { name: "visibility",      type: "varchar(16)", note: "'private' | 'public' (CHECK)" },
                { name: "position",        type: "integer",     note: "ordinamento (frecce, no drag V1)" },
                { name: "coins_count",     type: "integer",     note: "denorm, sync via trigger" },
                { name: "followers_count", type: "integer",     note: "denorm V2, sempre 0 in V1" },
                { name: "archived_at",     type: "timestamptz", note: "null = attiva (V1 usa hard delete)" },
              ]}
            />
            <ArchSchemaTable
              name="watchlist_coins"
              description="Coin contenute. PK composta → 1 riga per (watchlist, symbol)."
              columns={[
                { name: "watchlist_id", type: "uuid",        note: "FK watchlists(id) ON DELETE CASCADE. PK[0]" },
                { name: "symbol",       type: "varchar(20)", note: "UPPERCASE. PK[1]. Niente FK al modulo prices (loose coupling)" },
                { name: "position",    type: "integer",     note: "append-end" },
                { name: "added_at",    type: "timestamptz", note: "default now()" },
              ]}
            />
          </div>
          <p className="mt-4 text-xs"><strong>Index strategy</strong>:</p>
          <ul className="list-disc pl-5 space-y-1 text-xs">
            <li>
              <code>uq_watchlists_user_slug (user_id, slug) WHERE archived_at IS NULL</code> — URL pubblico univoco.
            </li>
            <li>
              <code>idx_watchlists_user_active (user_id, position, created_at) WHERE archived_at IS NULL</code> — lista &quot;le mie&quot;.
            </li>
            <li>
              <code>idx_watchlist_coins_wl_position (watchlist_id, position, added_at)</code> — coin batch della lista.
            </li>
            <li>
              <code>idx_watchlist_coins_symbol (symbol)</code> — reverse lookup &quot;in N watchlist&quot; sulla coin page.
            </li>
          </ul>
        </ArchSection>

        {/* ─── Triggers ─── */}
        <ArchSection
          id="triggers"
          title="Triggers DB"
          icon={Shield}
          intro="5 trigger + 1 function tengono coerenza e cap anche per chi bypassa il layer applicativo."
        >
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <code>get_user_watchlist_cap(uid)</code> (function STABLE) —
              single source of truth del cap. Oggi legge{" "}
              <code>max_per_user_free</code>; aggiornare il body per leggere
              il tier premium quando arriveranno le subscription.
            </li>
            <li>
              <code>watchlists_enforce_cap_trg</code> (BEFORE INSERT) — RAISE{" "}
              <code>watchlist_cap_reached</code> se le watchlist attive ≥ cap.
            </li>
            <li>
              <code>watchlist_coins_enforce_cap_trg</code> (BEFORE INSERT) —
              RAISE <code>watchlist_coins_cap_reached</code> se ≥{" "}
              <code>max_coins_per_watchlist</code>.
            </li>
            <li>
              <code>watchlist_coins_sync_count_trg</code> (AFTER INSERT/DELETE)
              — mantiene <code>watchlists.coins_count</code>.
            </li>
            <li>
              <code>watchlist_followers_sync_count_trg</code> (AFTER INSERT/
              DELETE) — mantiene <code>followers_count</code> (V2 placeholder).
            </li>
          </ul>
          <p className="mt-3 text-xs">
            Le <code>RAISE EXCEPTION</code> sono tradotte in error code typed
            da <code>mapDbErrorToCode</code> (cintura+bretelle col check
            applicativo).
          </p>
        </ArchSection>

        {/* ─── Perf cache ─── */}
        <ArchSection
          id="perf"
          title="Perf 30g — cache Redis per-coin"
          icon={Layers}
          intro={
            <>
              La performance 30g di una watchlist è la media delle perf 30g
              delle coin contenute. La cache è <strong>per-coin</strong>, non
              per-watchlist: una coin condivisa tra liste si calcola una sola
              volta.
            </>
          }
        >
          <ArchDiagram
            id="watchlist-perf-cache"
            source={PERF_DIAGRAM}
            caption="MGET batch sui symbol; i miss calcolano da getHistorySeries(1m) del modulo prices e fanno SETEX. Degrada a pass-through se Upstash non configurato."
          />
        </ArchSection>

        {/* ─── Hooks ─── */}
        <ArchSection
          id="hooks"
          title="Hook / API server"
          icon={Wrench}
          intro="Entry-point riusati dalla coin page e dalle pagine del modulo."
        >
          <div className="space-y-3">
            <ArchHookBox
              title="getWatchlistCountForSymbol(symbol)"
              description="Counter 'in N watchlist' per la coin page. Conta tutte le watchlist attive che contengono il symbol (aggregato anonimo). React.cache + ISR 60s."
              filePath="lib/modules/watchlist/queries.ts"
              contract="async (symbol: string) => number"
            />
            <ArchHookBox
              title="getWatchlistCountsForSymbols(symbols[])"
              description="Versione batch per le griglie coin (home/explore): conta ogni symbol con UNA query (GROUP BY) invece di N. Ritorna Map seedata a 0. Stessa semantica aggregata/anonima della singola."
              filePath="lib/modules/watchlist/queries.ts"
              contract="async (symbols: string[]) => Map<string, number>"
            />
            <ArchHookBox
              title="getMyWatchlistsForSymbol(userId, symbol)"
              description="Membership delle mie watchlist rispetto a una coin (flag hasCoin). Per il popover 'Aggiungi a watchlist'. Non cached (per-user, fresh)."
              filePath="lib/modules/watchlist/queries.ts"
              contract="async (userId, symbol) => WatchlistMembershipRow[]"
            />
            <ArchHookBox
              title="getCoinsPerf30d(symbols) / averagePerf(symbols, map)"
              description="Cache Redis per-coin della perf 30g + rollup media. Degraded-safe."
              filePath="lib/modules/watchlist/perf-cache.ts"
              contract="async (symbols: string[]) => Record<string, number|null>"
            />
            <ArchHookBox
              title="actions: create/update/delete/toggleVisibility/addCoin/removeCoin/copy"
              description="Tutte AUTH-gated + ownership check applicativo PRIMA della mutation; trigger DB backstop. copy = snapshot di una public."
              filePath="lib/modules/watchlist/actions.ts"
              contract="server actions → tagged-union result (ActionFail con cap/retryAfter)"
            />
          </div>
        </ArchSection>

        {/* ─── Pagine ─── */}
        <ArchSection
          id="pages"
          title="Pagine"
          icon={GitBranch}
          intro="UI utente + pubblica + integrazione coin."
        >
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <code>/watchlist</code> — lista mie (RSC), card grid + overview
              stats card + create dialog.
            </li>
            <li>
              <code>/watchlist/[id]</code> — detail mio: header, perf 30g,
              tabella coin con add/remove, toggle visibility, delete.
            </li>
            <li>
              <code>/w/&lt;username&gt;/&lt;slug&gt;</code> — vista pubblica
              read-only, SEO + JSON-LD, ISR 60s. Owner → &quot;Modifica&quot;,
              altri → &quot;Copia&quot;.
            </li>
            <li>
              <code>/coins/&lt;symbol&gt;</code> — counter &quot;in N
              watchlist&quot; + bottone &quot;Aggiungi a watchlist&quot;
              (membership fetchata client-side, la pagina è ISR-cached).
            </li>
          </ul>
        </ArchSection>

        {/* ─── Decisioni ─── */}
        <ArchSection
          id="decisions"
          title="Decisioni di prodotto"
          icon={Sparkles}
          intro="Scelte fissate, non bug."
        >
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Counter conta tutte le watchlist attive</strong>
              {" "}(public + private), aggregato anonimo: non si rivela mai
              chi. Segnale di popolarità reale.
            </li>
            <li>
              <strong>Copy = snapshot privato</strong>: la copia nasce privata
              e con lo stesso nome, non resta linkata alla source (no sync).
            </li>
            <li>
              <strong>Delete hard</strong> (no archivio utente in V1): sono
              coin pubbliche, niente dato sensibile. La colonna{" "}
              <code>archived_at</code> resta per un eventuale archivio futuro.
            </li>
            <li>
              <strong>Cap coin 50/watchlist</strong>: scelta UX, configurabile
              da Impostazioni. Niente FK al modulo prices (loose coupling: la
              riga resta se la coin viene disattivata).
            </li>
          </ul>
        </ArchSection>

        {/* ─── Files map ─── */}
        <ArchSection
          id="files"
          title="Files map"
          icon={Layers}
          intro="Punto di ingresso per la code review."
        >
          <div className="space-y-2">
            <ArchFileLink path="lib/modules/watchlist/manifest.ts" description="Registry, nav admin, RBAC permission" />
            <ArchFileLink path="lib/modules/watchlist/types.ts" description="Zod schemas, result types, mapDbErrorToCode, read shapes" />
            <ArchFileLink path="lib/modules/watchlist/queries.ts" description="getMyWatchlists, getMyWatchlistById, getPublicWatchlistByUserSlug, getWatchlistCountForSymbol, getWatchlistCountsForSymbols, getMyWatchlistsForSymbol, overview stats" />
            <ArchFileLink path="lib/modules/watchlist/actions.ts" description="CRUD + addCoin/removeCoin/toggleVisibility/copy + loadMyWatchlistsForSymbolAction" />
            <ArchFileLink path="lib/modules/watchlist/perf-cache.ts" description="Cache Redis per-coin perf 30g + averagePerf" />
            <ArchFileLink path="lib/modules/watchlist/slug.ts" description="slugify + generazione slug unico per-utente" />
            <ArchFileLink path="lib/modules/watchlist/coin-search.ts" description="Search coin tracciate (add-coin dialog)" />
            <ArchFileLink path="lib/db/migrations/M_watchlist_001_init.sql" description="3 tabelle + function cap + 5 trigger + index + settings seed" />
            <ArchFileLink path="components/modules/watchlist/" description="watchlist-card, overview-card, copy-button, add-to-watchlist-button" />
            <ArchFileLink path="app/(protected)/watchlist/" description="lista + detail + dialog create/edit + add-coin" />
            <ArchFileLink path="app/(public)/w/[username]/[slug]/page.tsx" description="vista pubblica SEO + JSON-LD" />
          </div>
        </ArchSection>

        {/* ─── Future ─── */}
        <ArchSection
          id="future"
          title="Future optimizations"
          icon={Rocket}
          intro="Niente di urgente in V1."
        >
          <div className="space-y-3">
            <ArchFutureCard
              tier={2}
              title="Segui-watchlist (watchlist_followers)"
              description="Tabella + trigger gia' pronti (vuoti in V1). Aggiungere UI segui/non-segui + feed delle watchlist seguite + counter followers."
              trigger="Domanda utenti di seguire le liste altrui senza copiarle"
            />
            <ArchFutureCard
              tier={3}
              title="Perf media pesata per allocazione"
              description="Oggi la perf 30g e' media semplice. Con pesi per-coin (allocation %) passare a media pesata."
              trigger="Feature 'portafoglio simulato' con quantita'"
            />
          </div>
        </ArchSection>

        {/* ─── Caveats ─── */}
        <ArchSection
          id="caveats"
          title="Caveats"
          icon={AlertTriangle}
          intro="Spigoli noti, minori."
        >
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Membership coin-page fetchata al mount</strong>: 1 query
              client per coin-page-load (loggato), perché la pagina è
              ISR-cached e lo stato salvato è per-utente.
            </li>
            <li>
              <strong>Perf media semplice</strong>: tutte le coin pesano
              uguale, indipendentemente dall&apos;importo. È un indicatore, non
              un rendimento di portafoglio reale.
            </li>
            <li>
              <strong>Counter griglie = reale, possibili 0</strong>: le card di
              home/explore usano <code>getWatchlistCountsForSymbols</code> (1
              query batch, GROUP BY su <code>idx_watchlist_coins_symbol</code>);
              le coin che nessuno ha ancora salvato mostrano onestamente
              &quot;In 0 watchlist&quot; (niente più mockup).
            </li>
          </ul>
        </ArchSection>

        <ArchMaintenanceFooter
          reviewedAt={REVIEWED_AT}
          moduleVersion={WATCHLIST_MODULE.version}
          moduleSlug={WATCHLIST_MODULE.slug}
        />
      </div>
    </div>
  );
}
