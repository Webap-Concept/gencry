"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { AdminToast } from "@/app/(admin)/admin/_components/toast";
import { useState } from "react";
import { resyncSnapshotAction, type ResyncState } from "./actions";

type ToastState = { message: string; type: "success" | "error" } | null;

export function ResyncButton({ label, busyLabel }: { label: string; busyLabel: string }) {
  const [state, action, isPending] = useActionState<ResyncState>(
    async () => resyncSnapshotAction(),
    {},
  );
  const [toast, setToast] = useState<ToastState>(null);
  const lastTs = useRef<number>(0);

  useEffect(() => {
    if (!("timestamp" in state)) return;
    if (state.timestamp === lastTs.current) return;
    lastTs.current = state.timestamp;
    if ("success" in state) setToast({ message: state.success, type: "success" });
    if ("error" in state) setToast({ message: state.error, type: "error" });
  }, [state]);

  return (
    <>
      <form action={action}>
        <button
          type="submit"
          disabled={isPending}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            background: "var(--admin-hover-bg)",
            color: "var(--admin-text)",
            border: "1px solid var(--admin-card-border)",
          }}
        >
          {isPending ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <RefreshCw size={12} />
          )}
          {isPending ? busyLabel : label}
        </button>
      </form>
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
