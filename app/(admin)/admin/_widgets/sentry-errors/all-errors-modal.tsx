"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Bug, Check, ExternalLink, X } from "lucide-react";
import type { SentryIssueSummary } from "@/lib/sentry/issues";
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

  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      setDismissed(new Set());
      setError(null);
      setConfirm(null);
      setPendingId(null);
      setTimeout(() => closeRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      // ESC chiude sempre la modale principale, A MENO che la confirm
      // nested sia aperta — in quel caso ESC è gestito dalla nested.
      // Il resolve in corso non blocca: la server action continua
      // comunque, e router.refresh aggiorna il widget alla prossima
      // apertura.
      if (e.key === "Escape" && !confirm) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, confirm]);

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

  return createPortal(
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10000,
          background: "rgba(0,0,0,0.45)",
          backdropFilter: "blur(2px)",
          animation: "aem-fade-in 140ms ease",
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="aem-title"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10001,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            background: "var(--admin-card-bg, #1c1b19)",
            border: "1px solid var(--admin-card-border, #2a2927)",
            borderRadius: 14,
            boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
            width: "100%",
            maxWidth: 640,
            maxHeight: "min(85vh, 800px)",
            display: "flex",
            flexDirection: "column",
            pointerEvents: "auto",
            animation: "aem-slide-up 160ms cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "16px 20px",
              borderBottom: "1px solid var(--admin-card-border, #2a2927)",
            }}
          >
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "color-mix(in srgb, var(--admin-accent) 12%, transparent)",
                color: "var(--admin-accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Bug size={15} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2
                id="aem-title"
                style={{
                  margin: 0,
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--admin-text, #cdccca)",
                }}
              >
                {t("modalTitle")}
              </h2>
              <p
                style={{
                  margin: "2px 0 0 0",
                  fontSize: 12,
                  color: "var(--admin-text-faint, #5a5957)",
                }}
              >
                {t("modalSubtitle", { count: visible.length })}
              </p>
            </div>
            <button
              ref={closeRef}
              onClick={onClose}
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: "transparent",
                border: "none",
                color: "var(--admin-text-faint, #5a5957)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-label={t("modalCloseAria")}
            >
              <X size={15} />
            </button>
          </div>

          {/* Body */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {visible.length === 0 ? (
              <p
                style={{
                  margin: 0,
                  padding: "40px 20px",
                  textAlign: "center",
                  fontSize: 13,
                  color: "var(--admin-text-faint, #5a5957)",
                }}
              >
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
        </div>
      </div>

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
        @keyframes aem-fade-in  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes aem-slide-up { from { opacity: 0; transform: translateY(10px) scale(0.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
        @keyframes aem-spin     { to { transform: rotate(360deg) } }
      `}</style>
    </>,
    document.body,
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
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
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
