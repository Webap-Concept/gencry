import type { Metadata } from "next";
import { Coins, Flame as FlameIcon, CheckCircle2, Circle } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import {
  getUserBalance,
  getUserBalanceBreakdown,
  getAllRules,
  getStreakMilestoneStatus,
} from "@/lib/modules/rewards/queries";
import { formatCoins } from "@/lib/modules/rewards/format";
import { REWARD_CATEGORIES, REWARD_CATEGORY_MAP } from "@/lib/modules/rewards/categories";

export const metadata: Metadata = { title: "My GCC Coins" };
export const dynamic = "force-dynamic";

export default async function MyCoinsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const userId = session.user.id;
  const [balance, breakdown, streakStatus, rules] = await Promise.all([
    getUserBalance(userId),
    getUserBalanceBreakdown(userId),
    getStreakMilestoneStatus(userId),
    getAllRules(),
  ]);
  const { currentStreak: streak, milestones } = streakStatus;

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
        <h1 className="font-display font-normal text-[38px] leading-[1.05] tracking-[-0.01em] text-gc-fg">
          My<span className="italic text-gc-accent">Coins</span>
        </h1>
        <p className="text-sm text-gc-fg-2 leading-relaxed">
          I GCC (Generazione Crypto Coin) sono <strong className="text-gc-fg font-medium">coin virtuali della piattaforma</strong>,
          non criptovalute reali né strumenti finanziari. La community te li
          riconosce per ogni azione: check-in giornalieri, post pubblicati e
          le reactions che ricevi dai tuoi follower.
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

      {/* ── Streak milestones ────────────────────────────────────── */}
      {milestones.some((m) => m.enabled) && (
        <section className="rounded-2xl border border-gc-line bg-gc-bg p-5 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FlameIcon size={16} className="text-orange-500" strokeWidth={1.8} />
              <span className="text-sm font-semibold text-gc-fg">Streak di accesso</span>
            </div>
            <span className="text-sm font-bold tabular-nums text-gc-fg">
              {streak} {streak === 1 ? "giorno" : "giorni"}
            </span>
          </div>

          {/* Progress bar verso il prossimo milestone */}
          {(() => {
            const next = milestones.find((m) => m.enabled && !m.achievedAt && streak < m.days);
            if (!next) return null;
            const prev = milestones.filter((m) => m.enabled && (m.achievedAt || m.days < next.days)).at(-1);
            const from = prev?.days ?? 0;
            const pct = Math.min(((streak - from) / (next.days - from)) * 100, 100);
            return (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-gc-fg-3">
                  <span>{streak} / {next.days} giorni</span>
                  <span>{next.days - streak} {next.days - streak === 1 ? "giorno" : "giorni"} al prossimo</span>
                </div>
                <div className="h-2 rounded-full bg-gc-bg-3 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-orange-400 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })()}

          {/* Lista milestone */}
          <div className="divide-y divide-gc-line">
            {milestones.filter((m) => m.enabled).map((m) => {
              const achieved = !!m.achievedAt;
              return (
                <div key={m.days} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  {achieved
                    ? <CheckCircle2 size={16} className="text-orange-400 shrink-0" strokeWidth={1.8} />
                    : <Circle size={16} className="text-gc-fg-3 shrink-0" strokeWidth={1.5} />
                  }
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm ${achieved ? "text-gc-fg font-medium" : "text-gc-fg-2"}`}>
                      {m.days} giorni consecutivi
                    </span>
                    {achieved && m.achievedAt && (
                      <span className="ml-2 text-xs text-gc-fg-3">
                        raggiunto il{" "}
                        {new Date(m.achievedAt).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
                      </span>
                    )}
                  </div>
                  <span className={`text-sm font-semibold tabular-nums shrink-0 ${achieved ? "text-gc-accent" : "text-gc-fg-3"}`}>
                    +{m.amount % 1 === 0 ? m.amount : m.amount.toFixed(2)} GCC
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

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

      {/* Empty state quando non c'è ancora nessuna attività */}
      {grandTotal === 0 && (
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
      style={{
        background: "rgba(255,255,255,0.07)",
        border: "1px solid rgba(255,255,255,0.12)",
      }}
    >
      <div className="flex items-baseline gap-1">
        {/* Menta: emerald-300 su sfondo scuro */}
        <span className="text-xl font-bold tabular-nums text-emerald-300">{value}</span>
        {unit && <span className="text-xs text-white/40">{unit}</span>}
      </div>
      <span className="text-[10.5px] uppercase tracking-wide text-white/40">{label}</span>
    </div>
  );
}
