"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import { MediaPickerField } from "@/app/(admin)/admin/content/media/_components/media-picker-field";
import type { NewsItemWithRels } from "@/lib/modules/news/queries";
import { NEWS_CATEGORIES } from "@/lib/modules/news/categories";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  Save,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  publishNowAction,
  regenerateAction,
  rejectAction,
  saveReviewEditsAction,
  scheduleAction,
  type ActionState,
} from "../../../actions";

type ToastState = { message: string; type: "success" | "error" } | null;

export function ReviewEditor({
  item,
  reviewerName,
}: {
  item: NewsItemWithRels;
  reviewerName: string | null;
}) {
  const router = useRouter();
  const [toast, setToast] = useState<ToastState>(null);

  // Local state per il form (controlled): l'editor è side-by-side e l'utente
  // edita di continuo. Save/Publish/Schedule leggono questo stato + lo inviano
  // via FormData.
  const [title, setTitle] = useState(item.generatedTitleIt ?? "");
  const [bodyMd, setBodyMd] = useState(item.generatedBodyItMd ?? "");
  const [excerpt, setExcerpt] = useState(item.generatedExcerptIt ?? "");
  const [category, setCategory] = useState(item.category ?? "other");
  const [heroAssetId, setHeroAssetId] = useState(
    item.heroAssetId ? String(item.heroAssetId) : "",
  );

  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [rejectReason, setRejectReason] = useState("");

  // Server actions
  const [saveState, saveAction, savePending] = useActionState<ActionState, FormData>(
    saveReviewEditsAction,
    {},
  );
  const [pubState, pubAction, pubPending] = useActionState<ActionState, FormData>(
    publishNowAction,
    {},
  );
  const [schedState, schedAction, schedPending] = useActionState<ActionState, FormData>(
    scheduleAction,
    {},
  );
  const [rejState, rejAction, rejPending] = useActionState<ActionState, FormData>(
    rejectAction,
    {},
  );
  const [regenState, regenAction, regenPending] = useActionState<ActionState, FormData>(
    regenerateAction,
    {},
  );

  useEffect(() => {
    for (const s of [saveState, pubState, schedState, rejState, regenState]) {
      if (!("timestamp" in s)) continue;
      if ("success" in s) {
        setToast({ message: s.success, type: "success" });
        router.refresh();
      }
      if ("error" in s) setToast({ message: s.error, type: "error" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveState, pubState, schedState, rejState, regenState]);

  const isPublished = item.status === "published";
  const isRejected = item.status === "rejected";
  const isFailed = item.status === "failed";
  const isPending = item.status === "pending_rewrite";
  const canPublish = Boolean(heroAssetId) && !isPublished && !isPending;

  const anyPending =
    savePending || pubPending || schedPending || rejPending || regenPending;

  return (
    <>
      <div className="space-y-4">
        {/* Status banner */}
        <div
          className="rounded-lg p-4 flex items-start justify-between gap-4 flex-wrap"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusPill status={item.status} />
              <span className="text-xs" style={{ color: "var(--admin-text-muted)" }}>
                Source: <strong>{item.sourceName ?? "—"}</strong>
              </span>
              <a
                href={item.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs inline-flex items-center gap-1 underline"
                style={{ color: "var(--admin-accent)" }}
              >
                Open original <ExternalLink size={11} />
              </a>
            </div>
            <p className="text-[11px] mt-1.5" style={{ color: "var(--admin-text-faint)" }}>
              Seen {new Date(item.createdAt).toLocaleString()}
              {item.aiModel && ` · ${item.aiModel} (${item.aiPromptVersion ?? "—"})`}
              {item.aiCostCents > 0 && ` · $${(item.aiCostCents / 100).toFixed(3)} AI cost`}
              {reviewerName && ` · last edited by ${reviewerName}`}
              {item.editsCount > 0 && ` (${item.editsCount} edits)`}
            </p>
            {item.aiLastError && (
              <p className="text-xs mt-2 flex items-start gap-1.5" style={{ color: "#ef4444" }}>
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                {item.aiLastError.slice(0, 400)}
              </p>
            )}
          </div>
        </div>

        {/* Side-by-side editor */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* LEFT: source EN (read-only) */}
          <div
            className="rounded-lg p-4"
            style={{
              background: "var(--admin-card-bg)",
              border: "1px solid var(--admin-card-border)",
            }}
          >
            <h3 className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--admin-text-muted)" }}>
              Source (English — reference only)
            </h3>
            <p className="text-sm font-semibold mb-2" style={{ color: "var(--admin-text)" }}>
              {item.sourceTitle}
            </p>
            {item.sourceExcerpt && (
              <p className="text-xs whitespace-pre-wrap" style={{ color: "var(--admin-text-muted)" }}>
                {item.sourceExcerpt}
              </p>
            )}
            <p className="text-[11px] mt-3" style={{ color: "var(--admin-text-faint)" }}>
              The published article will NOT reference this source. Use the original only as
              context while you edit the Italian version on the right.
            </p>
          </div>

          {/* RIGHT: IT generated (editable) */}
          <div
            className="rounded-lg p-4 space-y-3"
            style={{
              background: "var(--admin-card-bg)",
              border: "1px solid var(--admin-card-border)",
            }}
          >
            <h3 className="text-xs uppercase tracking-wide" style={{ color: "var(--admin-text-muted)" }}>
              Italian draft (editable)
            </h3>
            {isPending ? (
              <p className="text-sm py-8 text-center" style={{ color: "var(--admin-text-muted)" }}>
                Waiting for the rewriter cron to process this item…
                <br />
                <span className="text-xs">
                  Attempts: {item.aiAttemptCount}.{" "}
                  {item.aiLastError && "Check the error banner above."}
                </span>
              </p>
            ) : (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs uppercase tracking-wide" style={{ color: "var(--admin-text-muted)" }}>
                    Title (it)
                  </label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{
                      background: "var(--admin-page-bg)",
                      border: "1px solid var(--admin-input-border)",
                      color: "var(--admin-text)",
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs uppercase tracking-wide" style={{ color: "var(--admin-text-muted)" }}>
                    Body (markdown)
                  </label>
                  <textarea
                    value={bodyMd}
                    onChange={(e) => setBodyMd(e.target.value)}
                    rows={20}
                    className="w-full px-3 py-2 rounded-lg text-sm font-mono"
                    style={{
                      background: "var(--admin-page-bg)",
                      border: "1px solid var(--admin-input-border)",
                      color: "var(--admin-text)",
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs uppercase tracking-wide" style={{ color: "var(--admin-text-muted)" }}>
                    Excerpt (≤220 char, used for SEO + listing card)
                  </label>
                  <textarea
                    value={excerpt}
                    onChange={(e) => setExcerpt(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{
                      background: "var(--admin-page-bg)",
                      border: "1px solid var(--admin-input-border)",
                      color: "var(--admin-text)",
                    }}
                  />
                  <p className="text-[11px]" style={{ color: "var(--admin-text-faint)" }}>
                    {excerpt.length} / 220 characters
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs uppercase tracking-wide" style={{ color: "var(--admin-text-muted)" }}>
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{
                      background: "var(--admin-page-bg)",
                      border: "1px solid var(--admin-input-border)",
                      color: "var(--admin-text)",
                    }}
                  >
                    {NEWS_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Hero image */}
        <div
          className="rounded-lg p-4 space-y-3"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-card-border)",
          }}
        >
          <div>
            <h3 className="text-sm font-semibold" style={{ color: "var(--admin-text)" }}>
              Hero image
            </h3>
            <p className="text-xs mt-1" style={{ color: "var(--admin-text-muted)" }}>
              Required before scheduling or publishing. Upload to the media library (R2 bucket
              <code> storage</code>) or pick an existing asset. No source-extracted images allowed.
            </p>
          </div>
          <MediaPickerField
            value={heroAssetId}
            onChange={setHeroAssetId}
            imageOnly
            placeholder="Pick or upload a hero image"
          />
        </div>

        {/* Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Save draft + Publish now */}
          <div
            className="rounded-lg p-4 space-y-3"
            style={{
              background: "var(--admin-card-bg)",
              border: "1px solid var(--admin-card-border)",
            }}
          >
            <h3 className="text-sm font-semibold" style={{ color: "var(--admin-text)" }}>
              Publish
            </h3>
            <div className="flex gap-2 flex-wrap">
              {/* Save draft */}
              <form action={saveAction}>
                <input type="hidden" name="itemId" value={item.id} />
                <input type="hidden" name="title" value={title} />
                <input type="hidden" name="bodyMd" value={bodyMd} />
                <input type="hidden" name="excerpt" value={excerpt} />
                <input type="hidden" name="category" value={category} />
                <input type="hidden" name="heroAssetId" value={heroAssetId} />
                <button
                  type="submit"
                  disabled={anyPending || isPublished}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
                  style={{
                    background: "var(--admin-hover-bg)",
                    color: "var(--admin-text)",
                    border: "1px solid var(--admin-card-border)",
                  }}
                >
                  {savePending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save draft
                </button>
              </form>
              {/* Publish now */}
              <form
                action={pubAction}
                onSubmit={(e) => {
                  if (!confirm("Publish this article right now?")) e.preventDefault();
                }}
              >
                <input type="hidden" name="itemId" value={item.id} />
                <input type="hidden" name="heroAssetId" value={heroAssetId} />
                <button
                  type="submit"
                  disabled={!canPublish || anyPending}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                  style={{ background: "var(--gc-pos, #16a34a)" }}
                  title={!heroAssetId ? "Hero image required" : "Publish immediately"}
                >
                  {pubPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Publish now
                </button>
              </form>
            </div>
            {/* Schedule */}
            <form
              action={schedAction}
              className="flex gap-2 items-end flex-wrap pt-2 border-t"
              style={{ borderColor: "var(--admin-card-border)" }}
            >
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name="heroAssetId" value={heroAssetId} />
              <div className="space-y-1.5 flex-1 min-w-[200px]">
                <label className="text-xs uppercase tracking-wide" style={{ color: "var(--admin-text-muted)" }}>
                  Schedule for
                </label>
                <input
                  type="datetime-local"
                  name="scheduledPublishAt"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    background: "var(--admin-page-bg)",
                    border: "1px solid var(--admin-input-border)",
                    color: "var(--admin-text)",
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={!canPublish || !scheduledAt || anyPending}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
                style={{
                  background: "var(--admin-accent)",
                  color: "white",
                }}
                title={!heroAssetId ? "Hero image required" : "Schedule publish"}
              >
                {schedPending ? <Loader2 size={14} className="animate-spin" /> : <CalendarClock size={14} />}
                Schedule
              </button>
            </form>
          </div>

          {/* Reject + Regenerate */}
          <div
            className="rounded-lg p-4 space-y-3"
            style={{
              background: "var(--admin-card-bg)",
              border: "1px solid var(--admin-card-border)",
            }}
          >
            <h3 className="text-sm font-semibold" style={{ color: "var(--admin-text)" }}>
              Discard / Retry
            </h3>
            <form
              action={rejAction}
              className="space-y-2"
              onSubmit={(e) => {
                if (!confirm("Reject this item? It will not be published.")) e.preventDefault();
              }}
            >
              <input type="hidden" name="itemId" value={item.id} />
              <input
                name="reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason (optional)"
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{
                  background: "var(--admin-page-bg)",
                  border: "1px solid var(--admin-input-border)",
                  color: "var(--admin-text)",
                }}
              />
              <button
                type="submit"
                disabled={isPublished || isRejected || anyPending}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
                style={{
                  background: "color-mix(in srgb, #ef4444 15%, transparent)",
                  color: "#ef4444",
                  border: "1px solid color-mix(in srgb, #ef4444 30%, transparent)",
                }}
              >
                {rejPending ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                Reject
              </button>
            </form>
            {(isFailed || item.status === "review") && (
              <form
                action={regenAction}
                onSubmit={(e) => {
                  if (
                    !confirm(
                      "Regenerate the Italian rewrite via the LLM? Current edits will be discarded.",
                    )
                  )
                    e.preventDefault();
                }}
              >
                <input type="hidden" name="itemId" value={item.id} />
                <button
                  type="submit"
                  disabled={anyPending}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
                  style={{
                    background: "var(--admin-hover-bg)",
                    color: "var(--admin-text)",
                    border: "1px solid var(--admin-card-border)",
                  }}
                >
                  {regenPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  Regenerate with LLM
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Back to queue */}
        <div>
          <Link
            href="../"
            className="text-xs underline"
            style={{ color: "var(--admin-text-muted)" }}
          >
            ← Back to queue
          </Link>
        </div>
      </div>

      {toast && (
        <AdminToast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </>
  );
}

function StatusPill({ status }: { status: NewsItemWithRels["status"] }) {
  const map: Record<
    NewsItemWithRels["status"],
    { color: string; label: string }
  > = {
    proposed:        { color: "var(--admin-accent)", label: "proposed" },
    pending_rewrite: { color: "#6b7280", label: "pending rewrite" },
    review:          { color: "var(--admin-accent)", label: "review" },
    scheduled:       { color: "#0891b2", label: "scheduled" },
    published:       { color: "var(--gc-pos, #16a34a)", label: "published" },
    rejected:        { color: "#6b7280", label: "rejected" },
    failed:          { color: "#ef4444", label: "failed" },
  };
  const m = map[status];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
      style={{
        background: `color-mix(in srgb, ${m.color} 15%, transparent)`,
        color: m.color,
      }}
    >
      {m.label}
    </span>
  );
}
