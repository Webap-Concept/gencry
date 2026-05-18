"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  CheckCircle2,
  Clock,
  Download,
  FileDown,
  Loader2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ActionState } from "@/lib/auth/middleware";
import {
  type DownloadActionState,
  regenerateGdprExportUrlAction,
  requestGdprExportAction,
} from "../actions";

export type ExportJobVM = {
  id: string;
  status: "pending" | "processing" | "ready" | "failed" | "expired";
  /** ISO. */
  requestedAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  canDownload: boolean;
};

export function ExportPanel({ jobs }: { jobs: ExportJobVM[] }) {
  const t = useTranslations("core.settings.privacy.export");
  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-gc-fg-3">{t("description")}</p>
      <RequestExportCard hasActiveJob={hasActiveJob(jobs)} />
      {jobs.length > 0 && <JobsList jobs={jobs} />}
    </div>
  );
}

function hasActiveJob(jobs: ExportJobVM[]): boolean {
  return jobs.some(
    (j) => j.status === "pending" || j.status === "processing" || j.status === "ready",
  );
}

function RequestExportCard({ hasActiveJob }: { hasActiveJob: boolean }) {
  const router = useRouter();
  const t = useTranslations("core.settings.privacy.export");
  const [state, action, pending] = useActionState<ActionState, FormData>(
    requestGdprExportAction,
    {},
  );

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  return (
    <article className="rounded-2xl border border-gc-line bg-gc-bg-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gc-bg text-gc-fg-3">
            <FileDown size={18} strokeWidth={1.7} />
          </div>
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold text-gc-fg">
              {t("requestLabel")}
            </p>
            <p className="mt-0.5 text-[12px] text-gc-fg-3">
              {t("requestDescription")}
            </p>
            {state.error && (
              <p className="mt-2 text-[12.5px] text-gc-neg">{state.error}</p>
            )}
            {state.success && (
              <p className="mt-2 text-[12.5px] text-gc-success-fg">
                {state.success}
              </p>
            )}
          </div>
        </div>

        <form action={action}>
          <Button type="submit" size="sm" disabled={pending || hasActiveJob}>
            {pending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("submitPending")}
              </>
            ) : (
              t("submitIdle")
            )}
          </Button>
        </form>
      </div>
    </article>
  );
}

function JobsList({ jobs }: { jobs: ExportJobVM[] }) {
  const t = useTranslations("core.settings.privacy.export");
  return (
    <div className="space-y-3">
      <h3 className="text-[12.5px] font-semibold uppercase tracking-wide text-gc-fg-3">
        {t("recentHeading")}
      </h3>
      <ul className="space-y-2">
        {jobs.map((job) => (
          <JobRow key={job.id} job={job} />
        ))}
      </ul>
    </div>
  );
}

function JobRow({ job }: { job: ExportJobVM }) {
  const t = useTranslations("core.settings.privacy.export");
  const tStatus = useTranslations("core.settings.privacy.export.status");
  const locale = useLocale();
  const dateFmt = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const dayFmt = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <li className="rounded-2xl border border-gc-line bg-gc-bg-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <StatusIcon status={job.status} />
          <div className="min-w-0">
            <p className="text-[13.5px] font-medium text-gc-fg">
              {tStatus(job.status)}
            </p>
            <p className="mt-0.5 text-[12px] text-gc-fg-3">
              {dateFmt.format(new Date(job.requestedAt))}
              {job.status === "ready" && job.expiresAt && (
                <> · {dayFmt.format(new Date(job.expiresAt))}</>
              )}
            </p>
          </div>
        </div>

        {job.canDownload && <DownloadButton jobId={job.id} />}
      </div>
    </li>
  );
}

function StatusIcon({ status }: { status: ExportJobVM["status"] }) {
  const className =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl";

  switch (status) {
    case "pending":
    case "processing":
      return (
        <div className={cn(className, "bg-gc-warning-bg text-gc-warning-fg")}>
          <Clock size={18} strokeWidth={1.7} />
        </div>
      );
    case "ready":
      return (
        <div className={cn(className, "bg-gc-success-bg text-gc-success-fg")}>
          <CheckCircle2 size={18} strokeWidth={1.7} />
        </div>
      );
    case "failed":
      return (
        <div className={cn(className, "bg-gc-neg/10 text-gc-neg")}>
          <XCircle size={18} strokeWidth={1.7} />
        </div>
      );
    case "expired":
      return (
        <div className={cn(className, "bg-gc-bg text-gc-fg-3")}>
          <Clock size={18} strokeWidth={1.7} />
        </div>
      );
  }
}

function DownloadButton({ jobId }: { jobId: string }) {
  const t = useTranslations("core.settings.privacy.export");
  const [state, action, pending] = useActionState<DownloadActionState, FormData>(
    regenerateGdprExportUrlAction,
    {},
  );
  // Memo: usiamo un counter monotono per riconoscere "ho un nuovo URL"
  // anche se è identico a un precedente (rarissimo ma teorico).
  const [openedTick, setOpenedTick] = useState(0);

  useEffect(() => {
    if (state.downloadUrl) {
      window.open(state.downloadUrl, "_blank", "noopener,noreferrer");
      setOpenedTick((tick) => tick + 1);
    }
  }, [state.downloadUrl]);

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="jobId" value={jobId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("downloadPending")}
          </>
        ) : (
          <>
            <Download className="h-3.5 w-3.5" />
            {t("downloadIdle")}
          </>
        )}
      </Button>
      {state.error && (
        <p className="text-[11.5px] text-gc-neg">{state.error}</p>
      )}
      {openedTick > 0 && !state.error && (
        <p className="text-[11.5px] text-gc-fg-3">{t("openingTab")}</p>
      )}
    </form>
  );
}
