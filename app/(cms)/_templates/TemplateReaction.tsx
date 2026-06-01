// app/(cms)/_templates/TemplateReaction.tsx
//
// Template "reaction" — pagina di sistema /reazioni-post che spiega il
// sistema di reazioni del social. Come TemplateNewsHome è un template
// CODED: ignora page.content (bloccato via rules.contentLocked), l'admin
// gestisce solo titolo + SEO.
//
// La sezione "In uso" riproduce FEDELMENTE le nostre PostCard (header +
// footer reazioni/commenti/repost) in due stati: reazioni raggruppate
// (chiuso) e picker aperto. Statico (server component): nessun JS, le
// icone reazione sono SVG puri (REACTION_ICON), riusiamo le stesse helper
// di formato della PostCard reale.
import { MessageCircle, Repeat2 } from "lucide-react";
import type { PostReactionKind } from "@/lib/db/schema";
import type { PostReactionCounts } from "@/lib/modules/posts/types";
import {
  formatReactionCount,
  topReactions,
} from "@/lib/modules/posts/lib/reactions-format";
import { REACTION_ICON } from "@/components/modules/posts/icons";
import type { TemplateProps } from "./types";

// ─── Dati editoriali delle 5 reazioni ──────────────────────────────────
type ReactionInfo = {
  kind: PostReactionKind;
  /** Parte non corsiva + parte corsiva del nome (es. "Lik" + "e"). */
  name: [string, string];
  subtitle: string;
  description: string;
  /** Colore accento (bordo-top card + sottotitolo). */
  accent: string;
};

const REACTIONS: ReactionInfo[] = [
  {
    kind: "like",
    name: ["Lik", "e"],
    subtitle: "Diamante",
    description:
      "Apprezzamento generico. Hai trovato il post utile, ben scritto, o semplicemente concordi.",
    accent: "#3a7bbd",
  },
  {
    kind: "bullish",
    name: ["Bull", "ish"],
    subtitle: "Toro",
    description:
      "Sei rialzista. Concordi con una tesi positiva sul mercato, su un asset o su una previsione.",
    accent: "#4e9a6b",
  },
  {
    kind: "bearish",
    name: ["Bear", "ish"],
    subtitle: "Orso",
    description:
      "Sei ribassista. Vedi rischi, fragilità nella tesi o ti aspetti una correzione.",
    accent: "#c2553f",
  },
  {
    kind: "to_the_moon",
    name: ["To the ", "Moon"],
    subtitle: "Razzo",
    description:
      "Conviction massima. Il post merita di partire — ti aspetti un movimento esponenziale.",
    accent: "#fa8b1e",
  },
  {
    kind: "dump",
    name: ["Du", "mp"],
    subtitle: "Candela rossa",
    description:
      "Dislike forte. Tesi debole, asset a rischio o post che merita di essere dumpato.",
    accent: "#b3402e",
  },
];

// ─── Footer reazioni: replica fedele della PostCard reale ───────────────

/** Stato CHIUSO: icone top-2 accavallate + totale (come il trigger di
 *  ReactionPopover quando il post ha già reazioni). */
function GroupedReactions({
  counts,
  total,
}: {
  counts: PostReactionCounts;
  total: number;
}) {
  const top = topReactions(counts, 2);
  return (
    <span className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-gc-fg-muted">
      <span className="flex items-center -space-x-1" aria-hidden>
        {top.map((kind, i) => (
          <span
            key={kind}
            style={{ zIndex: top.length - i }}
            className="flex items-center justify-center"
          >
            {(() => {
              const Icon = REACTION_ICON[kind];
              return <Icon size={18} />;
            })()}
          </span>
        ))}
      </span>
      <span className="tabular-nums">{formatReactionCount(total)}</span>
    </span>
  );
}

/** Trigger reazione con il PICKER APERTO sopra, esattamente come il vero
 *  ReactionPopover in hover: la pill flotta sopra il bottone (le 5 icone),
 *  il trigger sotto mostra le reazioni già presenti sul post. */
function OpenReactionTrigger({
  counts,
  total,
}: {
  counts: PostReactionCounts;
  total: number;
}) {
  return (
    <span className="relative">
      {/* Pill del picker (5 reazioni), come ReactionPopover aperto. */}
      <span className="absolute bottom-full left-0 mb-2 inline-flex items-center gap-0.5 rounded-full border border-gc-modal-border bg-gc-modal-bg px-1.5 py-1.5 shadow-xl">
        {REACTIONS.map(({ kind }) => {
          const Icon = REACTION_ICON[kind];
          return (
            <span
              key={kind}
              className="flex h-9 w-9 items-center justify-center rounded-full"
            >
              <Icon size={28} />
            </span>
          );
        })}
      </span>
      {/* Trigger sotto: reazioni già presenti sul post. */}
      <GroupedReactions counts={counts} total={total} />
    </span>
  );
}

function CommentAction({ count }: { count: number }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-gc-accent">
      <MessageCircle size={18} strokeWidth={1.75} />
      <span className="tabular-nums">{count}</span>
    </span>
  );
}

function RepostAction({ count }: { count: number }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-gc-fg-muted">
      <Repeat2 size={18} strokeWidth={1.75} />
      <span className="tabular-nums">{count}</span>
    </span>
  );
}

/** Card post-like fedele alla PostCard reale (chrome + header + footer). */
function DemoPostCard({
  initial,
  handle,
  meta,
  children,
  footer,
}: {
  initial: string;
  handle: string;
  meta: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <article className="rounded-gc border border-gc-line bg-gc-bg-2 p-5">
      <header className="mb-3 flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gc-accent font-mono text-sm font-semibold text-white">
          {initial}
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold text-gc-fg">{handle}</p>
          <p className="font-mono text-[11px] uppercase tracking-wide text-gc-fg-3">
            {meta}
          </p>
        </div>
      </header>
      <div className="text-[15px] leading-relaxed text-gc-fg">{children}</div>
      <footer className="mt-4 flex items-center gap-1">{footer}</footer>
    </article>
  );
}

// ─── Template ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function TemplateReaction(_props: TemplateProps) {
  // Conteggi demo (card A): top-2 = like + bullish, totale 402.
  const demoCounts: PostReactionCounts = {
    like: 247,
    bullish: 89,
    bearish: 54,
    to_the_moon: 8,
    dump: 4,
  };
  const demoTotal = 402;
  // Conteggi demo (card B): post con qualche reazione + picker aperto sopra.
  const demoCountsB: PostReactionCounts = {
    like: 41,
    bullish: 18,
    bearish: 2,
    to_the_moon: 3,
    dump: 0,
  };
  const demoTotalB = 64;

  return (
    <main className="bg-gc-bg">
      <div className="mx-auto max-w-[1180px] px-6 py-16">
        {/* ── Hero ── */}
        <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.18em] text-gc-fg-3">
          <span className="text-gc-accent">—</span> Design system · Reazioni
        </p>
        <h1 className="font-display text-[clamp(2.75rem,7vw,5rem)] font-normal leading-[1.02] text-gc-fg">
          Cinque modi per <em className="italic text-gc-accent">reagire</em>.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-gc-fg-2">
          Su <em className="italic text-gc-accent">GenerazioneCrypto</em>{" "}
          post e commenti si reagiscono con cinque emoji pensate per il nostro
          contesto: niente cuori generici, niente pollici. Solo segnali che un
          trader capisce a colpo d&apos;occhio.
        </p>

        {/* ── 5 card reazione ── */}
        <div className="mt-14 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {REACTIONS.map((r) => {
            const Icon = REACTION_ICON[r.kind];
            return (
              <div
                key={r.kind}
                className="flex flex-col rounded-gc border border-gc-line bg-gc-bg-2"
              >
                <span
                  className="h-1 rounded-t-gc"
                  style={{ background: r.accent }}
                />
                <div className="flex flex-1 flex-col items-center px-5 pb-7 pt-8 text-center">
                  <Icon size={64} className="drop-shadow-sm" />
                  <h2 className="mt-6 font-display text-2xl font-normal text-gc-fg">
                    {r.name[0]}
                    <em className="italic" style={{ color: r.accent }}>
                      {r.name[1]}
                    </em>
                  </h2>
                  <p
                    className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em]"
                    style={{ color: r.accent }}
                  >
                    — {r.subtitle}
                  </p>
                  <p className="mt-4 text-sm leading-relaxed text-gc-fg-2">
                    {r.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── In uso ── */}
        <div className="mt-20 mb-6 flex items-baseline justify-between">
          <h2 className="font-display text-3xl font-normal text-gc-fg">
            In <em className="italic text-gc-accent">uso</em>
          </h2>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-gc-fg-3">
            — Sotto post e commenti
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Card A — reazioni raggruppate (stato chiuso) */}
          <DemoPostCard
            initial="M"
            handle="@marco.crypto"
            meta="12 min fa"
            footer={
              <>
                <GroupedReactions counts={demoCounts} total={demoTotal} />
                <CommentAction count={38} />
                <RepostAction count={7} />
              </>
            }
          >
            <p>
              <em className="font-mono text-[13px] not-italic text-gc-accent">
                $SOL
              </em>{" "}
              ha appena rotto i <strong>$180</strong> con volumi 3× la media
              settimanale. <strong>Setup pulito</strong>, RSI sotto controllo.
              Vedo{" "}
              <em className="font-mono text-[13px] not-italic text-gc-accent">
                $220
              </em>{" "}
              nel breve.
            </p>
          </DemoPostCard>

          {/* Card B — stesso post reale, ma con il picker reazioni APERTO */}
          <DemoPostCard
            initial="G"
            handle="@giulia.defi"
            meta="8 min fa"
            footer={
              <>
                <OpenReactionTrigger counts={demoCountsB} total={demoTotalB} />
                <CommentAction count={12} />
                <RepostAction count={3} />
              </>
            }
          >
            <p>
              Il restaking è la narrativa più sottovalutata del ciclo: TVL in
              crescita costante ma i prezzi non l&apos;hanno ancora prezzata.
              Tengo d&apos;occhio i prossimi unlock.
            </p>
          </DemoPostCard>
        </div>

        {/* Caption interazione (comportamento reale: hover apre il picker) */}
        <p className="mt-5 font-mono text-[11px] uppercase tracking-wide text-gc-fg-3">
          <strong className="text-gc-fg-2">Clic</strong> sul tasto reazione = like
          immediato · <strong className="text-gc-fg-2">passa il mouse</strong> per
          aprire il picker e scegliere tra tutte e cinque
        </p>

        {/* ── Banner finale ── */}
        <div className="mt-16 flex flex-col items-start justify-between gap-6 rounded-gc bg-gc-fg px-8 py-7 sm:flex-row sm:items-center">
          <p className="max-w-2xl text-[15px] leading-relaxed text-gc-bg">
            Le reazioni non sono solo decorazione: alimentano il{" "}
            <em className="italic text-gc-accent">sentiment</em> visibile su ogni
            asset, la classifica degli analisti e la heatmap della community.
          </p>
          <div className="flex shrink-0 items-center gap-3">
            {REACTIONS.map((r) => {
              const Icon = REACTION_ICON[r.kind];
              return (
                <span
                  key={r.kind}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-white/5"
                >
                  <Icon size={24} />
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}
