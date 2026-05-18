// /admin/modules/posts/reports — queue di moderazione (PR-8)
//
// Lista paginata di posts_reports filtrabile per status via pill-tabs.
// Click su una row → drawer client con preview post + form di decisione
// (Dismiss / Soft-delete).
import type { Metadata } from "next";
import { Suspense } from "react";
import {
  getReportsQueue,
  type ReportQueueStatus,
  type ReportsQueuePage,
} from "@/lib/modules/posts/queries";
import {
  findActiveReportReason,
  getActiveReportReasons,
  type ReportReason,
} from "@/lib/modules/posts/services/report-reasons";
import { ReportsQueueClient } from "./_components/reports-queue-client";

export const metadata: Metadata = { title: "Posts / Reports" };
export const dynamic = "force-dynamic";

const VALID_STATUSES: ReportQueueStatus[] = [
  "open",
  "reviewed",
  "dismissed",
  "actioned",
  "all",
];

function parseStatus(raw: string | undefined): ReportQueueStatus {
  return (VALID_STATUSES as string[]).includes(raw ?? "")
    ? (raw as ReportQueueStatus)
    : "open";
}

export default async function PostsReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cursor?: string }>;
}) {
  const params = await searchParams;
  const status = parseStatus(params.status);

  const [queue, reasons] = await Promise.all([
    getReportsQueue({ status, cursor: params.cursor, limit: 25 }),
    getActiveReportReasons(),
  ]);

  // Mappa key → label IT (UI lato admin sempre in IT per ora, niente
  // useLocale qui perché siamo in un Server Component).
  const reasonLabels = new Map<string, string>(
    reasons.map((r) => [
      r.key,
      r.labelByLocale.it ??
        r.labelByLocale.en ??
        Object.values(r.labelByLocale)[0] ??
        r.key,
    ]),
  );

  return (
    <Suspense fallback={null}>
      {/* TODO(reports-on-comments): la queue qui sotto raggruppa per
          post_id via INNER JOIN posts → esclude automaticamente i nuovi
          comment reports (M_posts_010 ha aggiunto comment_id NULL al
          schema posts_reports). Le segnalazioni di commenti si
          accumulano correttamente in DB ma non sono ancora visibili
          qui: la queue di moderazione per i commenti arriverà in un
          commit dedicato (richiede refactor del GROUP BY in
          getReportsQueue oppure una seconda query gemella raggruppata
          per comment_id). Avviso inline sotto come reminder operativo. */}
      <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
        ⚠ Da PR-mention/2026-05-18 gli utenti possono segnalare anche i
        commenti: le righe arrivano nel DB ma la queue qui sotto
        attualmente mostra SOLO i report sui post. La queue dei
        commenti arriverà in un commit dedicato. Per verifica veloce:
        <code className="ml-1">
          SELECT COUNT(*) FROM posts_reports WHERE comment_id IS NOT
          NULL AND status = &apos;open&apos;
        </code>
        .
      </div>
      {/* key={status}: forza unmount+remount al cambio status (vedi
          deleted/page.tsx per spiegazione). Senza, useState(initial.rows)
          tiene lo stato vecchio quando l'utente clicca un'altra pill. */}
      <ReportsQueueClient
        key={status}
        initial={queue}
        status={status}
        reasonLabels={Object.fromEntries(reasonLabels)}
      />
    </Suspense>
  );
}
