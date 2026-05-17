"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Bug, Check, ExternalLink } from "lucide-react";
import type { SentryIssueSummary } from "@/lib/sentry/issues";
import {
  AdminDialog,
  AdminDialogContent,
} from "@/app/(admin)/admin/_components/admin-dialog";
import ConfirmModal from "../../_components/confirm-modal";
import { resolveSentryIssue } from "./actions";

export interface AllErrorsModalProps {
  open: boolean;
  onClose: () => void;
  issues: ReadonlyArray<SentryIssueSummary>;
}

export default function AllErrorsModal({
  open,
  onClose,
  issues,
}: AllErrorsModalProps) {
  const t = useTranslations("admin.dashboard.widgets.sentryErrors");
  const router = useRouter();

  // Optimistic UX: when an issue is resolved successfully we remove it
  // from the visible list right away. The server action also revalidates
  // the cache tag, and we call router.refresh() so the widget re-renders
  // with fresh data on the next paint.
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; code: string } | null>(null);
  const [confirm, setConfirm] = useState<SentryIssueSummary | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setDismissed(new Set());
      setError(null);
      setConfirm(null);
      setPendingId(null);
    }
  }, [open]);

  // Focus + ESC delegati a Radix tramite AdminDialog.

  if (!open) return null;

  const visible = issues.filter((i) => !dismissed.has(i.id));

  function performResolve(issue: SentryIssueSummary) {
    setError(null);
    setPendingId(issue.id);
    startTransition(async () => {
      const res = await resolveSentryIssue(issue.id);
      setPendingId(null);
      if ("error" in res) {
        setError({ id: issue.id, code: res.error });
        return;
      }
      // Success: hide locally + ask the page to re-fetch RSC data so the
      // widget re-renders with the updated count next time the modal closes.
      setDismissed((prev) => {
        const next = new Set(prev);
        next.add(issue.id);
        return next;
      });
      router.refresh();
    });
  }

  function resolveErrorMessage(code: string): string {
    switch (code) {
      case "scope_insufficient":
        return t("resolveErrors.scopeInsufficient");
      case "missing_env":
        return t("resolveErrors.missingEnv");
      case "network":
        return t("resolveErrors.network");
      case "forbidden":
        return t("resolveErrors.forbidden");
      default:
        return t("resolveErrors.unknown");
    }
  }

  return (
    <>
      <AdminDialog open onOpenChange={(o) => !o && !confirm && onClose()}>
        <AdminDialogContent
          icon={Bug}
          size="xl"
          title={t("modalTitle")}
          description={t("modalSubtitle", { count: visible.length })}
          closeAriaLabel={t("modalCloseAria")}>
          <div
            style={{
              maxHeight: "min(60vh, 600px)",
              overflowY: "auto",
              // Clip orizzontale: i title (SQL queries) hanno whiteSpace=nowrap,
              // senza clip i flex item sforano i bordi del Dialog anche con
              // max-w-2xl impostato sul DialogContent.
              overflowX: "hidden",
              margin: "-16px -20px",
            }}>
            {visible.length === 0 ? (
              <p
                style={{
                  margin: 0,
                  padding: "40px 20px",
                  textAlign: "center",
                  fontSize: 13,
                  color: "var(--admin-text-faint)",
                }}>
                {t("modalAllResolved")}
              </p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {visible.map((issue, i) => (
                  <ModalIssueRow
                    key={issue.id}
                    issue={issue}
                    isLast={i === visible.length - 1}
                    pending={pendingId === issue.id}
                    error={error?.id === issue.id ? resolveErrorMessage(error.code) : null}
                    onResolveClick={() => setConfirm(issue)}
                    resolveLabel={t("resolveButton")}
                    pendingLabel={t("resolvingLabel")}
                  />
                ))}
              </ul>
            )}
          </div>
        </AdminDialogContent>
      </AdminDialog>

      {/* Confirm modal (nested) for the actual resolve action */}
      {confirm && (
        <ConfirmModal
          open={true}
          variant="warning"
          title={t("confirmResolveTitle")}
          message={t("confirmResolveMessage", { title: confirm.title })}
          confirmLabel={t("confirmResolveButton")}
          loading={pendingId === confirm.id}
          onConfirm={() => {
            const target = confirm;
            setConfirm(null);
            performResolve(target);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}

      <style>{`
        @keyframes aem-spin { to { transform: rotate(360deg) } }
      `}</style>
    </>
  );
}

function ModalIssueRow({
  issue,
  isLast,
  pending,
  error,
  onResolveClick,
  resolveLabel,
  pendingLabel,
}: {
  issue: SentryIssueSummary;
  isLast: boolean;
  pending: boolean;
  error: string | null;
  onResolveClick: () => void;
  resolveLabel: string;
  pendingLabel: string;
}) {
  const levelColor =
    issue.level === "fatal" || issue.level === "error"
      ? "#ef4444"
      : issue.level === "warning"
        ? "#d97706"
        : "var(--admin-text-faint)";

  return (
    <li
      style={{
        padding: "12px 20px",
        borderBottom: isLast ? "none" : "1px solid var(--admin-card-border)",
        opacity: pending ? 0.6 : 1,
        // Defensive: garantisce che la <li> non possa espandersi oltre
        // il wrapper di scroll (importante quando contenuto child ha
        // whiteSpace: nowrap).
        minWidth: 0,
        maxWidth: "100%",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0 }}>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: levelColor,
            flexShrink: 0,
            marginTop: 7,
          }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 500,
              color: "var(--admin-text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={issue.title}
          >
            {issue.title}
          </p>
          <p
            style={{
              margin: "2px 0 0 0",
              fontSize: 11,
              color: "var(--admin-text-faint)",
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            }}
          >
            {issue.shortId} · {issue.count} ev.
          </p>
          {error && (
            <p
              style={{
                margin: "6px 0 0 0",
                fontSize: 11,
                color: "#ef4444",
                background: "rgba(239,68,68,0.08)",
                padding: "4px 6px",
                borderRadius: 4,
              }}
            >
              {error}
            </p>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {issue.permalink && (
            <a
              href={issue.permalink}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "var(--admin-text-faint)",
                padding: 4,
                display: "inline-flex",
              }}
              aria-label="Open in Sentry"
            >
              <ExternalLink size={12} />
            </a>
          )}
          <button
            type="button"
            onClick={onResolveClick}
            disabled={pending}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 10px",
              fontSize: 11,
              fontWeight: 500,
              borderRadius: 6,
              border: "1px solid var(--admin-card-border)",
              background: "var(--admin-page-bg)",
              color: "var(--admin-text-muted)",
              cursor: pending ? "not-allowed" : "pointer",
            }}
          >
            {pending ? (
              <span
                style={{
                  width: 10,
                  height: 10,
                  border: "2px solid currentColor",
                  borderTopColor: "transparent",
                  borderRadius: "50%",
                  animation: "aem-spin 0.6s linear infinite",
                }}
              />
            ) : (
              <Check size={11} />
            )}
            {pending ? pendingLabel : resolveLabel}
          </button>
        </div>
      </div>
    </li>
  );
}
