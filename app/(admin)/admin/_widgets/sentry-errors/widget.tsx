import { getTranslations } from "next-intl/server";
import { AlertOctagon, Bug, CheckCircle2, ExternalLink } from "lucide-react";
import { fetchSentryIssues24h, type SentryIssueSummary } from "@/lib/sentry/issues";
import type { WidgetSetupGuide as WidgetSetupGuideData } from "@/lib/admin/dashboard/types";
import WidgetSetupGuide from "@/app/(admin)/admin/_components/widget-setup-guide";

const SETUP_GUIDE_KEY = "widgets.sentryErrors.setupGuide";

export default async function SentryErrorsWidget() {
  const [result, t] = await Promise.all([
    fetchSentryIssues24h(),
    getTranslations("admin.dashboard"),
  ]);

  return (
    <Shell title={t("widgets.sentryErrors.title")}>
      {result.ok ? (
        result.total === 0 ? (
          <AllClearState message={t("widgets.sentryErrors.allClear")} />
        ) : (
          <IssuesList
            total={result.total}
            issues={result.issues}
            countLabel={t("widgets.sentryErrors.totalIssues", {
              count: result.total,
            })}
          />
        )
      ) : result.reason === "missing_env" ? (
        <MissingConfigState
          short={t("widgets.sentryErrors.missingConfigShort")}
          guide={t.raw(SETUP_GUIDE_KEY) as WidgetSetupGuideData}
        />
      ) : (
        <ErrorState
          message={
            result.reason === "unauthorized"
              ? t("widgets.sentryErrors.errors.unauthorized")
              : result.reason === "network"
                ? t("widgets.sentryErrors.errors.network")
                : t("widgets.sentryErrors.errors.unknown")
          }
        />
      )}
    </Shell>
  );
}

// ─── Card shell ───────────────────────────────────────────────────────
function Shell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}
    >
      <div className="flex items-center gap-2.5 mb-3">
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{
            background:
              "color-mix(in srgb, var(--admin-accent) 12%, transparent)",
            color: "var(--admin-accent)",
          }}
        >
          <Bug size={14} />
        </span>
        <h2
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--admin-text-faint)" }}
        >
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

// ─── States ───────────────────────────────────────────────────────────
function AllClearState({ message }: { message: string }) {
  return (
    <div
      className="flex items-center gap-2.5 py-2"
      style={{ color: "var(--admin-text-muted)" }}
    >
      <CheckCircle2 size={16} style={{ color: "#16a34a" }} />
      <span style={{ fontSize: 13 }}>{message}</span>
    </div>
  );
}

function MissingConfigState({
  short,
  guide,
}: {
  short: string;
  guide: WidgetSetupGuideData;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p
        style={{
          margin: 0,
          fontSize: 12,
          color: "var(--admin-text-muted)",
          padding: "8px 10px",
          background:
            "color-mix(in srgb, #d97706 8%, var(--admin-page-bg))",
          border: "1px solid #d9770633",
          borderRadius: 8,
        }}
      >
        {short}
      </p>
      <WidgetSetupGuide guide={guide} />
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div
      className="flex items-start gap-2.5 py-1"
      style={{ color: "var(--admin-text-muted)" }}
    >
      <AlertOctagon
        size={15}
        style={{ color: "#ef4444", flexShrink: 0, marginTop: 1 }}
      />
      <span style={{ fontSize: 12 }}>{message}</span>
    </div>
  );
}

// ─── Issues list ──────────────────────────────────────────────────────
function IssuesList({
  total,
  issues,
  countLabel,
}: {
  total: number;
  issues: SentryIssueSummary[];
  countLabel: string;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <p
        style={{
          margin: 0,
          fontSize: 13,
          fontWeight: 600,
          color: total > 10 ? "#ef4444" : "var(--admin-text)",
        }}
      >
        {countLabel}
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
        {issues.map((issue, i) => (
          <IssueRow key={issue.id} issue={issue} isLast={i === issues.length - 1} />
        ))}
      </ul>
    </div>
  );
}

function IssueRow({
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
        borderBottom: isLast
          ? "none"
          : "1px solid var(--admin-card-border)",
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
