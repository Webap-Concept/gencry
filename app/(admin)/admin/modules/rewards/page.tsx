import type { Metadata } from "next";
import Link from "next/link";
import {
  getAdminOverviewStats,
  getAllRules,
  getTodayBreakdown,
} from "@/lib/modules/rewards/queries";
import { buildAdminPath } from "@/lib/admin-paths";

export const metadata: Metadata = { title: "Rewards / Overview" };
export const dynamic = "force-dynamic";

const EVENT_LABEL: Record<string, string> = {
  daily_checkin: "Daily check-in",
  post_created:  "Post published",
  like_received: "Like received",
};

export default async function RewardsOverviewPage() {
  const [stats, rules, breakdown, settingsPath, archPath] = await Promise.all([
    getAdminOverviewStats(),
    getAllRules(),
    getTodayBreakdown(),
    buildAdminPath("modules/rewards/settings"),
    buildAdminPath("modules/rewards/architecture"),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold" style={{ color: "var(--admin-text)" }}>
          Rewards
        </h1>
        <p className="text-sm" style={{ color: "var(--admin-text-muted)" }}>
          Virtual coin economy — gli utenti accumulano coin con check-in giornalieri, post e like
          ricevuti. Ledger append-only + saldo denormalizzato via trigger DB.
        </p>
      </header>

      {/* KPI globali */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Users with coins"    value={stats.totalUsersWithBalance.toLocaleString("en-US")} />
        <StatCard label="Coins circulating"   value={Number(stats.totalCoinsCirculating).toLocaleString("en-US")} />
        <StatCard label="Lifetime earned"     value={Number(stats.totalLifetimeEarned).toLocaleString("en-US")} />
        <StatCard label="Earned today"        value={Number(stats.todayEarned).toLocaleString("en-US")} sub={`${stats.todayTransactions} txns`} />
      </section>

      {/* Regole attive */}
      <section
        className="rounded-lg p-4"
        style={{ background: "var(--admin-card-bg)", border: "1px solid var(--admin-card-border)" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold" style={{ color: "var(--admin-text)" }}>
            Active earn rules
          </h2>
          <Link
            href={settingsPath}
            className="text-xs font-medium hover:underline"
            style={{ color: "var(--admin-accent)" }}
          >
            Edit →
          </Link>
        </div>
        <div className="mt-3 divide-y" style={{ borderColor: "var(--admin-card-border)" }}>
          {rules.map((r) => (
            <div key={r.eventType} className="flex items-center justify-between py-2">
              <div>
                <span className="text-sm font-medium" style={{ color: "var(--admin-text)" }}>
                  {EVENT_LABEL[r.eventType] ?? r.eventType}
                </span>
                {!r.enabled && (
                  <span
                    className="ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                    style={{ background: "var(--admin-page-bg)", color: "var(--admin-text-faint)" }}
                  >
                    disabled
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 tabular-nums text-xs" style={{ color: "var(--admin-text-muted)" }}>
                <span>
                  <span className="font-semibold" style={{ color: "var(--admin-text)" }}>
                    {r.amount}
                  </span>{" "}
                  coins
                </span>
                {r.dailyCap !== null && (
                  <span>cap {r.dailyCap}/day</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Breakdown oggi */}
      {breakdown.length > 0 && (
        <section
          className="rounded-lg p-4"
          style={{ background: "var(--admin-card-bg)", border: "1px solid var(--admin-card-border)" }}
        >
          <h2 className="text-sm font-semibold" style={{ color: "var(--admin-text)" }}>
            Today&apos;s activity
          </h2>
          <div className="mt-3 divide-y" style={{ borderColor: "var(--admin-card-border)" }}>
            {breakdown.map((b) => (
              <div key={b.eventType} className="flex items-center justify-between py-2">
                <span className="text-sm" style={{ color: "var(--admin-text)" }}>
                  {EVENT_LABEL[b.eventType] ?? b.eventType}
                </span>
                <span className="tabular-nums text-xs" style={{ color: "var(--admin-text-muted)" }}>
                  <span className="font-semibold" style={{ color: "var(--admin-text)" }}>
                    {Number(b.total ?? 0).toLocaleString("en-US")}
                  </span>{" "}
                  coins · {b.txns} txns
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section
        className="rounded-lg p-4"
        style={{ background: "var(--admin-card-bg)", border: "1px solid var(--admin-card-border)" }}
      >
        <h2 className="text-sm font-semibold" style={{ color: "var(--admin-text)" }}>
          PR-1 scope
        </h2>
        <p className="mt-1 text-xs" style={{ color: "var(--admin-text-muted)" }}>
          Earn engine: schema ledger + balances, trigger DB per like_received, hook applicativo
          per daily_checkin e post_created. Spending (catalogo riscatti) previsto in PR-2.
          UI saldo utente e widget previsti in PR-2.
        </p>
        <Link
          href={archPath}
          className="mt-3 inline-block text-xs font-medium hover:underline"
          style={{ color: "var(--admin-accent)" }}
        >
          View architecture →
        </Link>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div
      className="rounded-lg p-4"
      style={{ background: "var(--admin-card-bg)", border: "1px solid var(--admin-card-border)" }}
    >
      <div className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
        {label}
      </div>
      <div
        className="mt-1 text-2xl font-semibold tabular-nums"
        style={{ color: "var(--admin-text)" }}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 text-xs" style={{ color: "var(--admin-text-faint)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}
