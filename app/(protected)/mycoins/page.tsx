import type { Metadata } from "next";
import { CalendarCheck, Coins, FileText, Heart, MessageSquare } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import {
  getUserBalance,
  getUserBalanceBreakdown,
  getCheckinStreak,
} from "@/lib/modules/rewards/queries";
import { formatCoins } from "@/lib/modules/rewards/format";
import type { RewardEventType } from "@/lib/modules/rewards/types";

export const metadata: Metadata = { title: "My Coins" };
export const dynamic = "force-dynamic";

// ─── Config categorie ────────────────────────────────────────────────────────

type CategoryConfig = {
  icon: typeof Coins;
  label: string;
  description: string;
  color: string;      // classe Tailwind bg per la barra
  dotColor: string;   // classe Tailwind text/bg per il dot legenda
};

const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  daily_checkin: {
    icon: CalendarCheck,
    label: "Accesso",
    description: "Check-in giornaliero",
    color: "bg-orange-400",
    dotColor: "bg-orange-400",
  },
  post_created: {
    icon: FileText,
    label: "Creazione post",
    description: "Ogni post che pubblichi",
    color: "bg-emerald-600",
    dotColor: "bg-emerald-600",
  },
  like_received: {
    icon: Heart,
    label: "Reactions ricevute",
    description: "Reactions ricevute sui tuoi post",
    color: "bg-red-700",
    dotColor: "bg-red-700",
  },
  comment_created: {
    icon: MessageSquare,
    label: "Commenti",
    description: "Ogni commento che scrivi",
    color: "bg-blue-500",
    dotColor: "bg-blue-500",
  },
};

const CATEGORY_ORDER: RewardEventType[] = [
  "daily_checkin",
  "post_created",
  "like_received",
  "comment_created",
];

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function MyCoinsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const userId = session.user.id;
  const [balance, breakdown, streak] = await Promise.all([
    getUserBalance(userId),
    getUserBalanceBreakdown(userId),
    getCheckinStreak(userId),
  ]);

  const currentBalance = balance?.balance ?? 0;
  const lifetimeEarned = balance?.lifetimeEarned ?? 0;

  const byType = Object.fromEntries(
    breakdown.categories.map((c) => [c.eventType, c]),
  );

  // Settimana: somma weekEarned di tutte le categorie
  const weekTotal = breakdown.categories.reduce((s, c) => s + c.weekEarned, 0);

  // Totale per la barra proporzionale
  const grandTotal = breakdown.categories.reduce((s, c) => s + c.totalEarned, 0);

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* ── Hero card ─────────────────────────────────────────────── */}
      <section
        className="rounded-2xl p-6 overflow-hidden relative"
        style={{ background: "#0e2318" }}
      >
        {/* Watermark decorativo */}
        <div
          className="absolute right-6 top-1/2 -translate-y-1/2 text-[120px] font-black leading-none select-none pointer-events-none opacity-5 text-white"
          aria-hidden
        >
          GCC
        </div>

        <div className="relative flex flex-col gap-5">
          {/* Label */}
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/50">
            Saldo totale
          </p>

          {/* Saldo + stats */}
          <div className="flex items-end justify-between gap-4 flex-wrap">
            {/* Numero principale */}
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

            {/* Stat pills */}
            <div className="flex gap-3 shrink-0">
              <StatPill
                value={weekTotal >= 0 ? `+${formatCoins(weekTotal)}` : formatCoins(weekTotal)}
                label="Questa settimana"
              />
              <StatPill
                value={`${streak}`}
                unit="giorni"
                label="Streak di accesso"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Stacked bar ───────────────────────────────────────────── */}
      {grandTotal > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold text-gc-fg">
              Da dove arrivano
            </h2>
            <span className="text-[12px] text-gc-fg-3">
              {CATEGORY_ORDER.filter((e) => byType[e]?.totalEarned > 0).length} categorie di reward
            </span>
          </div>

          {/* Barra */}
          <div className="flex h-3 rounded-full overflow-hidden gap-px">
            {CATEGORY_ORDER.map((eventType) => {
              const data = byType[eventType];
              if (!data || data.totalEarned === 0) return null;
              const pct = (data.totalEarned / grandTotal) * 100;
              const cfg = CATEGORY_CONFIG[eventType];
              return (
                <div
                  key={eventType}
                  className={cfg.color}
                  style={{ width: `${pct}%` }}
                  title={`${cfg.label}: ${Math.round(pct)}%`}
                />
              );
            })}
          </div>

          {/* Legenda */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {CATEGORY_ORDER.map((eventType) => {
              const data = byType[eventType];
              if (!data || data.totalEarned === 0) return null;
              const pct = Math.round((data.totalEarned / grandTotal) * 100);
              const cfg = CATEGORY_CONFIG[eventType];
              return (
                <span key={eventType} className="flex items-center gap-1.5 text-[12.5px] text-gc-fg-2">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dotColor}`} />
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CATEGORY_ORDER.map((eventType) => {
            const config = CATEGORY_CONFIG[eventType];
            const data = byType[eventType];
            const Icon = config.icon;
            return (
              <div
                key={eventType}
                className="rounded-xl p-4 bg-gc-bg border border-gc-line flex flex-col gap-3"
              >
                <div className="flex items-center gap-2.5">
                  <span className="p-1.5 rounded-lg bg-gc-bg-2">
                    <Icon size={16} strokeWidth={1.6} className="text-gc-accent" />
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-gc-fg">{config.label}</div>
                    <div className="text-[11.5px] text-gc-fg-3">{config.description}</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <StatMini label="Oggi" value={data?.todayEarned ?? 0} />
                  <StatMini label="7 giorni" value={data?.weekEarned ?? 0} />
                  <StatMini label="Totale" value={data?.totalEarned ?? 0} highlight />
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
          <div className="rounded-xl border border-gc-line bg-gc-bg overflow-hidden divide-y divide-gc-line">
            {breakdown.recentLedger.map((tx) => {
              const config = CATEGORY_CONFIG[tx.eventType] ?? { icon: Coins, label: tx.eventType };
              const Icon = config.icon;
              return (
                <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="p-1.5 rounded-lg bg-gc-bg-2 shrink-0">
                    <Icon size={14} strokeWidth={1.6} className="text-gc-accent" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gc-fg truncate">{config.label}</div>
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
                    +{tx.amount}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-gc-line bg-gc-bg p-8 text-center">
          <Coins size={32} strokeWidth={1.2} className="text-gc-fg-3 mx-auto mb-3" />
          <p className="text-sm text-gc-fg-2">Non hai ancora guadagnato coin.</p>
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
    <div className="rounded-xl px-4 py-3 flex flex-col gap-0.5 min-w-[100px]"
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

function StatMini({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10.5px] text-gc-fg-3">{label}</span>
      <span
        className={`text-base font-bold tabular-nums ${
          highlight ? "text-gc-fg" : "text-gc-fg-2"
        }`}
      >
        {formatCoins(value)}
      </span>
    </div>
  );
}
