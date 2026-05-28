// app/(admin)/admin/modules/social-graph/architecture/page.tsx
//
// ╔═══════════════════════════════════════════════════════════════════╗
// ║ ⚠ MAINTENANCE NOTICE — leggi prima di toccare il modulo           ║
// ║ Questa pagina e' la SOURCE OF TRUTH del design del modulo         ║
// ║ social-graph. Quando aggiungi/modifichi feature non banali:       ║
// ║   • aggiorna QUESTA pagina nello stesso commit                    ║
// ║   • bump `REVIEWED_AT`                                            ║
// ║   • bump `version` nel manifest.ts se cambia user-visible         ║
// ║ Memory di riferimento: feedback_architecture_docs_maintenance     ║
// ╚═══════════════════════════════════════════════════════════════════╝
import type { Metadata } from "next";
import { SOCIAL_GRAPH_MODULE } from "@/lib/modules/social-graph/manifest";

export const metadata: Metadata = { title: "Social Graph / Architettura" };

const REVIEWED_AT = "2026-05-28 (PR3: realtime banner Home + notifica social.follow)";

export default function SocialGraphArchitecturePage() {
  return (
    <div className="space-y-6 text-sm" style={{ color: "var(--admin-text)" }}>
      <header>
        <h1
          className="text-xl font-semibold"
          style={{ color: "var(--admin-text)" }}
        >
          {SOCIAL_GRAPH_MODULE.label} — Architettura
        </h1>
        <p className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
          Versione manifest: {SOCIAL_GRAPH_MODULE.version} · Revisione doc:{" "}
          {REVIEWED_AT}
        </p>
      </header>

      <Section title="Overview">
        <p>
          Il modulo gestisce le relazioni di <em>following</em> tra utenti.
          Modello: <strong>directed</strong> (A segue B non implica B segua A,
          stile X). Niente account privati in V1: il follow e&apos; sempre
          istantaneo e pubblico.
        </p>
        <p>
          Il consumer principale e&apos; il modulo <code>posts</code>: il feed
          Home applica strategia{" "}
          <strong>following-first + discovery fill</strong> via{" "}
          <code>getFollowingSet(viewerId)</code> con cache 3-layer.
        </p>
      </Section>

      <Section title="Schema DB">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <code>user_follows(follower_id, followed_id, created_at)</code> —
            PK composite. CHECK no-self-follow. Indici secondari su{" "}
            <code>(follower_id, created_at)</code> e{" "}
            <code>(followed_id, created_at)</code>.
          </li>
          <li>
            <code>
              user_social_counters(user_id PK, followers_count,
              following_count, updated_at)
            </code>{" "}
            — counter denormalizzati, row creata lazy al primo follow.
          </li>
        </ul>
      </Section>

      <Section title="Triggers">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <code>user_follows_block_guard_trg</code> (BEFORE INSERT): rifiuta
            il follow se esiste blocco mutuale in <code>posts_user_blocks</code>{" "}
            (cintura+bretelle col check JS-side).
          </li>
          <li>
            <code>user_follows_sync_counters_trg</code> (AFTER INSERT/DELETE):
            UPSERT atomico sui counter, +/-1. <code>GREATEST(...,0)</code>{" "}
            defensive clamp.
          </li>
        </ul>
      </Section>

      <Section title="Caching — 3-layer">
        <p>
          Pattern allineato a <code>posts/services/blocks.ts</code>. Per ogni
          viewer un Set degli <code>userId</code> seguiti:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>L0 React.cache</strong> — dedup per request RSC.
          </li>
          <li>
            <strong>L1 Map TTL 30s</strong> — assorbe picchi nello stesso
            lambda warm.
          </li>
          <li>
            <strong>L2 Upstash TTL 5min</strong> — chiave{" "}
            <code>social-graph:following:user:&lt;id&gt;</code>.
          </li>
          <li>
            <strong>L3 DB</strong> — fallback su miss totale. Set vuoto se DB
            fallisce (never-throw).
          </li>
        </ul>
        <p>
          Invalidate chiamata dopo ogni follow/unfollow del{" "}
          <code>followerId</code>. Il <code>followedId</code> non ha un Set
          following che cambi.
        </p>
      </Section>

      <Section title="Rate limit">
        <p>
          Sliding window via @upstash/ratelimit. Default 30 follow/min per
          utente. Soglia configurabile via setting{" "}
          <code>modules.social-graph.rate_limit_follow_per_min</code>. Unfollow
          non ha rate limit (no abuse model).
        </p>
      </Section>

      <Section title="Files map">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <code>lib/modules/social-graph/manifest.ts</code>
          </li>
          <li>
            <code>lib/modules/social-graph/queries.ts</code> —
            getFollowingSet, isFollowing, getSocialCounters, listFollowers,
            listFollowing
          </li>
          <li>
            <code>lib/modules/social-graph/actions.ts</code> —
            followUserAction, unfollowUserAction
          </li>
          <li>
            <code>lib/modules/social-graph/services/follows-cache.ts</code> —
            3-layer cache
          </li>
          <li>
            <code>lib/modules/social-graph/services/rate-limit.ts</code>
          </li>
          <li>
            <code>lib/db/migrations/M_social_graph_001_init.sql</code>
          </li>
        </ul>
      </Section>

      <Section title="Roadmap PR">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>PR1</strong> ✅ Schema + cache + actions + tests (commit{" "}
            <code>06a1d929</code>).
          </li>
          <li>
            <strong>PR2</strong> ✅ Feed Home unico following-first +
            discovery fill, <code>FollowButton</code> compact su PostCard +
            full su profilo, counter clickabili, pagine{" "}
            <code>/u/[u]/followers</code> e <code>/following</code>,{" "}
            <code>HomeEmptyBanner</code> + <code>SuggestedFollowsRow</code>,
            visibility <code>&apos;followers&apos;</code> attivata in tutte le
            feed query e nel selectPostsCore embed.
          </li>
          <li>
            <strong>PR3</strong> ✅ Realtime banner &quot;X nuovi post&quot;
            sul feed Home via filtro client su <code>feed:discover</code>{" "}
            (trigger broadcast esteso a visibility{" "}
            <code>&apos;followers&apos;</code> in M_posts_011) + notifica{" "}
            <code>social.follow</code> via trigger DB
            <code>user_follows_notify_trg</code>.
          </li>
        </ul>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="space-y-2 rounded-lg p-4"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}
    >
      <h2 className="text-sm font-semibold" style={{ color: "var(--admin-text)" }}>
        {title}
      </h2>
      <div
        className="space-y-2 text-xs leading-relaxed"
        style={{ color: "var(--admin-text-muted)" }}
      >
        {children}
      </div>
    </section>
  );
}
