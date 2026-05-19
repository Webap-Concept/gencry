// app/(admin)/admin/modules/news/page.tsx
//
// Overview admin del modulo News: status counters + AI cost tracking +
// quick links a queue/sources/settings.
import type { Metadata } from "next";
import Link from "next/link";
import { Activity, Inbox, Rss, Settings, BookOpen, AlertTriangle, DollarSign } from "lucide-react";
import { getStatusCounts, countPublishedBetween } from "@/lib/modules/news/queries";
import { getNewsConfig } from "@/lib/modules/news/config";
import { getAdminUrlSlug } from "@/lib/admin-paths";
import { db } from "@/lib/db/drizzle";
import { newsItems } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export const metadata: Metadata = { title: "News / Overview" };
export const dynamic = "force-dynamic";

export default async function NewsOverviewPage() {
  const [counts, cfg, adminSlug] = await Promise.all([
    getStatusCounts(),
    getNewsConfig(),
    getAdminUrlSlug(),
  ]);

  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const publishedToday = await countPublishedBetween(dayStart, now);

  const [costRow] = await db
    .select({ totalCents: sql<number>`cast(coalesce(sum(${newsItems.aiCostCents}), 0) as integer)` })
    .from(newsItems);
  const totalCostUsd = (costRow?.totalCents ?? 0) / 100;

  const apiKeyConfigured = Boolean(cfg.anthropicApiKey);

  return (
    <div className="space-y-5">
      {!apiKeyConfigured && (
        <div
          className="rounded-lg p-4 flex items-start gap-3"
          style={{
            background: "color-mix(in srgb, #ef4444 10%, var(--admin-card-bg))",
            border: "1px solid color-mix(in srgb, #ef4444 30%, transparent)",
          }}
        >
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "#ef4444" }} />
          <div className="space-y-1">
            <p className="text-sm font-semibold" style={{ color: "var(--admin-text)" }}>
              Anthropic API key not configured
            </p>
            <p className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
              The rewriter cron will skip until you set the API key in{" "}
              <Link
                href={`/${adminSlug}/modules/news/settings`}
                className="underline"
                style={{ color: "var(--admin-accent)" }}
              >
                Settings
              </Link>
              . Ingestion still runs and accumulates items as <code>pending_rewrite</code>.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Pending rewrite" value={counts.pending_rewrite} accent />
        <StatCard label="Review queue" value={counts.review} accent />
        <StatCard label="Scheduled" value={counts.scheduled} />
        <StatCard label="Published" value={counts.published} />
        <StatCard label="Rejected" value={counts.rejected} muted />
        <StatCard label="Failed" value={counts.failed} muted />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card title="Today's pace" icon={<Activity size={16} />}>
          <p className="text-2xl font-semibold" style={{ color: "var(--admin-text)" }}>
            {publishedToday} / {cfg.maxPublishedPerDay}
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--admin-text-muted)" }}>
            Articles published today out of the daily cap (
            <code>modules.news.max_published_per_day</code>).
          </p>
        </Card>
        <Card title="AI cost (total)" icon={<DollarSign size={16} />}>
          <p className="text-2xl font-semibold" style={{ color: "var(--admin-text)" }}>
            ${totalCostUsd.toFixed(2)}
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--admin-text-muted)" }}>
            Cumulative across all items. Model:{" "}
            <code>{cfg.aiModel}</code>.
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <QuickLink
          href={`/${adminSlug}/modules/news/queue`}
          icon={<Inbox size={16} />}
          label="Queue"
          hint="Review & publish"
        />
        <QuickLink
          href={`/${adminSlug}/modules/news/sources`}
          icon={<Rss size={16} />}
          label="Sources"
          hint="Manage feeds"
        />
        <QuickLink
          href={`/${adminSlug}/modules/news/settings`}
          icon={<Settings size={16} />}
          label="Settings"
          hint="Capacity + API key"
        />
        <QuickLink
          href={`/${adminSlug}/modules/news/architecture`}
          icon={<BookOpen size={16} />}
          label="Architecture"
          hint="Module reference"
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
  muted,
}: {
  label: string;
  value: number;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: "var(--admin-card-bg)",
        border: `1px solid ${accent ? "var(--admin-accent)" : "var(--admin-card-border)"}`,
        opacity: muted ? 0.7 : 1,
      }}
    >
      <p className="text-xs uppercase tracking-wide" style={{ color: "var(--admin-text-muted)" }}>
        {label}
      </p>
      <p className="text-3xl font-bold mt-1" style={{ color: "var(--admin-text)" }}>
        {value}
      </p>
    </div>
  );
}

function Card({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span style={{ color: "var(--admin-accent)" }}>{icon}</span>
        <h3 className="text-sm font-semibold" style={{ color: "var(--admin-text)" }}>
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

function QuickLink({
  href,
  icon,
  label,
  hint,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg p-4 hover:bg-black/5 dark:hover:bg-white/5 transition-colors block"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}
    >
      <div className="flex items-center gap-2">
        <span style={{ color: "var(--admin-accent)" }}>{icon}</span>
        <p className="text-sm font-medium" style={{ color: "var(--admin-text)" }}>
          {label}
        </p>
      </div>
      <p className="text-xs mt-1" style={{ color: "var(--admin-text-muted)" }}>
        {hint}
      </p>
    </Link>
  );
}
