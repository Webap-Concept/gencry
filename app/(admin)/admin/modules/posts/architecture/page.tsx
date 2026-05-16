// app/(admin)/admin/modules/posts/architecture/page.tsx
//
// ╔═══════════════════════════════════════════════════════════════════╗
// ║ ⚠ MAINTENANCE NOTICE — leggi prima di toccare il modulo posts     ║
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
// Pagina di documentazione architetturale del modulo Posts. Statica
// (zero query DB), riassume design, stack, flow, hooks e roadmap. È il
// punto di riferimento quando si rientra nel modulo dopo settimane e
// serve riacchiappare il contesto senza grepare 40 file.
//
// Tutte le sezioni vivono in QUESTA pagina; nav laterale sticky con
// anchor. Diagrammi Mermaid in dynamic import (vedi arch-diagram.tsx).
import type { Metadata } from "next";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Boxes,
  Compass,
  Database,
  FileText,
  Gauge,
  GitBranch,
  Layers,
  Rocket,
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
import { POSTS_MODULE } from "@/lib/modules/posts/manifest";

export const metadata: Metadata = { title: "Posts / Architettura" };

/** ISO date dell'ultima revisione manuale della pagina vs il codice.
 *  Bump-ala ogni volta che rivedi i contenuti (vedi memory
 *  feedback_architecture_docs_maintenance). */
const REVIEWED_AT = "2026-05-16";

const SECTIONS = [
  { id: "overview",       label: "Overview" },
  { id: "stack",          label: "Stack" },
  { id: "schema",         label: "Schema DB" },
  { id: "pipeline",       label: "Pipeline" },
  { id: "caching",        label: "Caching" },
  { id: "hooks",          label: "Hooks" },
  { id: "performance",    label: "Performance" },
  { id: "future",         label: "Future" },
  { id: "files",          label: "Files map" },
  { id: "caveats",        label: "Caveats" },
];

const SCHEMA_DIAGRAM = `erDiagram
  users ||--o{ posts : "author"
  posts ||--o{ posts_reactions : "has"
  posts ||--o{ posts_comments : "has"
  posts ||--o{ posts_bookmarks : "has"
  posts ||--o{ posts_reports : "has"
  posts ||--o{ posts_tickers : "tagged"
  posts ||--o{ posts_mentions : "mentions"
  posts ||--o{ posts_media : "has"
  posts ||--o{ posts_outbox : "emits"
  users ||--o{ posts_user_blocks : "blocks"
  posts ||--o{ posts : "repost_of"
`;

const PIPELINE_DIAGRAM = `graph TD
  A[User submits composer] --> B[Server Action<br/>createPost]
  B --> C{Visibility &<br/>RBAC checks}
  C -->|OK| D[parsing.ts<br/>extractTickers + extractMentions]
  D --> E[DB transaction]
  E --> F[INSERT posts]
  E --> G[INSERT posts_tickers]
  E --> H[INSERT posts_mentions]
  E --> I[INSERT posts_media]
  F --> J[Trigger: posts_repost_counter_trg]
  G --> K[Trigger: posts_outbox_trg<br/>mentions]
  H --> K
  K --> L[posts_outbox row]
  L --> M[Cron notifications<br/>dispatch<br/>future]
  E --> N[revalidatePath]
  N --> O[invalidateFeedCache<br/>discover + author]
`;

export default function PostsArchitecturePage() {
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
              Il modulo Posts è il <strong>social feed</strong> della
              piattaforma: composer, reactions, comments (in arrivo), bookmark,
              repost, moderazione utente e admin. È pensato per essere
              indistinguibile da un client Twitter-like ma con asse semantico
              forte sui <strong>$TICKER</strong> (preview live, filtro feed,
              auto-tag).
            </>
          }>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Visibility</strong>: post pubblici (anche anonimi) o
              members-only (gate next-auth).
            </li>
            <li>
              <strong>Moderazione</strong>: report → review admin → soft-delete
              con 7 giorni di grace + restore + cron hard-delete (modello
              Twitter).
            </li>
            <li>
              <strong>Block</strong>: mutual via singola row in{" "}
              <code>posts_user_blocks</code>, filtro applicato lato query feed.
            </li>
            <li>
              <strong>Ticker hover</strong>: SSR-prefetch dei dati coin con
              <code>freshUntil</code> allineato al cron prices (5min).
            </li>
            <li>
              <strong>Infinite scroll</strong>: keyset pagination + cursor +
              IntersectionObserver root = scroll container interno.
            </li>
          </ul>
        </ArchSection>

        {/* ─────────────────────────── Stack ─────────────────────────── */}
        <ArchSection
          id="stack"
          title="Stack tecnologico"
          icon={Layers}
          intro="Tutti gli strumenti sono già in uso nel resto del progetto — niente nuove dipendenze introdotte dal modulo, eccezione fatta per uuid_generate_v7 lato Postgres.">
          <div className="flex flex-wrap gap-2">
            <ArchTechBadge label="Next.js 16 (App Router, RSC)" variant="accent" />
            <ArchTechBadge label="Drizzle ORM" />
            <ArchTechBadge label="Postgres (Supabase)" />
            <ArchTechBadge label="uuid_generate_v7" />
            <ArchTechBadge label="DB Triggers (plpgsql)" />
            <ArchTechBadge label="Cloudflare R2 (media)" />
            <ArchTechBadge label="sharp (image processing)" />
            <ArchTechBadge label="Radix UI (Dialog, HoverCard, Popover)" />
            <ArchTechBadge label="unstable_cache + revalidateTag" />
            <ArchTechBadge label="IntersectionObserver" />
            <ArchTechBadge label="pg_cron (3 jobs)" />
            <ArchTechBadge label="Server Actions" />
            <ArchTechBadge label="Upstash KV (roadmap)" variant="warn" />
          </div>
        </ArchSection>

        {/* ─────────────────────────── Schema ────────────────────────── */}
        <ArchSection
          id="schema"
          title="Schema DB"
          icon={Database}
          intro={
            <>
              11 tabelle, tutte sotto namespace <code>posts_*</code>. PK su{" "}
              <code>uuid_generate_v7()</code> per ottenere ordinamento
              cronologico naturale negli indici (no random insertion overhead
              come UUIDv4). Counter denormalizzati su <code>posts</code> + 8
              trigger DB per coerenza.
            </>
          }>
          <ArchDiagram
            id="posts-schema"
            source={SCHEMA_DIAGRAM}
            caption="ER semplificato. Cardinalità reali nei file dello schema."
          />

          <div className="space-y-3 mt-4">
            <ArchSchemaTable
              name="posts"
              description="Entità principale + 9 counter denormalizzati"
              columns={[
                { name: "id",               type: "uuid v7",     note: "PK, ordinabile per tempo" },
                { name: "author_id",        type: "uuid",        note: "FK users(id), ON DELETE CASCADE" },
                { name: "body",             type: "text",        note: "max 1000 char (CHECK)" },
                { name: "visibility",       type: "varchar(16)", note: "'public' | 'members'" },
                { name: "repost_of_id",     type: "uuid?",       note: "self-FK per quote repost" },
                { name: "deleted_at",       type: "timestamptz?", note: "soft delete (autore o admin)" },
                { name: "deleted_by",       type: "varchar(40)?", note: "'author' | 'moderator', M_posts_006" },
                { name: "reactions_*",      type: "integer × 6", note: "denormalizzati, gestiti da trigger" },
                { name: "comments_count",   type: "integer",     note: "trigger soft-delete aware" },
                { name: "reposts_count",    type: "integer",     note: "trigger su INSERT/soft-delete del repost" },
                { name: "bookmarks_count",  type: "integer",     note: "trigger su INSERT/DELETE" },
                { name: "created_at",       type: "timestamptz", note: "default NOW()" },
              ]}
            />

            <ArchSchemaTable
              name="posts_reactions"
              description="6 kind: like, rocket, bull, bear, dump, diamond. Regola '1 user → 1 reaction' enforced applicativamente."
              columns={[
                { name: "PK", type: "(post_id, user_id, reaction)", note: "Composito" },
                { name: "reaction", type: "varchar(16)", note: "CHECK enum 6 valori" },
                { name: "idx 1", type: "(post_id, reaction)", note: "lookup 'chi ha messo X'" },
                { name: "idx 2", type: "(user_id, created_at)", note: "ultime reazioni dell'utente" },
              ]}
            />

            <ArchSchemaTable
              name="posts_tickers"
              description="Tabella di join post ↔ ticker. Popolata dal parser nel composer."
              columns={[
                { name: "PK",       type: "(post_id, ticker)" },
                { name: "ticker",   type: "varchar(20)",  note: "CHECK ^[A-Z][A-Z0-9]{1,19}$" },
                { name: "idx",      type: "(ticker, created_at DESC)", note: "feed per ticker" },
              ]}
            />

            <ArchSchemaTable
              name="posts_outbox"
              description="Coda eventi consumata in async dal modulo notifications futuro."
              columns={[
                { name: "id",           type: "uuid v7" },
                { name: "event_type",   type: "varchar(64)", note: "post.reaction.added | post.comment.created | post.mention | post.repost.created" },
                { name: "payload",      type: "jsonb" },
                { name: "processed_at", type: "timestamptz?", note: "consumer lo set; cron cleanup ≥ 30d" },
              ]}
            />

            <ArchSchemaTable
              name="posts_user_blocks"
              description="Block mutuale: 1 row blocca entrambe le direzioni."
              columns={[
                { name: "PK", type: "(blocker_id, blocked_id)" },
                { name: "filtro feed", type: "SQL", note: "NOT EXISTS in entrambe le direzioni" },
              ]}
            />
          </div>
        </ArchSection>

        {/* ─────────────────────────── Pipeline ──────────────────────── */}
        <ArchSection
          id="pipeline"
          title="Pipeline end-to-end"
          icon={GitBranch}
          intro="Dal click 'Pubblica' nel composer fino all'arrivo del post sul feed di chi segue l'autore. La pipeline è pensata per essere transazionale: o tutto va a posto o niente.">
          <ArchDiagram
            id="posts-pipeline"
            source={PIPELINE_DIAGRAM}
            caption="Flow del POST creation. I trigger DB sono in M_posts_002_triggers.sql."
          />

          <p className="mt-4">
            <strong>Punti chiave</strong>:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Tutto dentro <code>db.transaction()</code> in actions.ts — se il
              parser fallisce o un INSERT figlio rompe, rollback e zero
              counter drift.
            </li>
            <li>
              I counter sono aggiornati da <strong>trigger DB</strong>, non
              dall'app: impossibile drift, niente codice in 2 posti.
            </li>
            <li>
              <code>posts_outbox</code> è popolato dai trigger stessi → il
              consumer notifications è completamente disaccoppiato.
            </li>
            <li>
              <code>revalidatePath("/", "layout")</code> dopo il commit per
              forzare l'invalidation del Router Cache di Next 16.
            </li>
          </ul>
        </ArchSection>

        {/* ─────────────────────────── Caching ───────────────────────── */}
        <ArchSection
          id="caching"
          title="Strategia di caching"
          icon={Boxes}
          intro="3 layer di caching coordinati. V1 = solo unstable_cache + revalidateTag. V2 (roadmap) = Upstash KV per feed hot.">
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              <strong>Next unstable_cache</strong>: query DB read-only (coin
              name map, ticker preview batch, ecc.) cached per tag. Invalidate
              via <code>updateTag(tag)</code> in Server Action (Next 16).
            </li>
            <li>
              <strong>Client module cache</strong>:{" "}
              <code>TickerHoverCard</code> tiene una map in modulo (in-memory)
              dei preview con <code>freshUntil</code>. La freshness è
              allineata al cron prices (5 min) + margine, così niente fetch
              ridondanti dopo il primo hover.
            </li>
            <li>
              <strong>feed-cache (V1 pass-through)</strong>:{" "}
              <code>getCachedFeedIds()</code> oggi chiama solo il fallback;
              quando attiveremo KV (V2) la chiave sarà{" "}
              <code>feed:&#123;scope&#125;</code> TTL 60s. I call site lo
              chiamano già, zero refactor quando si attiverà.
            </li>
          </ol>

          <div
            className="mt-3 p-3 rounded-lg text-xs"
            style={{
              background:
                "color-mix(in srgb, var(--gc-warning-fg) 8%, transparent)",
              color: "var(--gc-warning-fg)",
            }}>
            <strong>Invariante</strong>: ogni mutation che genera/elimina post
            DEVE chiamare <code>invalidateFeedCache()</code> con lo scope
            corretto (discover + author + ogni ticker + ogni mentioned user).
            In V1 è no-op, ma il pattern è già nei call site.
          </div>
        </ArchSection>

        {/* ─────────────────────────── Hooks ─────────────────────────── */}
        <ArchSection
          id="hooks"
          title="Hookable services — dove intervenire"
          icon={Wrench}
          intro="Ogni provider/feature dietro interfaccia stabile. Cambiare impl = 1 file. Vale per realtime, reactions, cache, media storage, ecc.">
          <div className="space-y-2.5">
            <ArchHookBox
              title="Reactions service"
              description="addReaction / removeReaction / toggleReaction. V2 può aggiungere KV invalidation, queue, circuit-breaker senza toccare i caller (Server Actions)."
              filePath="lib/modules/posts/services/reactions.ts"
              contract="addReaction(postId, userId, kind) → { inserted }"
            />
            <ArchHookBox
              title="Feed cache"
              description="getCachedFeedIds + invalidateFeedCache. V1 pass-through; V2 Upstash KV."
              filePath="lib/modules/posts/services/feed-cache.ts"
              contract="getCachedFeedIds(key, fallback) → PostListPage"
            />
            <ArchHookBox
              title="Media storage R2"
              description="putPostMediaObject + deletePostMediaObject. Wrapper sul S3 client R2-compatible. Cambio bucket / regione = 1 setting."
              filePath="lib/modules/posts/storage/r2-media.ts"
              contract="putPostMediaObject({ key, body, contentType }) → { etag }"
            />
            <ArchHookBox
              title="Parser ticker + mentions"
              description="extractTickers / extractMentions. Case-insensitive + nome esteso whitelist O(1). Test isolati."
              filePath="lib/modules/posts/lib/parsing.ts"
              contract="extractTickers(body, coinNameMap?) → Set<string>"
            />
            <ArchHookBox
              title="Ticker preview"
              description="Server Action SSR-prefetched + freshUntil. Niente round-trip al primo hover."
              filePath="lib/modules/posts/ticker-preview-actions.ts"
              contract="getTickerPreviewBatch(symbols) → Record<symbol, data>"
            />
          </div>
        </ArchSection>

        {/* ─────────────────────────── Performance ───────────────────── */}
        <ArchSection
          id="performance"
          title="Performance"
          icon={Gauge}
          intro="Numeri presi con feed di test 100 post / 100 utenti. Tutti i target sub-100ms p95 in dev.">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Feed Discover</strong> (20 post): keyset paginated,
              JOIN su author + counter denormalizzati. p95 ≈ 35ms con indici
              <code>idx_posts_created_at_desc</code>.
            </li>
            <li>
              <strong>Feed Following</strong>: JOIN su user_follows. p95 ≈
              50ms fino a ~500 followingIds; oltre va valutato KV-set
              (vedi Future § block KV-set).
            </li>
            <li>
              <strong>Parser tickers</strong>: tokenization + Set lookup O(1)
              per parola. <strong>~50µs su body 200 char</strong>, indipendente
              dal numero di coin (testato 200 vs 100k coin → stessa latenza).
            </li>
            <li>
              <strong>Ticker hover</strong>: 0ms al primo hover (SSR
              prefetch); successivi cached client-side fino a
              <code>freshUntil</code>.
            </li>
            <li>
              <strong>Infinite scroll</strong>: prefetch 800px prima della
              fine → l'utente non vede mai lo skeleton in golden path.
            </li>
          </ul>
        </ArchSection>

        {/* ─────────────────────────── Future ────────────────────────── */}
        <ArchSection
          id="future"
          title="Future optimizations"
          icon={Rocket}
          intro="Backlog tier-ato. Tier 1 = pianificato a breve; Tier 2 = quando i numeri lo richiedono; Tier 3 = polish.">
          <div className="grid sm:grid-cols-2 gap-3">
            <ArchFutureCard
              tier={1}
              title="Comments thread"
              description="Inline su /post/[id], realtime via Supabase Postgres Changes. Schema già pronto (posts_comments). Cost: 1-2 giorni."
              trigger="Prossima iterazione (T1 finale)"
            />
            <ArchFutureCard
              tier={1}
              title="KV-set block precomputato"
              description="blocks:user:{id} Set in Upstash KV. Evita la NOT EXISTS in fan-out feed (oggi 5+ subquery per request)."
              trigger="Quando il Following feed > 500 followingIds o p95 > 100ms"
            />
            <ArchFutureCard
              tier={2}
              title="Feed cache Upstash KV"
              description="feed:{scope} TTL 60s + write-through. Codice già strutturato in feed-cache.ts (V1 pass-through)."
              trigger="Discover loggato p95 > 100ms o trending sorting attivo"
            />
            <ArchFutureCard
              tier={2}
              title="Notifications consumer"
              description="Worker che consuma posts_outbox e invia notifiche (in-app + email). Outbox già popolato dai trigger."
              trigger="Apertura modulo notifications"
            />
            <ArchFutureCard
              tier={2}
              title="Realtime feed banner"
              description="'3 nuovi post' invece di prepend automatico. Pattern GetStream. Niente layout shift."
              trigger="Following feed con >100 post/giorno per user"
            />
            <ArchFutureCard
              tier={3}
              title="Virtualization 100+"
              description="react-window per feed con 100+ post visibili. DOM rimane bounded."
              trigger="Feed con >200 post mantenuti in memoria"
            />
            <ArchFutureCard
              tier={3}
              title="Edge cache Discover anonimo"
              description="Discover anonimo è 99% identico tra utenti — può vivere in edge cache 30s. CDN-friendly."
              trigger="Discover anonymous traffic > 70% del totale"
            />
          </div>
        </ArchSection>

        {/* ─────────────────────────── Files ─────────────────────────── */}
        <ArchSection
          id="files"
          title="Files map — dove cercare cosa"
          icon={FileText}
          intro="I 15 file più importanti del modulo, raggruppati per area. Tutti vivono sotto lib/modules/posts/ + components/modules/posts/ per module isolation.">
          <div className="space-y-2">
            <ArchFileLink
              path="lib/modules/posts/manifest.ts"
              description="Slug, label, permissions, cron jobs, navChildren admin"
            />
            <ArchFileLink
              path="lib/modules/posts/queries.ts"
              description="Tutte le query feed (discover, following, profile, ticker, mentions, bookmarks) con keyset pagination"
            />
            <ArchFileLink
              path="lib/modules/posts/feed-actions.ts"
              description="Server Actions del feed: loadMoreFeed, refresh, ecc."
            />
            <ArchFileLink
              path="lib/modules/posts/actions.ts"
              description="Server Actions mutation: createPost, deletePost, restorePost, report, block"
            />
            <ArchFileLink
              path="lib/modules/posts/lib/parsing.ts"
              description="Parser $TICKER + @mention, case-insensitive + extended name match"
            />
            <ArchFileLink
              path="lib/modules/posts/services/reactions.ts"
              description="add/remove/toggle reaction, atomic transaction"
            />
            <ArchFileLink
              path="lib/modules/posts/services/feed-cache.ts"
              description="Pattern cache-aside per liste post_id, V1 pass-through, V2 KV"
            />
            <ArchFileLink
              path="lib/modules/posts/ticker-preview-actions.ts"
              description="getTickerPreview + batch con freshUntil allineato al cron prices"
            />
            <ArchFileLink
              path="lib/db/migrations/M_posts_001_init.sql"
              description="Schema iniziale: 8 tabelle + indici + CHECK constraints"
            />
            <ArchFileLink
              path="lib/db/migrations/M_posts_002_triggers.sql"
              description="8 trigger plpgsql: counter denormalizzati + outbox emit"
            />
            <ArchFileLink
              path="lib/db/migrations/M_posts_005_user_blocks.sql"
              description="Tabella block mutuale + indice per filtri feed"
            />
            <ArchFileLink
              path="components/modules/posts/FeedList.tsx"
              description="Infinite scroll con IntersectionObserver + scroll-parent root"
            />
            <ArchFileLink
              path="components/modules/posts/PostCard.tsx"
              description="Card del post: body + reactions + bookmark + author menu"
            />
            <ArchFileLink
              path="components/modules/posts/TickerHoverCard.tsx"
              description="Popover live + mobile long-press + freshUntil cache"
            />
            <ArchFileLink
              path="components/modules/posts/PostComposer.tsx"
              description="Composer con preview, drag-drop media, $TICKER auto-suggest"
            />
          </div>
        </ArchSection>

        {/* ─────────────────────────── Caveats ───────────────────────── */}
        <ArchSection
          id="caveats"
          title="Caveats e pitfall noti"
          icon={AlertTriangle}
          intro="Cose che ci sono già costate ore — tienile presenti se metti mano.">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>IntersectionObserver root</strong>: il (protected)
              layout ha <code>&lt;main overflow-y-auto&gt;</code>. Senza{" "}
              <code>findScrollParent()</code> esplicito, l'observer guarda la
              window e non scatta mai → infinite scroll rotto. Stesso pattern
              riusato da <code>useIsStuck</code> per la sticky CoinSummaryCard.
            </li>
            <li>
              <strong>posts_tickers CHECK ^[A-Z][A-Z0-9]&#123;1,19&#125;$</strong>:
              il modulo prices accetta CoinGecko symbols anche 1-char (Sonic =
              "S"). Il parser filtra applicativamente con{" "}
              <code>VALID_TICKER_SHAPE</code> prima dell'INSERT — sennò
              violazione constraint a tempo di run.
            </li>
            <li>
              <strong>Drizzle <code>${"${arr}"}</code> espande in tuple</strong>:
              non funziona <code>ANY($1::text[])</code>. Usare{" "}
              <code>inArray()</code> nativo del Drizzle.
            </li>
            <li>
              <strong>postgres-js + Date in template</strong>: non accetta{" "}
              <code>Date</code> oggetto nei sql raw, va passato come{" "}
              <code>.toISOString()</code>.
            </li>
            <li>
              <strong>unstable_cache serializza Date a string</strong>: a cache
              hit i campi <code>Date</code> diventano <code>string</code>.
              Sempre <code>new Date(value).getTime()</code> al consumo.
            </li>
            <li>
              <strong>notBlockedBy con sql.raw</strong>: non risolve identifier
              di tabella correlati per via dello scope quoting di Drizzle.
              Accetta una Drizzle Column come parametro.
            </li>
            <li>
              <strong>Feed cache signature</strong>: V1 deve ritornare{" "}
              <code>PostListPage</code> (ids + nextCursor), non solo ids,
              altrimenti l'infinite scroll si ferma al primo batch.
            </li>
          </ul>
        </ArchSection>

        <ArchMaintenanceFooter
          reviewedAt={REVIEWED_AT}
          moduleVersion={POSTS_MODULE.version}
          moduleSlug={POSTS_MODULE.slug}
        />
      </div>
    </div>
  );
}
