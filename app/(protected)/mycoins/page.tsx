import type { Metadata } from "next";
import { Coins } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import {
  getUserBalance,
  getUserBalanceBreakdown,
  getCheckinStreak,
  getAllRules,
} from "@/lib/modules/rewards/queries";
import { formatCoins } from "@/lib/modules/rewards/format";
import { REWARD_CATEGORIES, REWARD_CATEGORY_MAP } from "@/lib/modules/rewards/categories";

export const metadata: Metadata = { title: "My GCC Coins" };
export const dynamic = "force-dynamic";

export default async function MyCoinsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const userId = session.user.id;
  const [balance, breakdown, streak, rules] = await Promise.all([
    getUserBalance(userId),
    getUserBalanceBreakdown(userId),
    getCheckinStreak(userId),
    getAllRules(),
  ]);

  const currentBalance = balance?.balance ?? 0;
  const lifetimeEarned = balance?.lifetimeEarned ?? 0;

  const byType = Object.fromEntries(
    breakdown.categories.map((c) => [c.eventType, c]),
  );
  const rulesMap = Object.fromEntries(
    rules.map((r) => [r.eventType, parseFloat(r.amount as unknown as string)]),
  );

  const weekTotal = breakdown.categories.reduce((s, c) => s + c.weekEarned, 0);
  const grandTotal = breakdown.categories.reduce((s, c) => s + c.totalEarned, 0);

  return (
    <div className="max-w-2xl mx-auto space-y-8">

      {/* ── Intestazione pagina ───────────────────────────────────── */}
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-gc-fg-3">
          <span className="w-1.5 h-1.5 rounded-full bg-gc-accent shrink-0" />
          I tuoi&nbsp;<span className="text-gc-accent">GCC</span>&nbsp;community
        </div>
        <h1 className="text-3xl font-bold leading-tight text-gc-fg">
          My<span className="italic text-gc-accent">Coins</span>
        </h1>
        <p className="text-sm text-gc-fg-2 leading-relaxed max-w-lg">
          I GCC (Generazione Crypto Coin) che la community ti riconosce per ogni
          azione: check-in giornalieri, post pubblicati e le reactions che ricevi
          dai tuoi follower.
        </p>
      </header>

      {/* ── Hero card ─────────────────────────────────────────────── */}
      <section
        className="rounded-2xl p-6 overflow-hidden relative"
        style={{ background: "#0e2318" }}
      >
        <div
          className="absolute right-6 top-1/2 -translate-y-1/2 text-[120px] font-black leading-none select-none pointer-events-none opacity-5 text-white"
          aria-hidden
        >
          GCC
        </div>
        <div className="relative flex flex-col gap-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/50">
            Saldo totale
          </p>
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="text-orange-400">
                <Coins size={28} strokeWidth={1.4} />
              </span>
              <div>
                <span className="text-[42px] font-black tabular-nums leading-none text-white">
                  {currentBalance.toLocaleString("it-IT")}
                </span>
                <span className="ml-2 text-lg font-bold text-white/40 tracking-wide">
                  GCC
                </span>
              </div>
            </div>
            <div className="flex gap-3 shrink-0">
              <StatPill
                value={weekTotal >= 0 ? `+${formatCoins(weekTotal)}` : formatCoins(weekTotal)}
                label="Questa settimana"
              />
              <StatPill value={`${streak}`} unit="giorni" label="Streak di accesso" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Stacked bar ───────────────────────────────────────────── */}
      {grandTotal > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold text-gc-fg">Da dove arrivano</h2>
            <span className="text-[12px] text-gc-fg-3 font-mono">
              {REWARD_CATEGORIES.filter((c) => (byType[c.eventType]?.totalEarned ?? 0) > 0).length}{" "}
              categorie di reward
            </span>
          </div>
          <div className="flex h-3 rounded-full overflow-hidden gap-px">
            {REWARD_CATEGORIES.map((cfg) => {
              const earned = byType[cfg.eventType]?.totalEarned ?? 0;
              if (earned === 0) return null;
              const pct = (earned / grandTotal) * 100;
              return (
                <div
                  key={cfg.eventType}
                  className={cfg.barColor}
                  style={{ width: `${pct}%` }}
                  title={`${cfg.label}: ${Math.round(pct)}%`}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {REWARD_CATEGORIES.map((cfg) => {
              const earned = byType[cfg.eventType]?.totalEarned ?? 0;
              if (earned === 0) return null;
              const pct = Math.round((earned / grandTotal) * 100);
              return (
                <span key={cfg.eventType} className="flex items-center gap-1.5 text-[12.5px] text-gc-fg-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.barColor}`} />
                  {cfg.label}
                  <span className="text-gc-fg-3">{pct}%</span>
                </span>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Breakdown categorie ───────────────────────────────────── */}
      <section>
        <h2 className="text-[13px] font-semibold text-gc-fg-3 uppercase tracking-wide mb-3">
          Per categoria
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {REWARD_CATEGORIES.map((cfg) => {
            const data = byType[cfg.eventType];
            const earned = data?.totalEarned ?? 0;
            const txns = data?.totalTxns ?? 0;
            const pct = grandTotal > 0 ? Math.round((earned / grandTotal) * 100) : 0;
            const amountPerEvent = rulesMap[cfg.eventType];
            const Icon = cfg.icon;
            return (
              <div
                key={cfg.eventType}
                className="rounded-2xl bg-gc-bg border border-gc-line p-5 flex flex-col gap-4"
              >
                {/* Icona + percentuale */}
                <div className="flex items-start justify-between">
                  <span className={`p-2.5 rounded-xl ${cfg.iconBg}`}>
                    <Icon size={18} className="text-white" strokeWidth={1.8} />
                  </span>
                  <span className={`text-sm font-bold tabular-nums ${cfg.accentColor}`}>
                    {pct}%
                  </span>
                </div>

                {/* Label + descrizione */}
                <div>
                  <div className="text-[15px] font-semibold text-gc-fg">{cfg.label}</div>
                  <div className="text-xs text-gc-fg-3 mt-0.5">{cfg.description}</div>
                </div>

                {/* Mini progress bar */}
                <div className="h-1 rounded-full bg-gc-bg-3 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${cfg.barColor}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {/* Stats */}
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold tabular-nums text-gc-fg">
                      {earned.toLocaleString("it-IT")}
                    </span>
                    <span className="text-sm text-gc-fg-3">coin</span>
                  </div>
                  <div className="text-xs text-gc-fg-3 mt-0.5">
                    {txns > 0
                      ? `${txns.toLocaleString("it-IT")} ${cfg.countLabel}${amountPerEvent !== undefined ? ` · ${amountPerEvent}/cad` : ""}`
                      : "Nessuna attività"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Transazioni recenti ───────────────────────────────────── */}
      {breakdown.recentLedger.length > 0 ? (
        <section>
          <h2 className="text-[13px] font-semibold text-gc-fg-3 uppercase tracking-wide mb-3">
            Transazioni recenti
          </h2>
          <div className="rounded-2xl border border-gc-line bg-gc-bg overflow-hidden divide-y divide-gc-line">
            {breakdown.recentLedger.map((tx) => {
              const cfg = REWARD_CATEGORY_MAP[tx.eventType];
              const Icon = cfg?.icon ?? Coins;
              const iconBg = cfg?.iconBg ?? "bg-gc-bg-3";
              const label = cfg?.label ?? tx.eventType;
              const amount = parseFloat(tx.amount as unknown as string);
              return (
                <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                  <span className={`p-1.5 rounded-lg shrink-0 ${iconBg}`}>
                    <Icon size={13} className="text-white" strokeWidth={1.8} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gc-fg truncate">{label}</div>
                    <div className="text-[11.5px] text-gc-fg-3">
                      {new Date(tx.createdAt).toLocaleDateString("it-IT", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums text-gc-accent shrink-0">
                    +{amount % 1 === 0 ? amount : amount.toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-gc-line bg-gc-bg p-8 text-center">
          <Coins size={32} strokeWidth={1.2} className="text-gc-fg-3 mx-auto mb-3" />
          <p className="text-sm text-gc-fg-2">Non hai ancora guadagnato GCC.</p>
          <p className="text-[12.5px] text-gc-fg-3 mt-1">
            Accedi ogni giorno, pubblica post e commenta per iniziare.
          </p>
        </section>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatPill({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <div
      className="rounded-xl px-4 py-3 flex flex-col gap-0.5 min-w-[100px]"
      style={{ background: "rgba(255,255,255,0.08)" }}
    >
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold tabular-nums text-white">{value}</span>
        {unit && <span className="text-xs text-white/50">{unit}</span>}
      </div>
      <span className="text-[10.5px] uppercase tracking-wide text-white/40">{label}</span>
    </div>
  );
}
