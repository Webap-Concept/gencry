"use client";

// app/(admin)/admin/modules/news/queue/_components/proposed-row.tsx
//
// Riga compatta per la tab "Proposed": titolo + source + excerpt RSS + 2
// bottoni inline. NIENTE link al review editor: per gli items in 'proposed'
// non c'è ancora il rewrite IT da visualizzare, l'admin decide solo se
// approvare o scartare. Dopo Approve il rewriter cron processa l'item e
// successivamente apparirà sotto "Review" (con link al detail).

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import type { NewsItemWithRels } from "@/lib/modules/news/queries";
import { CheckCircle2, ExternalLink, Loader2, Rss, XCircle } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { approveItemAction, rejectAction, type ActionState } from "../../actions";

type ToastState = { message: string; type: "success" | "error" } | null;

export function ProposedRow({ item }: { item: NewsItemWithRels }) {
  const router = useRouter();
  const [toast, setToast] = useState<ToastState>(null);

  const [apvState, apvAction, apvPending] = useActionState<ActionState, FormData>(
    approveItemAction,
    {},
  );
  const [rejState, rejAction, rejPending] = useActionState<ActionState, FormData>(
    rejectAction,
    {},
  );

  const lastApvTs = useRef(0);
  const lastRejTs = useRef(0);
  useEffect(() => {
    if ("timestamp" in apvState && apvState.timestamp !== lastApvTs.current) {
      lastApvTs.current = apvState.timestamp;
      if ("success" in apvState) {
        setToast({ message: apvState.success, type: "success" });
        router.refresh();
      }
      if ("error" in apvState) setToast({ message: apvState.error, type: "error" });
    }
  }, [apvState, router]);
  useEffect(() => {
    if ("timestamp" in rejState && rejState.timestamp !== lastRejTs.current) {
      lastRejTs.current = rejState.timestamp;
      if ("success" in rejState) {
        setToast({ message: rejState.success, type: "success" });
        router.refresh();
      }
      if ("error" in rejState) setToast({ message: rejState.error, type: "error" });
    }
  }, [rejState, router]);

  const pending = apvPending || rejPending;

  return (
    <>
      <div
        className="rounded-lg p-4 flex items-start gap-4 flex-wrap"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}
      >
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap text-[11px]" style={{ color: "var(--admin-text-faint)" }}>
            <Rss size={11} style={{ color: "var(--admin-accent)" }} />
            <span>{item.sourceName ?? "—"}</span>
            <span>·</span>
            <span>{new Date(item.createdAt).toLocaleString()}</span>
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline ml-1"
              style={{ color: "var(--admin-accent)" }}
              onClick={(e) => e.stopPropagation()}
            >
              Open original <ExternalLink size={10} />
            </a>
          </div>
          <p className="text-sm font-semibold" style={{ color: "var(--admin-text)" }}>
            {item.sourceTitle}
          </p>
          {item.sourceExcerpt && (
            <p className="text-xs line-clamp-3" style={{ color: "var(--admin-text-muted)" }}>
              {item.sourceExcerpt}
            </p>
          )}
        </div>
        <div className="flex gap-2 shrink-0 self-center">
          <form action={apvAction}>
            <input type="hidden" name="itemId" value={item.id} />
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-white disabled:opacity-60"
              style={{ background: "var(--gc-pos, #16a34a)" }}
              title="Approve and send to LLM rewrite"
            >
              {apvPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
              Approve
            </button>
          </form>
          <form action={rejAction}>
            <input type="hidden" name="itemId" value={item.id} />
            <input type="hidden" name="reason" value="Rejected from proposed queue" />
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-60"
              style={{
                background: "color-mix(in srgb, #ef4444 12%, transparent)",
                color: "#ef4444",
                border: "1px solid color-mix(in srgb, #ef4444 30%, transparent)",
              }}
              title="Reject (skip this item)"
            >
              {rejPending ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
              Reject
            </button>
          </form>
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
