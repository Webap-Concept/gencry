"use client";

import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import type { NewsSource } from "@/lib/db/schema";
import { Plus, Rss, Play, Trash2, AlertCircle, CheckCircle2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createSourceAction,
  deleteSourceAction,
  runSourceIngestNowAction,
  updateSourceAction,
  type ActionState,
} from "../../actions";

type ToastState = { message: string; type: "success" | "error" } | null;

export function SourcesPanel({ initialSources }: { initialSources: NewsSource[] }) {
  const [toast, setToast] = useState<ToastState>(null);
  const [showNewForm, setShowNewForm] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: "var(--admin-text)" }}>
            RSS/Atom Sources
          </h2>
          <p className="text-xs mt-1" style={{ color: "var(--admin-text-muted)" }}>
            The ingestion cron polls every active source every 15 minutes (ETag / If-Modified-Since
            cached). New items land as <code>pending_rewrite</code>.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNewForm((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: "var(--admin-accent)" }}
        >
          <Plus size={15} />
          {showNewForm ? "Cancel" : "Add source"}
        </button>
      </div>

      {showNewForm && (
        <CreateSourceForm
          onToast={setToast}
          onCreated={() => setShowNewForm(false)}
        />
      )}

      <div className="space-y-2">
        {initialSources.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: "var(--admin-text-muted)" }}>
            No sources yet. Add the first RSS feed above.
          </p>
        ) : (
          initialSources.map((s) => (
            <SourceRow key={s.id} source={s} onToast={setToast} />
          ))
        )}
      </div>

      {toast && (
        <AdminToast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}

function CreateSourceForm({
  onToast,
  onCreated,
}: {
  onToast: (t: ToastState) => void;
  onCreated: () => void;
}) {
  const router = useRouter();
  const [state, action, isPending] = useActionState<ActionState, FormData>(
    createSourceAction,
    {},
  );
  const lastTs = useRef(0);
  useEffect(() => {
    if (!("timestamp" in state)) return;
    if (state.timestamp === lastTs.current) return;
    lastTs.current = state.timestamp;
    if ("success" in state) {
      onToast({ message: state.success, type: "success" });
      router.refresh();
      onCreated();
    }
    if ("error" in state) onToast({ message: state.error, type: "error" });
  }, [state, onToast, router, onCreated]);

  return (
    <form
      action={action}
      className="rounded-lg p-4 space-y-3"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field name="name" label="Name" placeholder="Coindesk" />
        <Field name="feedUrl" label="Feed URL" placeholder="https://www.coindesk.com/arc/outboundfeeds/rss/" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs uppercase tracking-wide" style={{ color: "var(--admin-text-muted)" }}>
            Type
          </label>
          <select
            name="feedType"
            defaultValue="rss"
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{
              background: "var(--admin-page-bg)",
              border: "1px solid var(--admin-input-border)",
              color: "var(--admin-text)",
            }}
          >
            <option value="rss">RSS</option>
            <option value="atom">Atom</option>
          </select>
        </div>
        <Field name="weight" label="Weight" placeholder="1" type="number" defaultValue="1" />
        <label className="flex items-end gap-2 text-sm" style={{ color: "var(--admin-text)" }}>
          <input type="checkbox" name="active" defaultChecked /> Active
        </label>
      </div>
      <div>
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
          style={{ background: "var(--admin-accent)" }}
        >
          {isPending ? "Creating…" : "Create source"}
        </button>
      </div>
    </form>
  );
}

function SourceRow({
  source,
  onToast,
}: {
  source: NewsSource;
  onToast: (t: ToastState) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  const [updateState, updateAction, updatePending] = useActionState<ActionState, FormData>(
    updateSourceAction,
    {},
  );
  const [deleteState, deleteAction, deletePending] = useActionState<ActionState, FormData>(
    deleteSourceAction,
    {},
  );
  const [ingestState, ingestAction, ingestPending] = useActionState<ActionState, FormData>(
    runSourceIngestNowAction,
    {},
  );

  useEffect(() => {
    for (const s of [updateState, deleteState, ingestState]) {
      if (!("timestamp" in s)) continue;
      if ("success" in s) {
        onToast({ message: s.success, type: "success" });
        router.refresh();
      }
      if ("error" in s) onToast({ message: s.error, type: "error" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateState, deleteState, ingestState]);

  if (editing) {
    return (
      <form
        action={updateAction}
        className="rounded-lg p-4 space-y-3"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-accent)",
        }}
      >
        <input type="hidden" name="id" value={source.id} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field name="name" label="Name" defaultValue={source.name} placeholder="" />
          <Field name="feedUrl" label="Feed URL" defaultValue={source.feedUrl} placeholder="" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wide" style={{ color: "var(--admin-text-muted)" }}>
              Type
            </label>
            <select
              name="feedType"
              defaultValue={source.feedType}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{
                background: "var(--admin-page-bg)",
                border: "1px solid var(--admin-input-border)",
                color: "var(--admin-text)",
              }}
            >
              <option value="rss">RSS</option>
              <option value="atom">Atom</option>
            </select>
          </div>
          <Field name="weight" label="Weight" defaultValue={String(source.weight)} placeholder="" type="number" />
          <label className="flex items-end gap-2 text-sm" style={{ color: "var(--admin-text)" }}>
            <input type="checkbox" name="active" defaultChecked={source.active} /> Active
          </label>
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={updatePending}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
            style={{ background: "var(--admin-accent)" }}
          >
            {updatePending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="px-4 py-2 rounded-lg text-sm"
            style={{ color: "var(--admin-text-muted)" }}
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div
      className="rounded-lg p-4 flex items-center justify-between gap-4 flex-wrap"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Rss size={16} style={{ color: source.active ? "var(--admin-accent)" : "var(--admin-text-faint)" }} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate" style={{ color: "var(--admin-text)" }}>
            {source.name}
            {!source.active && (
              <span className="ml-2 text-xs font-normal" style={{ color: "var(--admin-text-muted)" }}>
                (inactive)
              </span>
            )}
          </p>
          <p className="text-xs truncate" style={{ color: "var(--admin-text-muted)" }}>
            {source.feedUrl}
          </p>
          <p className="text-[11px] mt-0.5 flex items-center gap-2" style={{ color: "var(--admin-text-faint)" }}>
            <span>weight {source.weight}</span>
            <span>·</span>
            <span>
              {source.lastFetchedAt
                ? `last fetch ${new Date(source.lastFetchedAt).toLocaleString()}`
                : "never fetched"}
            </span>
            {source.errorCount > 0 && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1" style={{ color: "#ef4444" }}>
                  <AlertCircle size={12} /> {source.errorCount} errors
                </span>
              </>
            )}
            {source.errorCount === 0 && source.lastFetchedAt && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1" style={{ color: "var(--gc-pos, #16a34a)" }}>
                  <CheckCircle2 size={12} /> healthy
                </span>
              </>
            )}
          </p>
          {source.lastError && (
            <p className="text-[11px] mt-1" style={{ color: "#ef4444" }}>
              {source.lastError.slice(0, 200)}
            </p>
          )}
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        <form action={ingestAction}>
          <input type="hidden" name="id" value={source.id} />
          <button
            type="submit"
            disabled={ingestPending}
            className="px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1 disabled:opacity-60"
            style={{
              background: "var(--admin-hover-bg)",
              color: "var(--admin-text)",
              border: "1px solid var(--admin-card-border)",
            }}
            title="Run ingestion now"
          >
            <Play size={12} /> {ingestPending ? "Running…" : "Fetch"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="px-3 py-1.5 rounded-md text-xs font-medium"
          style={{
            background: "var(--admin-hover-bg)",
            color: "var(--admin-text)",
            border: "1px solid var(--admin-card-border)",
          }}
        >
          Edit
        </button>
        <form
          action={deleteAction}
          onSubmit={(e) => {
            if (!confirm(`Delete source "${source.name}"? Existing items will be preserved.`)) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="id" value={source.id} />
          <button
            type="submit"
            disabled={deletePending}
            className="px-3 py-1.5 rounded-md text-xs disabled:opacity-60"
            style={{ color: "#ef4444", border: "1px solid color-mix(in srgb, #ef4444 30%, transparent)" }}
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({
  name,
  label,
  placeholder,
  defaultValue,
  type = "text",
}: {
  name: string;
  label: string;
  placeholder: string;
  defaultValue?: string;
  type?: "text" | "number";
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs uppercase tracking-wide" style={{ color: "var(--admin-text-muted)" }}>
        {label}
      </label>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full px-3 py-2 rounded-lg text-sm"
        style={{
          background: "var(--admin-page-bg)",
          border: "1px solid var(--admin-input-border)",
          color: "var(--admin-text)",
        }}
      />
    </div>
  );
}
