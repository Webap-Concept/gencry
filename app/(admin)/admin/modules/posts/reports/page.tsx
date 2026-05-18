// /admin/modules/posts/reports — queue di moderazione (PR-8 + comment reports M_posts_010)
//
// Polimorfismo via searchParam `kind`: 'post' (default) o 'comment'.
// Le 2 modalità riusano lo stesso layout (pillsbar status + lista
// raggruppata) ma le query, le actions e i ReviewDialog sono separati
// per tipo. La pillsbar di tipo sta in cima alla page, sotto al
// section header.
import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import {
  getCommentReportsQueue,
  getReportsQueue,
  type ReportQueueStatus,
} from "@/lib/modules/posts/queries";
import { getActiveReportReasons } from "@/lib/modules/posts/services/report-reasons";
import { ReportsQueueClient } from "./_components/reports-queue-client";
import { CommentReportsQueueClient } from "./_components/comment-reports-queue-client";

export const metadata: Metadata = { title: "Posts / Reports" };
export const dynamic = "force-dynamic";

// Tab semplificati 2026-05-18: una segnalazione può solo essere
// 'open' (da processare), 'actioned' (accettata, contenuto rimosso) o
// 'dismissed' (respinta). 'reviewed' resta nel CHECK SQL per backward
// compat ma non è esposto in UI. 'all' rimosso perché confusionale.
// Una URL legacy con ?status=reviewed o ?status=all retrocede su 'open'.
const VALID_STATUSES: ReportQueueStatus[] = [
  "open",
  "actioned",
  "dismissed",
];

type ReportKind = "post" | "comment";

function parseStatus(raw: string | undefined): ReportQueueStatus {
  return (VALID_STATUSES as string[]).includes(raw ?? "")
    ? (raw as ReportQueueStatus)
    : "open";
}

function parseKind(raw: string | undefined): ReportKind {
  return raw === "comment" ? "comment" : "post";
}

export default async function PostsReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; status?: string; cursor?: string }>;
}) {
  const params = await searchParams;
  const status = parseStatus(params.status);
  const kind = parseKind(params.kind);

  // Reasons sono condivise tra post e commenti (stesso catalogo
  // admin-editable), quindi le carichiamo una sola volta a prescindere
  // dal kind.
  const reasonsPromise = getActiveReportReasons();

  // Query del kind selezionato + counter di entrambi i kind per i tab
  // header (così l'admin vede quanti report ci sono nell'altro tab
  // senza dover navigare).
  const [reasons, currentQueue, otherCount] = await Promise.all([
    reasonsPromise,
    kind === "post"
      ? getReportsQueue({ status, cursor: params.cursor, limit: 25 })
      : getCommentReportsQueue({ status, cursor: params.cursor, limit: 25 }),
    kind === "post"
      ? getCommentReportsQueue({ status: "open", limit: 0 })
      : getReportsQueue({ status: "open", limit: 0 }),
  ]);

  const reasonLabels = new Map<string, string>(
    reasons.map((r) => [
      r.key,
      r.labelByLocale.it ??
        r.labelByLocale.en ??
        Object.values(r.labelByLocale)[0] ??
        r.key,
    ]),
  );
  const reasonLabelsRecord = Object.fromEntries(reasonLabels);

  // Header counter: numero di "open" del kind corrente + numero del
  // kind alternativo (per tab).
  const postsOpenCount =
    kind === "post"
      ? currentQueue.countByStatus.open
      : otherCount.countByStatus.open;
  const commentsOpenCount =
    kind === "comment"
      ? currentQueue.countByStatus.open
      : otherCount.countByStatus.open;

  return (
    <div className="space-y-4">
      <KindTabs kind={kind} postsOpen={postsOpenCount} commentsOpen={commentsOpenCount} />

      <Suspense fallback={null}>
        {/* key=`${kind}|${status}`: forza unmount/remount al cambio di
            kind o status. Senza, lo stato locale (selected dialog,
            paginazione client) resterebbe a quello del tab precedente. */}
        {kind === "post" ? (
          <ReportsQueueClient
            key={`post|${status}`}
            initial={currentQueue as Awaited<ReturnType<typeof getReportsQueue>>}
            status={status}
            reasonLabels={reasonLabelsRecord}
          />
        ) : (
          <CommentReportsQueueClient
            key={`comment|${status}`}
            initial={currentQueue as Awaited<ReturnType<typeof getCommentReportsQueue>>}
            status={status}
            reasonLabels={reasonLabelsRecord}
          />
        )}
      </Suspense>
    </div>
  );
}

function KindTabs({
  kind,
  postsOpen,
  commentsOpen,
}: {
  kind: ReportKind;
  postsOpen: number;
  commentsOpen: number;
}) {
  const tabs: Array<{ k: ReportKind; label: string; count: number }> = [
    { k: "post", label: "Post", count: postsOpen },
    { k: "comment", label: "Commenti", count: commentsOpen },
  ];
  return (
    <div className="flex items-center gap-2 border-b" style={{ borderColor: "var(--admin-card-border)" }}>
      {tabs.map((t) => {
        const active = t.k === kind;
        return (
          <Link
            key={t.k}
            href={`?kind=${t.k}&status=open`}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors"
            style={{
              borderColor: active ? "var(--admin-accent)" : "transparent",
              color: active ? "var(--admin-accent)" : "var(--admin-text-muted)",
            }}>
            {t.label}
            {t.count > 0 ? (
              <span
                className="text-[11px] font-semibold px-1.5 rounded"
                style={{
                  background: active
                    ? "color-mix(in srgb, var(--admin-accent) 14%, transparent)"
                    : "var(--admin-hover-bg)",
                  color: active ? "var(--admin-accent)" : "var(--admin-text-faint)",
                }}>
                {t.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
