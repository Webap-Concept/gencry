import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db/drizzle";
import { sql } from "drizzle-orm";

export const metadata: Metadata = { title: "Social Graph / Overview" };
export const dynamic = "force-dynamic";

async function getOverviewStats() {
  // Build-time short-circuit: salta DB durante next build (vedi memory
  // project_nextbuild_admin_layout).
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return { totalFollows: 0, usersWithFollows: 0, usersWithFollowers: 0 };
  }
  type Row = {
    total_follows: string;
    users_with_follows: string;
    users_with_followers: string;
  };
  const totals = await db.execute<Row>(sql`
    SELECT
      (SELECT COUNT(*)::text FROM user_follows) AS total_follows,
      (SELECT COUNT(*)::text FROM user_social_counters WHERE following_count > 0) AS users_with_follows,
      (SELECT COUNT(*)::text FROM user_social_counters WHERE followers_count > 0) AS users_with_followers
  `);
  const row: Row | null = Array.isArray(totals)
    ? ((totals as Row[])[0] ?? null)
    : ((totals as { rows?: Row[] }).rows?.[0] ?? null);
  return {
    totalFollows: parseInt(row?.total_follows ?? "0", 10),
    usersWithFollows: parseInt(row?.users_with_follows ?? "0", 10),
    usersWithFollowers: parseInt(row?.users_with_followers ?? "0", 10),
  };
}

export default async function SocialGraphOverviewPage() {
  const stats = await getOverviewStats();
  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-xl font-semibold"
          style={{ color: "var(--admin-text)" }}
        >
          Social Graph
        </h1>
        <p className="text-sm" style={{ color: "var(--admin-text-muted)" }}>
          Following relationships between users. Powers the Home feed
          (following-first + discovery fill).
        </p>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Total follows" value={stats.totalFollows} />
        <StatCard
          label="Users with at least 1 follow"
          value={stats.usersWithFollows}
        />
        <StatCard
          label="Users with at least 1 follower"
          value={stats.usersWithFollowers}
        />
      </section>

      <section
        className="rounded-lg p-4"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}
      >
        <h2
          className="text-sm font-semibold"
          style={{ color: "var(--admin-text)" }}
        >
          PR1 + PR2 — Foundation + Home feed rewire
        </h2>
        <p
          className="mt-1 text-xs"
          style={{ color: "var(--admin-text-muted)" }}
        >
          Schema, cache layer, server actions, FollowButton UI e feed Home
          unico (following-first + discovery fill) gia&apos; live. PR3
          (realtime banner + notifications nuovo follower) in arrivo.
        </p>
        <Link
          href="/admin/modules/social-graph/architecture"
          className="mt-3 inline-block text-xs font-medium hover:underline"
          style={{ color: "var(--admin-accent)" }}
        >
          Vai all&apos;architettura del modulo →
        </Link>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}
    >
      <div className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
        {label}
      </div>
      <div
        className="mt-1 text-2xl font-semibold tabular-nums"
        style={{ color: "var(--admin-text)" }}
      >
        {value.toLocaleString("en-US")}
      </div>
    </div>
  );
}
