"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ExternalLink, ListPlus } from "lucide-react";
import type { SentryIssueSummary } from "@/lib/sentry/issues";
import AllErrorsModal from "./all-errors-modal";

const TOP_LIMIT = 5;

export interface IssuesListClientProps {
  /** Full list of issues from the cached fetch (already capped at 100 server-side). */
  issues: ReadonlyArray<SentryIssueSummary>;
  /** Total count returned by the API. Same as issues.length today, kept
   *  separate so we can display "100+" if we ever paginate. */
  total: number;
}

export default function IssuesListClient({
  issues,
  total,
}: IssuesListClientProps) {
  const t = useTranslations("admin.dashboard.widgets.sentryErrors");
  const [modalOpen, setModalOpen] = useState(false);

  const top = issues.slice(0, TOP_LIMIT);
  const hiddenCount = Math.max(0, total - TOP_LIMIT);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p
        style={{
          margin: 0,
          fontSize: 13,
          fontWeight: 600,
          color: total > 10 ? "#ef4444" : "var(--admin-text)",
        }}
      >
        {t("totalIssues", { count: total })}
      </p>

      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {top.map((issue, i) => (
          <InlineIssueRow
            key={issue.id}
            issue={issue}
            isLast={i === top.length - 1}
          />
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setModalOpen(true)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          padding: "7px 12px",
          fontSize: 12,
          fontWeight: 500,
          borderRadius: 8,
          border: "1px solid var(--admin-card-border)",
          background: "var(--admin-page-bg)",
          color: "var(--admin-text-muted)",
          cursor: "pointer",
          alignSelf: "flex-start",
        }}
      >
        <ListPlus size={12} />
        {t("showAllButton", { count: hiddenCount })}
      </button>

      <AllErrorsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        issues={issues}
      />
    </div>
  );
}

function InlineIssueRow({
  issue,
  isLast,
}: {
  issue: SentryIssueSummary;
  isLast: boolean;
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
        padding: "8px 0",
        borderBottom: isLast ? "none" : "1px solid var(--admin-card-border)",
      }}
    >
      <a
        href={issue.permalink || "#"}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          color: "var(--admin-text)",
          textDecoration: "none",
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: levelColor,
            flexShrink: 0,
            marginTop: 6,
          }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              fontWeight: 500,
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
              margin: "1px 0 0 0",
              fontSize: 10,
              color: "var(--admin-text-faint)",
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            }}
          >
            {issue.shortId} · {issue.count} ev.
          </p>
        </div>
        <ExternalLink
          size={11}
          style={{ color: "var(--admin-text-faint)", flexShrink: 0, marginTop: 4 }}
        />
      </a>
    </li>
  );
}
