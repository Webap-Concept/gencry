import { getTranslations } from "next-intl/server";
import { AlertOctagon, Bug, CheckCircle2 } from "lucide-react";
import { fetchSentryIssues24h } from "@/lib/sentry/issues";
import type { WidgetSetupGuide as WidgetSetupGuideData } from "@/lib/admin/dashboard/types";
import WidgetSetupGuide from "@/app/(admin)/admin/_components/widget-setup-guide";
import WidgetCard from "@/app/(admin)/admin/_components/widget-card";
import IssuesListClient from "./issues-list-client";

const SETUP_GUIDE_KEY = "widgets.sentryErrors.setupGuide";

export default async function SentryErrorsWidget() {
  const [result, t] = await Promise.all([
    fetchSentryIssues24h(),
    getTranslations("admin.dashboard"),
  ]);

  return (
    <WidgetCard title={t("widgets.sentryErrors.title")} icon={Bug} scrollable>
      {result.ok ? (
        result.total === 0 ? (
          <AllClearState message={t("widgets.sentryErrors.allClear")} />
        ) : (
          // Hand off to a client component: it owns the "Show all" button
          // and the modal, and triggers a router.refresh() after a resolve
          // so this RSC re-runs and pulls the post-mutation data.
          <IssuesListClient total={result.total} issues={result.issues} />
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
    </WidgetCard>
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
