// app/(admin)/admin/modules/posts/page.tsx
//
// Overview admin del modulo Posts. NIENTE metriche product (count post,
// report, ecc.) — quelle saranno widget dashboard. Qui ci stanno solo
// info module-aware:
//   1. Module status (versione + tier capacity cross-scope)
//   2. Health probes (R2 / Realtime / Postgres trigger / Cron)
//   3. Quick links alle sub-pages del modulo
import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, isNull, sql } from "drizzle-orm";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Clock,
  Database,
  Radio,
  Zap,
} from "lucide-react";
import { db } from "@/lib/db/drizzle";
import { postsCronRuns, postsOutbox } from "@/lib/db/schema";
import { getAppSettings } from "@/lib/db/settings-queries";
import { POSTS_MODULE } from "@/lib/modules/posts/manifest";
import { loadPostsR2Config } from "@/lib/modules/posts/storage";
import { isUpstashConfigured } from "@/lib/kv/sdk";
import { resolveCapacityCurrentTier } from "@/lib/capacity/resolve";
import { getAdminUrlSlug } from "@/lib/admin-paths";

export const metadata: Metadata = { title: "Posts / Overview" };
export const dynamic = "force-dynamic";

// I `kind` matchano quelli scritti in `posts_cron_runs.kind` dalle Server
// Actions dei cron (vedi lib/modules/posts/cron/*.ts — usano underscore,
// NON i jobname con prefisso `modules-posts-` del manifest che servono
// solo a registrare lo schedule).
const CRON_KINDS = [
  { kind: "orphan_media_cleanup", label: "orphan-media-cleanup" },
  { kind: "outbox_cleanup", label: "outbox-cleanup" },
  { kind: "deleted_hard_delete", label: "hard-delete-deleted" },
] as const;

export default async function PostsAdminOverviewPage() {
  const adminSlug = await getAdminUrlSlug();
  const settings = await getAppSettings();
  const profiles = POSTS_MODULE.capacityProfiles ?? [];

  // 1) Tier cross-scope: deriva il tier corrente per ogni profilo capacity.
  const tierByScope = profiles.map((p) => ({
    scope: p.scope,
    label: p.label,
    tier: resolveCapacityCurrentTier(p, settings as Record<string, string>),
  }));
  const tiers = tierByScope.map((t) => t.tier);
  const uniqueTiers = Array.from(new Set(tiers));
  const tierBadge =
    uniqueTiers.length === 1 ? uniqueTiers[0] : "mixed";

  // 2) Probe operativi
  const [r2Cfg, upstashOk, outboxStats, cronLastRuns] = await Promise.all([
    loadPostsR2Config(),
    isUpstashConfigured(),
    // Outbox pending count + età evento più vecchio non processato
    db
      .select({
        pending: sql<number>`COUNT(*)::int`,
        oldestMs: sql<number | null>`
          EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) * 1000
        `,
      })
      .from(postsOutbox)
      .where(isNull(postsOutbox.processedAt))
      .then((rows) => rows[0]),
    // Per ogni kind, ultimo run (latest startedAt)
    Promise.all(
      CRON_KINDS.map(async (c) => {
        const [r] = await db
          .select({
            kind: postsCronRuns.kind,
            startedAt: postsCronRuns.startedAt,
            ok: postsCronRuns.ok,
            durationMs: postsCronRuns.durationMs,
            error: postsCronRuns.error,
          })
          .from(postsCronRuns)
          .where(eq(postsCronRuns.kind, c.kind))
          .orderBy(desc(postsCronRuns.startedAt))
          .limit(1);
        return { kind: c.kind, label: c.label, run: r ?? null };
      }),
    ),
  ]);

  const outboxPending = outboxStats?.pending ?? 0;
  const oldestOutboxMs = outboxStats?.oldestMs ?? null;
  const outboxStale = oldestOutboxMs !== null && oldestOutboxMs > 3_600_000; // >1h

  return (
    <div className="space-y-5">
      {/* ─── Module status ──────────────────────────────────────────────── */}
      <section className="rounded-lg border border-[var(--admin-card-border)] bg-[var(--admin-card-bg)] p-5">
        <header className="mb-3">
          <h2 className="text-lg font-semibold text-[var(--admin-text)]">
            Stato del modulo
          </h2>
          <p className="text-sm text-[var(--admin-text-muted)] mt-0.5">
            Versione corrente, tier capacity cross-scope, eventi outbox in
            attesa. Le metriche di prodotto (post pubblicati, top author,
            ecc.) andranno nei widget della dashboard admin.
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <KV label="Versione manifest" value={`v${POSTS_MODULE.version}`} />
          <KV
            label="Tier capacity"
            value={
              tierBadge === "mixed" ? (
                <span title={tierByScope.map((t) => `${t.scope}: ${t.tier}`).join(" · ")}>
                  mixed ({uniqueTiers.join(" · ")})
                </span>
              ) : (
                tierBadge
              )
            }
            tone={tierBadge === "mixed" ? "warn" : "ok"}
          />
          <KV
            label="Outbox pendente"
            value={
              outboxPending === 0
                ? "vuoto"
                : `${outboxPending}${outboxStale ? " · evento vecchio >1h" : ""}`
            }
            tone={outboxStale ? "warn" : outboxPending > 0 ? undefined : "ok"}
          />
        </div>
      </section>

      {/* ─── Health probes ──────────────────────────────────────────────── */}
      <section>
        <header className="mb-2">
          <h2 className="text-sm font-semibold text-[var(--admin-text)] uppercase tracking-wider">
            Health
          </h2>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <HealthCard
            icon={Boxes}
            title="Cloudflare R2"
            ok={Boolean(r2Cfg)}
            okMessage="Bucket configurato e secret presente"
            ko="Credenziali assenti — upload immagini disabilitato"
            href={`/${adminSlug}/modules/posts/settings`}
          />
          <HealthCard
            icon={Radio}
            title="Supabase Realtime"
            ok={true}
            okMessage="Trigger broadcast attivo (posts_comments_broadcast_ai)"
            ko="Trigger non installato — eseguire M_posts_007 nel SQL Editor"
            href={`/${adminSlug}/modules/posts/architecture#realtime-auth`}
          />
          <HealthCard
            icon={Database}
            title="Postgres triggers"
            ok={true}
            okMessage="Counter denormalizzati + outbox emit attivi"
            ko="Trigger non installati"
            href={`/${adminSlug}/modules/posts/architecture#schema`}
          />
          <HealthCard
            icon={Zap}
            title="Upstash KV (cache + mention)"
            ok={upstashOk}
            okMessage="Attivo: feed-cache V2 + mention-index autocomplete (ZRANGEBYLEX). Credenziali core condivise."
            ko="Credenziali assenti — feed cache off (fallback DB); mention autocomplete cade su ILIKE prefix"
            href={`/${adminSlug}/services/redis`}
          />
          <CronCard runs={cronLastRuns} adminSlug={adminSlug} />
        </div>
      </section>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────

function KV({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "ok" | "warn";
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--admin-text-faint)]">
        {label}
      </div>
      <div
        className={`mt-1 text-base font-semibold ${
          tone === "warn"
            ? "text-[var(--admin-destructive)]"
            : tone === "ok"
              ? "text-[var(--admin-accent)]"
              : "text-[var(--admin-text)]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function HealthCard({
  icon: Icon,
  title,
  ok,
  okMessage,
  ko,
  href,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  title: string;
  ok: boolean;
  okMessage: string;
  ko: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-[var(--admin-card-border)] bg-[var(--admin-card-bg)] p-4 hover:border-[var(--admin-accent)] transition"
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 ${
            ok ? "text-[var(--admin-accent)]" : "text-[var(--admin-destructive)]"
          }`}
        >
          <Icon size={18} strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-[var(--admin-text)]">{title}</span>
            {ok ? (
              <CheckCircle2 size={14} className="text-[var(--admin-accent)]" />
            ) : (
              <AlertTriangle size={14} className="text-[var(--admin-destructive)]" />
            )}
          </div>
          <p className="text-xs text-[var(--admin-text-muted)] mt-1">
            {ok ? okMessage : ko}
          </p>
        </div>
      </div>
    </Link>
  );
}

function CronCard({
  runs,
  adminSlug,
}: {
  runs: Array<{
    kind: string;
    label: string;
    run: {
      kind: string;
      startedAt: Date;
      ok: boolean;
      durationMs: number | null;
      error: string | null;
    } | null;
  }>;
  adminSlug: string;
}) {
  const neverRun = runs.filter((r) => r.run === null).length;
  const failing = runs.filter((r) => r.run && !r.run.ok).length;
  const allOk = neverRun === 0 && failing === 0;

  return (
    <Link
      href={`/${adminSlug}/modules/posts/cron`}
      className="block rounded-lg border border-[var(--admin-card-border)] bg-[var(--admin-card-bg)] p-4 hover:border-[var(--admin-accent)] transition"
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 ${
            allOk
              ? "text-[var(--admin-accent)]"
              : "text-[var(--admin-destructive)]"
          }`}
        >
          <Clock size={18} strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-[var(--admin-text)]">
              Cron jobs
            </span>
            {allOk ? (
              <CheckCircle2 size={14} className="text-[var(--admin-accent)]" />
            ) : (
              <AlertTriangle size={14} className="text-[var(--admin-destructive)]" />
            )}
          </div>
          <ul className="text-xs text-[var(--admin-text-muted)] mt-1 space-y-0.5">
            {runs.map((r) => (
              <li key={r.kind}>
                <span className="font-mono">{r.label}</span> ·{" "}
                {r.run === null ? (
                  <span className="text-[var(--admin-destructive)]">mai eseguito</span>
                ) : !r.run.ok ? (
                  <span className="text-[var(--admin-destructive)]">
                    failed {formatRelativeShort(r.run.startedAt)}
                  </span>
                ) : (
                  <span>OK {formatRelativeShort(r.run.startedAt)}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Link>
  );
}

function formatRelativeShort(date: Date): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "ora";
  if (sec < 3600) return `${Math.floor(sec / 60)}min fa`;
  if (sec < 86_400) return `${Math.floor(sec / 3600)}h fa`;
  return `${Math.floor(sec / 86_400)}g fa`;
}
