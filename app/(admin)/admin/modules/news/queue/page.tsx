import type { Metadata } from "next";
import Link from "next/link";
import {
  getStatusCounts,
  listItemsWithRels,
  type NewsItemStatus,
  type NewsItemWithRels,
} from "@/lib/modules/news/queries";
import { getAdminUrlSlug } from "@/lib/admin-paths";
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  CalendarClock,
  FileText,
  RefreshCw,
  Inbox,
} from "lucide-react";
import { ProposedRow } from "./_components/proposed-row";

export const metadata: Metadata = { title: "News / Queue" };
export const dynamic = "force-dynamic";

const STATUS_FILTERS: Array<{ value: NewsItemStatus | "all"; label: string }> = [
  { value: "proposed", label: "Proposed" },
  { value: "review", label: "Review" },
  { value: "pending_rewrite", label: "Pending rewrite" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
  { value: "rejected", label: "Rejected" },
  { value: "failed", label: "Failed" },
  { value: "all", label: "All" },
];

export default async function NewsQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  // Default landing = proposed (la prima cosa che l'admin deve approvare).
  const filter = (STATUS_FILTERS.find((s) => s.value === status)?.value ?? "proposed") as
    | NewsItemStatus
    | "all";

  // Parallel: items per la tab attiva + counts per tutti gli status (badge tab).
  const [items, counts, adminSlug] = await Promise.all([
    listItemsWithRels({
      status: filter === "all" ? undefined : filter,
      limit: 100,
    }),
    getStatusCounts(),
    getAdminUrlSlug(),
  ]);

  const totalCount =
    counts.proposed +
    counts.pending_rewrite +
    counts.review +
    counts.scheduled +
    counts.published +
    counts.rejected +
    counts.failed;

  function countFor(value: NewsItemStatus | "all"): number {
    if (value === "all") return totalCount;
    return counts[value];
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {STATUS_FILTERS.map((s) => {
          const isActive = filter === s.value;
          const n = countFor(s.value);
          return (
            <Link
              key={s.value}
              href={`/${adminSlug}/modules/news/queue?status=${s.value}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium"
              style={{
                background: isActive ? "var(--admin-accent)" : "var(--admin-card-bg)",
                color: isActive ? "white" : "var(--admin-text-muted)",
                border: `1px solid ${
                  isActive ? "var(--admin-accent)" : "var(--admin-card-border)"
                }`,
              }}
            >
              <span>{s.label}</span>
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                style={{
                  background: isActive
                    ? "color-mix(in srgb, white 22%, transparent)"
                    : "var(--admin-page-bg)",
                  color: isActive ? "white" : "var(--admin-text-faint)",
                  minWidth: "1.25rem",
                  textAlign: "center",
                }}
              >
                {n}
              </span>
            </Link>
          );
        })}
      </div>

      {filter === "proposed" && items.length > 0 && (
        <div
          className="rounded-lg p-3 flex items-start gap-2 text-xs"
          style={{
            background: "color-mix(in srgb, var(--admin-accent) 6%, var(--admin-card-bg))",
            border: "1px solid color-mix(in srgb, var(--admin-accent) 20%, transparent)",
            color: "var(--admin-text-muted)",
          }}
        >
          <Inbox size={14} className="shrink-0 mt-0.5" style={{ color: "var(--admin-accent)" }} />
          <div>
            <strong style={{ color: "var(--admin-text)" }}>Propose-first workflow</strong> — articoli
            ingeriti dallo scraper, niente fetch body né chiamata LLM finché non clicchi <em>Approve</em>.
            Quelli non gestiti entro la retention window vengono auto-rigettati.
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-center py-12" style={{ color: "var(--admin-text-muted)" }}>
          No items in this status.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((it) =>
            filter === "proposed" ? (
              <ProposedRow key={it.id} item={it} />
            ) : (
              <QueueRow key={it.id} item={it} adminSlug={adminSlug} />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function statusBadge(status: NewsItemStatus) {
  const map: Record<NewsItemStatus, { color: string; icon: React.ReactNode; label: string }> = {
    proposed:        { color: "var(--admin-accent)", icon: <Inbox size={12} />, label: "proposed" },
    pending_rewrite: { color: "#6b7280", icon: <RefreshCw size={12} />, label: "pending rewrite" },
    review:          { color: "var(--admin-accent)", icon: <FileText size={12} />, label: "review" },
    scheduled:       { color: "#0891b2", icon: <CalendarClock size={12} />, label: "scheduled" },
    published:       { color: "var(--gc-pos, #16a34a)", icon: <CheckCircle2 size={12} />, label: "published" },
    rejected:        { color: "#6b7280", icon: <XCircle size={12} />, label: "rejected" },
    failed:          { color: "#ef4444", icon: <AlertCircle size={12} />, label: "failed" },
  };
  const m = map[status];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
      style={{
        background: `color-mix(in srgb, ${m.color} 15%, transparent)`,
        color: m.color,
      }}
    >
      {m.icon} {m.label}
    </span>
  );
}

function QueueRow({
  item,
  adminSlug,
}: {
  item: NewsItemWithRels;
  adminSlug: string;
}) {
  const title = item.generatedTitleIt ?? item.sourceTitle;
  const sourceLine = [item.sourceName ?? "—", item.category ?? ""].filter(Boolean).join(" · ");
  return (
    <Link
      href={`/${adminSlug}/modules/news/queue/${item.id}`}
      className="rounded-lg p-4 flex items-start gap-4 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
        display: "flex",
      }}
    >
      {item.heroPublicUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.heroPublicUrl}
          alt=""
          className="w-20 h-20 rounded-md object-cover shrink-0"
          style={{ border: "1px solid var(--admin-card-border)" }}
        />
      ) : (
        <div
          className="w-20 h-20 rounded-md shrink-0 flex items-center justify-center"
          style={{
            background: "var(--admin-page-bg)",
            border: "1px dashed var(--admin-card-border)",
            color: "var(--admin-text-faint)",
          }}
        >
          <FileText size={20} />
        </div>
      )}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          {statusBadge(item.status)}
          <span className="text-[11px]" style={{ color: "var(--admin-text-faint)" }}>
            {sourceLine}
          </span>
        </div>
        <p className="text-sm font-semibold truncate" style={{ color: "var(--admin-text)" }}>
          {title}
        </p>
        {item.generatedExcerptIt && (
          <p className="text-xs line-clamp-2" style={{ color: "var(--admin-text-muted)" }}>
            {item.generatedExcerptIt}
          </p>
        )}
        <p className="text-[11px] flex items-center gap-2" style={{ color: "var(--admin-text-faint)" }}>
          <Clock size={11} />
          {item.scheduledPublishAt
            ? `scheduled ${new Date(item.scheduledPublishAt).toLocaleString()}`
            : item.publishedAt
            ? `published ${new Date(item.publishedAt).toLocaleString()}`
            : `seen ${new Date(item.createdAt).toLocaleString()}`}
          {item.aiLastError && (
            <span style={{ color: "#ef4444" }}>· {item.aiLastError.slice(0, 80)}</span>
          )}
        </p>
      </div>
    </Link>
  );
}
