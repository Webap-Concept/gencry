import type { Metadata } from "next";
import { CalendarCheck, Coins, FileText, Heart, MessageSquare } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getUserBalance, getUserBalanceBreakdown } from "@/lib/modules/rewards/queries";
import { formatCoins } from "@/lib/modules/rewards/format";
import type { RewardEventType } from "@/lib/modules/rewards/types";

export const metadata: Metadata = { title: "My Coins" };
export const dynamic = "force-dynamic";

// ─── Config categorie ────────────────────────────────────────────────────────

type CategoryConfig = {
  icon: typeof Coins;
  label: string;
  description: string;
  comingSoon?: boolean;
};

const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  daily_checkin: {
    icon: CalendarCheck,
    label: "Daily Check-in",
    description: "Accesso giornaliero all'app",
  },
  post_created: {
    icon: FileText,
    label: "Post pubblicati",
    description: "Ogni post che pubblichi",
  },
  like_received: {
    icon: Heart,
    label: "Like ricevuti",
    description: "Like ricevuti sui tuoi post",
  },
  comment_created: {
    icon: MessageSquare,
    label: "Commenti",
    description: "Ogni commento che scrivi",
  },
};

// Ordine di visualizzazione fisso (anche se l'utente non ha mai guadagnato in una categoria)
const CATEGORY_ORDER: RewardEventType[] = [
  "daily_checkin",
  "post_created",
  "comment_created",
  "like_received",
];

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function MyCoinsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const userId = session.user.id;
  const [balance, breakdown] = await Promise.all([
    getUserBalance(userId),
    getUserBalanceBreakdown(userId),
  ]);

  const currentBalance = balance?.balance ?? 0;
  const lifetimeEarned = balance?.lifetimeEarned ?? 0;

  // Mappa event_type → dati breakdown
  const byType = Object.fromEntries(
    breakdown.categories.map((c) => [c.eventType, c]),
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Hero */}
      <section className="rounded-2xl p-6 flex flex-col gap-1 bg-gc-bg-2 border border-gc-line">
        <div className="flex items-center gap-2 text-gc-fg-3 text-sm">
          <Coins size={15} strokeWidth={1.6} className="text-gc-accent" />
          <span>Il tuo saldo</span>
        </div>
        <div className="text-4xl font-bold tabular-nums text-gc-fg mt-1">
          {currentBalance.toLocaleString("en-US")}
          <span className="text-xl font-semibold text-gc-fg-3 ml-2">coins</span>
        </div>
        <div className="text-sm text-gc-fg-3 mt-1">
          Guadagnati in totale:{" "}
          <span className="font-semibold text-gc-fg">
            {lifetimeEarned.toLocaleString("en-US")}
          </span>
        </div>
      </section>

      {/* Breakdown categorie */}
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

      {/* Storia recente */}
      {breakdown.recentLedger.length > 0 && (
        <section>
          <h2 className="text-[13px] font-semibold text-gc-fg-3 uppercase tracking-wide mb-3">
            Transazioni recenti
          </h2>
          <div className="rounded-xl border border-gc-line bg-gc-bg overflow-hidden divide-y divide-gc-line">
            {breakdown.recentLedger.map((tx) => {
              const config = CATEGORY_CONFIG[tx.eventType] ?? {
                icon: Coins,
                label: tx.eventType,
              };
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
      )}

      {breakdown.recentLedger.length === 0 && (
        <section className="rounded-xl border border-gc-line bg-gc-bg p-8 text-center">
          <Coins size={32} strokeWidth={1.2} className="text-gc-fg-3 mx-auto mb-3" />
          <p className="text-sm text-gc-fg-2">
            Non hai ancora guadagnato coin.
          </p>
          <p className="text-[12.5px] text-gc-fg-3 mt-1">
            Accedi ogni giorno, pubblica post e commenta per iniziare.
          </p>
        </section>
      )}
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
