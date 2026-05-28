// app/(admin)/admin/modules/social-graph/architecture/page.tsx
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
// Pagina di documentazione architetturale del modulo Social Graph.
// Statica, zero query DB. Pattern allineato a /admin/modules/prices/architecture.
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
import { SOCIAL_GRAPH_MODULE } from "@/lib/modules/social-graph/manifest";

export const metadata: Metadata = { title: "Social Graph / Architettura" };

const REVIEWED_AT = "2026-05-28";

const SECTIONS = [
  { id: "overview",    label: "Overview" },
  { id: "stack",       label: "Stack" },
  { id: "schema",      label: "Schema DB" },
  { id: "triggers",    label: "Triggers" },
  { id: "pipeline",    label: "Pipeline" },
  { id: "caching",     label: "Caching" },
  { id: "hooks",       label: "Hooks" },
  { id: "performance", label: "Performance" },
  { id: "future",      label: "Future" },
  { id: "files",       label: "Files map" },
  { id: "caveats",     label: "Caveats" },
];

const SCHEMA_DIAGRAM = `erDiagram
  users ||--o{ user_follows : "follower_id"
  users ||--o{ user_follows : "followed_id"
  users ||--|| user_social_counters : "denorm counters"
  posts_user_blocks }o..o{ user_follows : "cascade unfollow"
`;

const FOLLOW_PIPELINE_DIAGRAM = `graph TD
  CLICK[Click su FollowButton] --> ACT[followUserAction server action]
  ACT --> AUTH{getUser auth gate}
  AUTH -->|null| ERR1[error: unauthenticated]
  AUTH -->|ok| SELF{self-follow?}
  SELF -->|yes| ERR2[error: self_follow]
  SELF -->|no| RL{rate limit Upstash 30/min?}
  RL -->|deny| ERR3[error: rate_limited]
  RL -->|ok| BLK{isBlockedBetween?}
  BLK -->|yes| ERR4[error: blocked]
  BLK -->|no| DB[INSERT user_follows]
  DB --> TR_GUARD[trigger: block_guard re-check]
  DB --> TR_COUNT[trigger: sync_counters +1/+1]
  DB --> TR_NOTIF[trigger: notify_new_follower]
  TR_NOTIF --> NOTIF[INSERT notifications type=social.follow]
  DB --> INV[invalidateFollowingSet KV]
  DB --> CTX[setFollowOverride Context client]
  CTX --> UI[All PostCard sync\\nbutton→"Segui già"]
`;

const BLOCK_PIPELINE_DIAGRAM = `graph TD
  CLICK[Click 'Blocca utente' nel dropdown] --> ACT[toggleUserBlock posts action]
  ACT --> INS[INSERT posts_user_blocks]
  INS --> TR_CASC[trigger: cascade_unfollow]
  TR_CASC --> DEL[DELETE user_follows AB + BA]
  DEL --> TR_COUNT[trigger: sync_counters -1/-1]
  INS --> KV1[invalidateBlockedIdsForViewer<br/>blocker + blocked]
  INS --> KV2[invalidateFollowingSet<br/>blocker + blocked]
  INS --> CTX[setFollowOverride false<br/>Context client]
  INS --> REV[revalidatePath '/']
`;

const CACHE_DIAGRAM = `graph LR
  REQ[RSC request] --> L0[React.cache<br/>per-request dedup]
  L0 -->|hit 99%| RET[return Set]
  L0 -->|miss| L1[In-process Map<br/>TTL 30s]
  L1 -->|hit 80%| RET
  L1 -->|miss| L2[Upstash KV<br/>TTL 5min]
  L2 -->|hit 15%| RET
  L2 -->|miss| L3[DB SELECT<br/>user_follows]
  L3 -->|< 1%| RET
  L3 -->|error| EMPTY[empty Set fallback]
`;

export default function SocialGraphArchitecturePage() {
  return (
    <div className="grid lg:grid-cols-[180px_1fr] gap-6">
      <ArchAnchorNav sections={SECTIONS} />

      <div className="space-y-4 max-w-3xl">
        {/* ─────────────────────────── Overview ─────────────────────── */}
        <ArchSection
          id="overview"
          title="Overview"
          icon={BookOpen}
          intro={
            <>
              Il modulo Social Graph gestisce le relazioni di{" "}
              <strong>following</strong> tra utenti — la fondazione del feed
              Home personalizzato. Modello <strong>directed</strong> stile X:
              A segue B non implica B segua A. Niente account privati in V1:
              il follow è sempre istantaneo e pubblico.
            </>
          }
        >
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Hot path consumer</strong>: modulo <code>posts</code>. Il
              feed Home applica strategia{" "}
              <strong>following-first + discovery fill</strong> via{" "}
              <code>getFollowingSet(viewerId)</code> con cache 3-layer.
            </li>
            <li>
              <strong>Counter denormalizzati</strong>: tabella dedicata{" "}
              <code>user_social_counters</code> per isolare il write contention
              da <code>user_profiles</code> (hot path read).
            </li>
            <li>
              <strong>Block aware</strong>: se A blocca B, le righe{" "}
              <code>user_follows</code> di entrambe le direzioni vengono
              cancellate via trigger DB. Pattern X/IG/Threads.
            </li>
            <li>
              <strong>Realtime banner Home</strong>: riusa il canale Supabase
              <code>feed:discover</code> esistente, filtra client-side su
              <code>authorId ∈ followingSet</code>. Zero subscribe n+1.
            </li>
            <li>
              <strong>Notifications</strong>: trigger DB su{" "}
              <code>INSERT user_follows</code> emette riga{" "}
              <code>notifications type=&apos;social.follow&apos;</code>.
            </li>
            <li>
              <strong>Cross-card sync</strong>: React Context globale{" "}
              <code>FollowOverridesProvider</code> tiene una{" "}
              <code>Map&lt;authorId, boolean&gt;</code> in memoria → tutte le
              PostCard dello stesso autore si re-renderizzano coerenti senza
              prop drilling.
            </li>
          </ul>
        </ArchSection>

        {/* ─────────────────────────── Stack ────────────────────────── */}
        <ArchSection
          id="stack"
          title="Stack tecnologico"
          icon={Layers}
          intro="Implementazione minimal: nessuna libreria esterna social-graph-specifica. Tutto Postgres triggers + Drizzle + Upstash KV + React Context."
        >
          <div className="flex flex-wrap gap-2">
            <ArchTechBadge label="Next.js 16 (RSC + server actions)" variant="accent" />
            <ArchTechBadge label="Drizzle ORM" />
            <ArchTechBadge label="Postgres (Supabase)" variant="accent" />
            <ArchTechBadge label="pg trigger plpgsql (4 trigger)" variant="accent" />
            <ArchTechBadge label="Upstash Redis (3-layer cache)" variant="accent" />
            <ArchTechBadge label="@upstash/ratelimit sliding window" />
            <ArchTechBadge label="React Context (cross-card sync)" />
            <ArchTechBadge label="Supabase Realtime Broadcast" />
            <ArchTechBadge label="React.cache (per-request dedup)" />
            <ArchTechBadge label="unstable_cache TTL 60s (preview)" />
          </div>
        </ArchSection>

        {/* ─────────────────────────── Schema ───────────────────────── */}
        <ArchSection
          id="schema"
          title="Schema DB"
          icon={Database}
          intro={
            <>
              2 tabelle sotto namespace <code>user_*</code> (root, no slug
              prefix: il graph è semantica core del social, non implementation
              detail del modulo). Cleanup CASCADE su <code>users</code>.
            </>
          }
        >
          <ArchDiagram
            id="social-graph-schema"
            source={SCHEMA_DIAGRAM}
            caption="user_follows = relazione directed. user_social_counters = denorm via trigger. posts_user_blocks (modulo posts) triggera DELETE cascade."
          />

          <div className="space-y-3 mt-4">
            <ArchSchemaTable
              name="user_follows"
              description="Relazione directed follower → followed. PK composite, no surrogate id."
              columns={[
                { name: "follower_id", type: "uuid",         note: "FK users(id), ON DELETE CASCADE. PK[0]" },
                { name: "followed_id", type: "uuid",         note: "FK users(id), ON DELETE CASCADE. PK[1]" },
                { name: "created_at",  type: "timestamptz",  note: "default now() — usato come cursor keyset" },
              ]}
            />

            <ArchSchemaTable
              name="user_social_counters"
              description="Counter denormalizzati. Row creata lazy al primo follow (UPSERT dal trigger)."
              columns={[
                { name: "user_id",         type: "uuid",         note: "PK, FK users(id) ON DELETE CASCADE" },
                { name: "followers_count", type: "integer",      note: "default 0. Sincronizzato dal trigger sync_counters" },
                { name: "following_count", type: "integer",      note: "default 0. GREATEST(...,0) clamp defensive" },
                { name: "updated_at",      type: "timestamptz",  note: "bump ad ogni UPSERT" },
              ]}
            />
          </div>

          <p className="mt-4 text-xs">
            <strong>Index strategy</strong>:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-xs">
            <li>
              <code>PK(follower_id, followed_id)</code> → query &quot;chi seguo&quot;.
            </li>
            <li>
              <code>idx_user_follows_follower_created (follower_id, created_at)</code> →
              lista <code>/u/[u]/following</code> paginata.
            </li>
            <li>
              <code>idx_user_follows_followed (followed_id, created_at)</code> →
              lista <code>/u/[u]/followers</code> paginata.
            </li>
            <li>
              <code>idx_posts_author_created_id (author_id, created_at DESC, id DESC) WHERE deleted_at IS NULL</code>{" "}
              (M_004) → sostiene il following branch del feed Home con N grandi.
            </li>
            <li>
              <code>idx_user_social_counters_top_followers (followers_count DESC) WHERE followers_count &gt; 0</code>{" "}
              (M_004) → SuggestedFollowsRow.
            </li>
          </ul>
        </ArchSection>

        {/* ─────────────────────────── Triggers ─────────────────────── */}
        <ArchSection
          id="triggers"
          title="Triggers DB"
          icon={Shield}
          intro="5 trigger plpgsql tengono il modulo coerente anche per chi bypassa il layer applicativo (admin SQL, future API esterne, seed)."
        >
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <code>user_follows_block_guard_trg</code> (BEFORE INSERT su{" "}
              <code>user_follows</code>) — rifiuta il follow se esiste blocco
              mutuale in <code>posts_user_blocks</code> (con error code{" "}
              <code>follow_blocked</code>). Cintura+bretelle col check
              JS-side.
            </li>
            <li>
              <code>user_follows_sync_counters_trg</code> (AFTER INSERT/DELETE
              su <code>user_follows</code>) — UPSERT atomico sui counter, +/-1
              su entrambi gli utenti. <code>GREATEST(...,0)</code> clamp
              defensive sul DELETE.
            </li>
            <li>
              <code>user_follows_notify_trg</code> (AFTER INSERT su{" "}
              <code>user_follows</code>, M_002) — inserisce riga in{" "}
              <code>notifications</code> con type <code>social.follow</code>,
              actor = follower, recipient = followed. Payload include{" "}
              <code>actor_username</code> per deep-link senza JOIN extra.
            </li>
            <li>
              <code>posts_user_blocks_cascade_unfollow_trg</code> (AFTER INSERT
              su <code>posts_user_blocks</code>, M_003) — quando A blocca B,
              DELETE entrambe le righe <code>user_follows</code> (A→B e B→A).
              Le DELETE attivano <code>sync_counters_trg</code> che aggiusta i
              counter. <strong>Unblock NON ripristina il follow</strong> — è
              richiesto click esplicito.
            </li>
            <li>
              <code>posts_feed_broadcast_trg</code> (AFTER INSERT su{" "}
              <code>posts</code>, M_posts_011) — esteso per emettere anche post
              con <code>visibility=&apos;followers&apos;</code> sul topic{" "}
              <code>feed:discover</code>. Il client del banner Home filtra{" "}
              <code>authorId ∈ followingSet</code>.
            </li>
          </ul>
        </ArchSection>

        {/* ─────────────────────────── Pipeline ─────────────────────── */}
        <ArchSection
          id="pipeline"
          title="Pipeline event flow"
          icon={GitBranch}
          intro="Due flow principali documentati: follow (felicità) e block (cascade). Realtime banner e notifiche scattano automaticamente come side effect dei trigger."
        >
          <ArchDiagram
            id="social-graph-follow-pipeline"
            source={FOLLOW_PIPELINE_DIAGRAM}
            caption="Follow flow: server action + 3 gate (auth/self/rate-limit) + block check + INSERT + 3 trigger DB + 2 invalidation (KV + Context)."
          />

          <ArchDiagram
            id="social-graph-block-pipeline"
            source={BLOCK_PIPELINE_DIAGRAM}
            caption="Block flow: INSERT posts_user_blocks → trigger cascade DELETE user_follows bidirezionale → counter scendono automaticamente."
          />
        </ArchSection>

        {/* ─────────────────────────── Caching ──────────────────────── */}
        <ArchSection
          id="caching"
          title="Caching — 3-layer"
          icon={Layers}
          intro={
            <>
              Pattern allineato a <code>posts/services/blocks.ts</code>. Per
              ogni viewer un <code>Set&lt;authorId&gt;</code> dei seguiti,
              servito attraverso 4 livelli con fallback. <strong>Never throw</strong>:
              ogni errore → Set vuoto (conservativo, fail-closed).
            </>
          }
        >
          <ArchDiagram
            id="social-graph-cache-layers"
            source={CACHE_DIAGRAM}
            caption="Hit rate atteso a regime warm. Stale tollerabile per visibility check; invalidate sincrono su follow/unfollow/block."
          />

          <ul className="list-disc pl-5 space-y-1 mt-3">
            <li>
              <strong>L0 React.cache</strong> — 1 sola call per request RSC
              anche con N caller (Home feed + ProfileFollowersCard + counter +
              visibility check + hydration getPostsByIds tutti chiamano lo
              stesso hook → 1 fetch effettivo).
            </li>
            <li>
              <strong>L1 Map TTL 30s</strong> — assorbe i page navigation
              rapidi nello stesso lambda warm. Cap 500 entry con eviction LRU.
            </li>
            <li>
              <strong>L2 Upstash KV</strong> — chiave{" "}
              <code>social-graph:following:user:&lt;id&gt;</code>, TTL 5min,
              array di string. Stale tollerabile (un follow appena fatto vede
              l&apos;aggiornamento subito grazie a L1 + invalidate).
            </li>
            <li>
              <strong>L3 DB</strong> — fallback su miss totale. Set vuoto se
              anche DB fallisce (never throw).
            </li>
          </ul>

          <p className="mt-3">
            <strong>Invalidation</strong>: chiamata dopo ogni{" "}
            <code>follow / unfollow</code> del <code>followerId</code>, e su{" "}
            <code>block</code> per entrambi gli utenti (il trigger cascade ha
            cancellato righe in entrambi i Set).
          </p>

          <p className="mt-3">
            <strong>Profile followers preview</strong>: la card{" "}
            <code>ProfileFollowersCard</code> è wrappata in{" "}
            <code>unstable_cache</code> TTL 60s con tag{" "}
            <code>profile-followers:&lt;userId&gt;</code>. Per profili virali:
            1 query/min/userId invece di 1/render.
          </p>
        </ArchSection>

        {/* ─────────────────────────── Hooks ────────────────────────── */}
        <ArchSection
          id="hooks"
          title="Hook stabili (cross-modulo)"
          icon={Wrench}
          intro="I consumer esterni (modulo posts, profile page, notifications) usano queste API. Cambiare la signature richiede revisione cross-modulo."
        >
          <div className="space-y-3">
            <ArchHookBox
              title="getFollowingSet(viewerId)"
              description="Set degli userId che il viewer segue. Hot path del feed Home + visibility 'followers' + bottoni Follow su PostCard. React.cache + L1 + Upstash + DB fallback."
              filePath="lib/modules/social-graph/services/follows-cache.ts"
              contract="async (viewerId: string) => ReadonlySet<string>. Never throw."
            />
            <ArchHookBox
              title="invalidateFollowingSet(followerId)"
              description="Cancella L1 + L2 per un viewer. Chiamato da followUserAction, unfollowUserAction, toggleUserBlock (per blocker e blocked)."
              filePath="lib/modules/social-graph/services/follows-cache.ts"
              contract="async (followerId: string) => void. Never throw."
            />
            <ArchHookBox
              title="isFollowing(viewer, target)"
              description="Check rapido O(1) sopra getFollowingSet — niente query extra. Usato per UI hydration (profile header, PostCard slot)."
              filePath="lib/modules/social-graph/queries.ts"
              contract="async (viewerId: string|null, targetId: string) => boolean"
            />
            <ArchHookBox
              title="getSocialCounters(userId)"
              description="Snapshot { followersCount, followingCount } via SELECT su PK. React.cache dedup per request. Default {0,0} se row counter non esiste."
              filePath="lib/modules/social-graph/queries.ts"
              contract="async (userId: string) => SocialCounters"
            />
            <ArchHookBox
              title="useFollowOverride(authorId, initial) / useSetFollowOverride()"
              description="React Context client. Tiene Map<authorId, boolean> per sincronizzare cross-card. Default no-op fuori dal Provider (safe)."
              filePath="components/social-graph/FollowOverridesProvider.tsx"
              contract="hook React. setOverride(id, bool) → tutti i consumer di useFollowOverride(id) re-renderano."
            />
          </div>
        </ArchSection>

        {/* ─────────────────────────── Performance ──────────────────── */}
        <ArchSection
          id="performance"
          title="Performance"
          icon={Gauge}
          intro={
            <>
              Hot path budget per request RSC autenticata: <strong>+5–15ms
              TTFB</strong> vs baseline pre-modulo. La cache 3-layer porta{" "}
              <code>getFollowingSet</code> a ~0 fetch reali a regime warm.
            </>
          }
        >
          <p>
            <strong>Costi misurati per request Home</strong>:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <code>blockedIds</code>: 1 KV read (L1 hit dopo prima call)
            </li>
            <li>
              <code>followingSet</code>: 1 KV read (L1 hit) — nuovo
            </li>
            <li>
              2 SQL feed (following branch + discovery fill se serve)
            </li>
            <li>
              <code>getPostsByIds</code> hydration con entrambi i Set
            </li>
          </ul>

          <p className="mt-3">
            <strong>Costo Upstash stimato</strong> (100 DAU × 15 PV/g):
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>~45k GET followingSet/mese</li>
            <li>~3k DEL su follow/unfollow/mese</li>
            <li>~6k pipeline rate-limit/mese</li>
            <li>
              <strong>Totale ~57k commands/mese</strong> — Free tier 500k →
              margine 10×.
            </li>
          </ul>

          <p className="mt-3">
            <strong>Trigger DB</strong>: tutti i 5 trigger costano 1-3ms
            ciascuno. Nessun impatto perceivable finché le mutation restano{" "}
            &lt; 100/sec sostenuti.
          </p>
        </ArchSection>

        {/* ─────────────────────────── Future ───────────────────────── */}
        <ArchSection
          id="future"
          title="Future optimizations"
          icon={Rocket}
          intro="Cosa fare quando i numeri cambiano. Niente di urgente in V1."
        >
          <div className="space-y-3">
            <ArchFutureCard
              tier={2}
              title="Account privati (follow request)"
              description="Stato pending/accepted/rejected su user_follows + UI conferma + RLS più complessa. V1 X-style: pubblico istantaneo. V2 quando arriva il caso d'uso."
              trigger="Richiesta esplicita da > 5% degli utenti o requisito compliance"
            />
            <ArchFutureCard
              tier={2}
              title="Soft-follow archive (unblock restore)"
              description="Tabella separata che ricorda chi seguiva chi al tempo del block, per offrire 'ripristina follow' dopo unblock. Complessità alta, valore basso."
              trigger="Feedback utenti: 'avevo bloccato per sbaglio, ora ho perso il follow'"
            />
            <ArchFutureCard
              tier={2}
              title="Push fan-out write-time"
              description="Pattern Instagram-scale: scrivere il feed-id del follower al momento del post, invece di pull al read. Richiede jobs queue + outbox pattern. Solo sopra ~1k followee medi."
              trigger="p95 query Home > 200ms con followingSet medio > 500"
            />
            <ArchFutureCard
              tier={2}
              title="Algoritmico For You feed"
              description="Boost following + decay temporale + engagement signals. Richiede signal store + ranking pipeline. Trasforma getHomeFeedIds da chronological a ranked."
              trigger="Retention > 30% con desiderio esplicito di feed più engaging"
            />
            <ArchFutureCard
              tier={3}
              title="revalidateTag su ProfileFollowersCard"
              description="Oggi TTL 60s basta. Plug-in revalidateTag('profile-followers:<id>') dopo follow/unfollow per consistency immediata della preview."
              trigger="Drift visibile lamentato dagli utenti (rarissimo: la preview è 8 avatar)"
            />
            <ArchFutureCard
              tier={3}
              title="Email channel social.follow"
              description="Aggiungere social.follow a ACHIEVEMENT_EMAILABLE_TYPES + renderer email dedicato. Oggi notifica solo in-app. Richiede UX decision: digest giornaliero vs istantaneo."
              trigger="Engagement utenti: tornano spesso per le notifiche di follower"
            />
          </div>
        </ArchSection>

        {/* ─────────────────────────── Files map ─────────────────────── */}
        <ArchSection
          id="files"
          title="Files map"
          icon={Layers}
          intro="Punto di ingresso per la code review."
        >
          <div className="space-y-2">
            <ArchFileLink
              path="lib/modules/social-graph/manifest.ts"
              description="Registry, nav admin, RBAC permission"
            />
            <ArchFileLink
              path="lib/modules/social-graph/queries.ts"
              description="getFollowingSet (re-export), isFollowing, getSocialCounters, listFollowers/Following keyset, postsFromFollowingFragment"
            />
            <ArchFileLink
              path="lib/modules/social-graph/actions.ts"
              description="followUserAction, unfollowUserAction. Gates: auth, self, target, block, rate-limit"
            />
            <ArchFileLink
              path="lib/modules/social-graph/list-actions.ts"
              description="loadMoreFollowList per paginazione client /u/[u]/followers e /following"
            />
            <ArchFileLink
              path="lib/modules/social-graph/services/follows-cache.ts"
              description="3-layer cache (React.cache + Map TTL 30s + Upstash TTL 5min + DB). Never throw."
            />
            <ArchFileLink
              path="lib/modules/social-graph/services/rate-limit.ts"
              description="@upstash/ratelimit sliding window 30/min/user. Fail-open."
            />
            <ArchFileLink
              path="lib/db/migrations/M_social_graph_001_init.sql"
              description="Tabelle + trigger block guard + trigger sync counters"
            />
            <ArchFileLink
              path="lib/db/migrations/M_social_graph_002_notification_trigger.sql"
              description="Trigger notify_new_follower → notifications social.follow"
            />
            <ArchFileLink
              path="lib/db/migrations/M_social_graph_003_block_cascade.sql"
              description="Trigger cascade unfollow su INSERT posts_user_blocks"
            />
            <ArchFileLink
              path="lib/db/migrations/M_social_graph_004_perf_indexes.sql"
              description="Index posts.author_id composite + user_social_counters.followers_count partial"
            />
            <ArchFileLink
              path="lib/db/migrations/M_posts_011_broadcast_followers.sql"
              description="Estende posts_feed_broadcast_trg per emettere anche post 'followers'"
            />
            <ArchFileLink
              path="components/social-graph/FollowButton.tsx"
              description="Client: variant 'compact' (pillola hover-expand) + 'default'. Optimistic UI + Context override."
            />
            <ArchFileLink
              path="components/social-graph/FollowOverridesProvider.tsx"
              description="Context React + 2 hooks. Montato nel root layout."
            />
            <ArchFileLink
              path="components/social-graph/HomeNewPostsBanner.tsx"
              description="Realtime banner 'X nuovi post' filtrato su followingSet"
            />
            <ArchFileLink
              path="components/social-graph/HomeEmptyBanner.tsx"
              description="Banner empty state quando followingSet vuoto"
            />
            <ArchFileLink
              path="components/social-graph/SuggestedFollowsRow.tsx"
              description="Carousel suggerimenti top followers_count (empty state)"
            />
            <ArchFileLink
              path="components/social-graph/ProfileFollowersCard.tsx"
              description="Preview 8 follower nella right rail della profile page. unstable_cache 60s."
            />
            <ArchFileLink
              path="components/social-graph/FollowListPage.tsx"
              description="RSC + client paginato per /u/[u]/followers e /following"
            />
          </div>
        </ArchSection>

        {/* ─────────────────────────── Caveats ──────────────────────── */}
        <ArchSection
          id="caveats"
          title="Caveats"
          icon={AlertTriangle}
          intro="Spigoli noti documentati per non perderci tempo in review futuri."
        >
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>followingSet snapshot per banner</strong>: il{" "}
              <code>HomeNewPostsBanner</code> congela il Set al mount via{" "}
              <code>useRef</code>. Un follow/unfollow in sessione NON altera il
              banner finché refresh. Acceptable V1 — alternative complicate
              (re-subscribe su ogni cambio Context) costose.
            </li>
            <li>
              <strong>Broadcast 'followers' a /explore</strong>:{" "}
              <code>NewPostsBannerSlot</code> dell&apos;explore riceve anche
              eventi <code>followers</code> ma il discover feed non li mostra.
              Counter leggermente inflato per utenti che seguono autori che
              postano <code>followers</code>. Acceptable V1.
            </li>
            <li>
              <strong>Listfollowers/following NON block-aware</strong>: le
              pagine <code>/u/[u]/followers</code> e <code>/following</code>{" "}
              non filtrano per block del viewer (la lista include
              potenzialmente utenti che il viewer ha bloccato/è stato bloccato
              da). Defense in depth da aggiungere se diventa fastidioso.
            </li>
            <li>
              <strong>Dedup notifiche social.follow</strong>: nessuna finestra
              di dedup. Se A → unfollow → refollow B nello stesso giorno, B
              riceve 2 notifiche. Acceptable V1 — aggiungere{" "}
              <code>idx_notifications_dedup</code> + check trigger se diventa
              rumoroso.
            </li>
            <li>
              <strong>Unblock NON ripristina follow</strong>: scelta di design,
              non bug. Richiede click esplicito per tornare a seguire. Pattern
              X/IG.
            </li>
          </ul>
        </ArchSection>

        <ArchMaintenanceFooter
          reviewedAt={REVIEWED_AT}
          moduleVersion={SOCIAL_GRAPH_MODULE.version}
          moduleSlug={SOCIAL_GRAPH_MODULE.slug}
        />
      </div>
    </div>
  );
}
