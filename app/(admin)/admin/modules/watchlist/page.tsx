import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db/drizzle";
import { sql } from "drizzle-orm";

export const metadata: Metadata = { title: "Watchlist / Overview" };
export const dynamic = "force-dynamic";

type OverviewStats = {
  totalWatchlists: number;
  publicWatchlists: number;
  privateWatchlists: number;
  usersWithWatchlists: number;
  uniqueCoins: number;
  topCoins: { symbol: string; lists: number }[];
};

async function getOverviewStats(): Promise<OverviewStats> {
  // Build-time short-circuit: salta DB durante next build (vedi memory
  // project_nextbuild_admin_layout).
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return {
      totalWatchlists: 0,
      publicWatchlists: 0,
      privateWatchlists: 0,
      usersWithWatchlists: 0,
      uniqueCoins: 0,
      topCoins: [],
    };
  }

  type TotalsRow = {
    total: string;
    public_count: string;
    private_count: string;
    users_with: string;
    unique_coins: string;
  };
  const totals = await db.execute<TotalsRow>(sql`
    SELECT
      (SELECT COUNT(*)::text FROM watchlists WHERE archived_at IS NULL) AS total,
      (SELECT COUNT(*)::text FROM watchlists WHERE archived_at IS NULL AND visibility = 'public') AS public_count,
      (SELECT COUNT(*)::text FROM watchlists WHERE archived_at IS NULL AND visibility = 'private') AS private_count,
      (SELECT COUNT(DISTINCT user_id)::text FROM watchlists WHERE archived_at IS NULL) AS users_with,
      (SELECT COUNT(DISTINCT wc.symbol)::text
         FROM watchlist_coins wc
         JOIN watchlists w ON w.id = wc.watchlist_id
        WHERE w.archived_at IS NULL) AS unique_coins
  `);
  const tRow: TotalsRow | null = Array.isArray(totals)
    ? ((totals as TotalsRow[])[0] ?? null)
    : ((totals as { rows?: TotalsRow[] }).rows?.[0] ?? null);

  type TopRow = { symbol: string; lists: string };
  const top = await db.execute<TopRow>(sql`
    SELECT wc.symbol, COUNT(*)::text AS lists
      FROM watchlist_coins wc
      JOIN watchlists w ON w.id = wc.watchlist_id
     WHERE w.archived_at IS NULL
     GROUP BY wc.symbol
     ORDER BY COUNT(*) DESC, wc.symbol ASC
     LIMIT 8
  `);
  const topRows: TopRow[] = Array.isArray(top)
    ? (top as TopRow[])
    : ((top as { rows?: TopRow[] }).rows ?? []);

  return {
    totalWatchlists: parseInt(tRow?.total ?? "0", 10),
    publicWatchlists: parseInt(tRow?.public_count ?? "0", 10),
    privateWatchlists: parseInt(tRow?.private_count ?? "0", 10),
    usersWithWatchlists: parseInt(tRow?.users_with ?? "0", 10),
    uniqueCoins: parseInt(tRow?.unique_coins ?? "0", 10),
    topCoins: topRows.map((r) => ({
      symbol: r.symbol,
      lists: parseInt(r.lists, 10),
    })),
  };
}

export default async function WatchlistOverviewPage() {
  const stats = await getOverviewStats();
  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-xl font-semibold"
          style={{ color: "var(--admin-text)" }}
        >
          Watchlist
        </h1>
        <p className="text-sm" style={{ color: "var(--admin-text-muted)" }}>
          Watchlist di crypto create dagli utenti. Cap per-utente (free/
          premium) + perf 30g via cache Redis. Condivisione pubblica su
          /w/&lt;username&gt;/&lt;slug&gt;.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Watchlist attive" value={stats.totalWatchlists} />
        <StatCard label="Pubbliche" value={stats.publicWatchlists} />
        <StatCard label="Private" value={stats.privateWatchlists} />
        <StatCard
          label="Utenti con almeno 1 watchlist"
          value={stats.usersWithWatchlists}
        />
        <StatCard label="Coin uniche tracciate" value={stats.uniqueCoins} />
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
          Coin piu&apos; aggiunte
        </h2>
        {stats.topCoins.length === 0 ? (
          <p
            className="mt-1 text-xs"
            style={{ color: "var(--admin-text-muted)" }}
          >
            Nessuna coin nelle watchlist al momento.
          </p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {stats.topCoins.map((c) => (
              <li
                key={c.symbol}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs tabular-nums"
                style={{
                  background: "var(--admin-page-bg)",
                  border: "1px solid var(--admin-card-border)",
                  color: "var(--admin-text)",
                }}
              >
                <span className="font-semibold">${c.symbol}</span>
                <span style={{ color: "var(--admin-text-faint)" }}>
                  {c.lists}
                </span>
              </li>
            ))}
          </ul>
        )}
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
          Modulo completo (PR1–PR5)
        </h2>
        <p className="mt-1 text-xs" style={{ color: "var(--admin-text-muted)" }}>
          Schema + CRUD + perf 30g cache Redis + lista/detail utente +
          pagina pubblica SEO + copia watchlist + bottone &quot;aggiungi a
          watchlist&quot; sulla coin page. Cap configurabili da Impostazioni.
        </p>
        <Link
          href="/admin/modules/watchlist/architecture"
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
