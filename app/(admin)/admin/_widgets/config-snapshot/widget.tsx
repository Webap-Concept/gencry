import { getLocale, getTranslations } from "next-intl/server";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Database,
  FileWarning,
  HelpCircle,
} from "lucide-react";
import Link from "next/link";

import WidgetCard from "@/app/(admin)/admin/_components/widget-card";
import { buildAdminPath } from "@/lib/admin-paths";
import { getAppSettingsSnapshotHealth } from "@/lib/config/snapshots";
import { ResyncButton } from "./resync-button";

export default async function ConfigSnapshotWidget() {
  const [health, t, locale, configurePath] = await Promise.all([
    getAppSettingsSnapshotHealth(),
    getTranslations("admin.dashboard.widgets.configSnapshot"),
    getLocale(),
    buildAdminPath("/services/cloudflare"),
  ]);

  return (
    <WidgetCard
      title={t("title")}
      icon={Database}
      headerActions={
        health.status === "ok" || health.status === "missing" ? (
          <ResyncButton label={t("resyncButton")} busyLabel={t("resyncBusy")} />
        ) : null
      }
    >
      <div className="space-y-3 flex flex-col h-full">
        <StatusBanner health={health} t={t} />
        {health.status === "ok" && (
          <MetaGrid health={health} t={t} locale={locale} />
        )}
        {/* Footer "Powered by R2" — chiarisce che il backing store del
            snapshot è Cloudflare R2 e linka alla pagina admin dove si
            configura. Stays mt-auto così resta agganciato in fondo anche
            quando il widget è espanso verticalmente nel grid. */}
        <div
          className="flex items-center justify-between gap-2 text-[11px] pt-2 mt-auto"
          style={{
            borderTop: "1px solid var(--admin-divider)",
            color: "var(--admin-text-muted)",
          }}
        >
          <span className="inline-flex items-center gap-1.5">
            <Database size={11} style={{ color: "var(--admin-text-faint)" }} />
            {t("serviceLabel")}
          </span>
          <Link
            href={configurePath}
            className="inline-flex items-center gap-1 hover:underline"
            style={{ color: "var(--admin-accent)" }}
          >
            {t("configureLink")}
            <ArrowUpRight size={11} />
          </Link>
        </div>
      </div>
    </WidgetCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Status banner — banda colorata in alto che riassume lo stato in 1 riga
// ─────────────────────────────────────────────────────────────────────────

function StatusBanner({
  health,
  t,
}: {
  health: Awaited<ReturnType<typeof getAppSettingsSnapshotHealth>>;
  t: Awaited<ReturnType<typeof getTranslations<"admin.dashboard.widgets.configSnapshot">>>;
}) {
  const { icon, color, title, hint } = (() => {
    switch (health.status) {
      case "ok":
        return {
          icon: <CheckCircle2 size={14} />,
          color: "#16a34a",
          title: t("statusOkTitle"),
          hint: t("statusOkHint"),
        };
      case "disabled":
        return {
          icon: <HelpCircle size={14} />,
          color: "var(--admin-text-faint)",
          title: t("statusDisabledTitle"),
          hint: t("statusDisabledHint"),
        };
      case "missing":
        return {
          icon: <FileWarning size={14} />,
          color: "#d97706",
          title: t("statusMissingTitle"),
          hint: health.message,
        };
      case "error":
        return {
          icon: <AlertTriangle size={14} />,
          color: "#ef4444",
          title: t("statusErrorTitle"),
          hint: health.message,
        };
    }
  })();

  return (
    <div
      className="flex items-start gap-2.5 rounded-lg px-3 py-2.5"
      style={{
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      }}
    >
      <span style={{ color, marginTop: 2 }}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div
          className="text-[12px] font-semibold leading-tight"
          style={{ color: "var(--admin-text)" }}
        >
          {title}
        </div>
        <div
          className="text-[11px] mt-0.5"
          style={{ color: "var(--admin-text-muted)" }}
        >
          {hint}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Meta grid — version, last sync, file size, etag
// ─────────────────────────────────────────────────────────────────────────

function MetaGrid({
  health,
  t,
  locale,
}: {
  health: Extract<
    Awaited<ReturnType<typeof getAppSettingsSnapshotHealth>>,
    { status: "ok" }
  >;
  t: Awaited<ReturnType<typeof getTranslations<"admin.dashboard.widgets.configSnapshot">>>;
  locale: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
      <MetaCell label={t("labelVersion")} value={`v${health.meta.version}`} mono />
      <MetaCell label={t("labelSize")} value={formatBytes(health.sizeBytes)} mono />
      <MetaCell
        label={t("labelLastSync")}
        value={formatWhen(health.meta.writtenAt, locale)}
      />
      <MetaCell
        label={t("labelEtag")}
        value={health.etag ? health.etag.slice(0, 12) + "…" : "—"}
        mono
      />
    </div>
  );
}

function MetaCell({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div
        className="text-[10px] uppercase tracking-[0.06em]"
        style={{ color: "var(--admin-text-faint)" }}
      >
        {label}
      </div>
      <div
        className={`text-[12px] mt-0.5 ${mono ? "font-mono" : ""}`}
        style={{ color: "var(--admin-text)" }}
      >
        {value}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Format helpers
// ─────────────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatWhen(iso: string, locale: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return "—";
  }
}
