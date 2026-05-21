import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Gauge } from "lucide-react";

import WidgetCard from "@/app/(admin)/admin/_components/widget-card";
import {
  getCapacityOverview,
  type CapacityRow,
} from "@/lib/admin/capacity/aggregate";
import { getAdminUrlSlug } from "@/lib/admin-paths";
import { buildAdminPathFromSlug } from "@/lib/admin-paths-shared";
import type { CapacityTier } from "@/lib/modules/types";

// Tier color coding: alpha = "siamo molto in basso, fragile sotto carico"
// (faint/orange); scale = "siamo dimensionati per scalare" (green).
// Stessa scala usata dalle copy del backlog feed (alpha → fragile).
const TIER_COLORS: Record<CapacityTier, { bg: string; fg: string }> = {
  alpha: { bg: "color-mix(in srgb, #d97706 15%, var(--admin-card-bg))", fg: "#d97706" },
  beta:  { bg: "color-mix(in srgb, #6366f1 15%, var(--admin-card-bg))", fg: "#6366f1" },
  growth:{ bg: "color-mix(in srgb, #0891b2 15%, var(--admin-card-bg))", fg: "#0891b2" },
  scale: { bg: "color-mix(in srgb, #16a34a 15%, var(--admin-card-bg))", fg: "#16a34a" },
};

export default async function CapacityOverviewWidget() {
  const [overview, t, adminSlug] = await Promise.all([
    getCapacityOverview(),
    getTranslations("admin.dashboard.widgets.capacityOverview"),
    getAdminUrlSlug(),
  ]);

  const coreRows = overview.rows.filter((r) => r.group === "core");
  const moduleRows = overview.rows.filter((r) => r.group === "module");

  // Summary line: "5 in alpha, 2 in beta — tier dominante alpha".
  // Mostriamo solo i tier con count > 0 per non rumoreggiare.
  const tierChunks: string[] = [];
  for (const tier of ["alpha", "beta", "growth", "scale"] as CapacityTier[]) {
    if (overview.summary.byTier[tier] > 0) {
      tierChunks.push(t(`tierBreakdown.${tier}`, { count: overview.summary.byTier[tier] }));
    }
  }
  const summaryLine = tierChunks.join(" · ");
  const worstColor = TIER_COLORS[overview.summary.worstTier].fg;

  return (
    <WidgetCard title={t("title")} icon={Gauge} scrollable>
      <div className="flex flex-col gap-3">
        {/* Summary header */}
        <div className="flex items-baseline gap-2 flex-wrap">
          <p
            className="text-xs font-semibold"
            style={{ margin: 0, color: worstColor }}>
            {t("summary", {
              total: overview.summary.total,
              worst: t(`tier.${overview.summary.worstTier}`),
            })}
          </p>
          {summaryLine ? (
            <p
              className="text-xs"
              style={{ margin: 0, color: "var(--admin-text-faint)" }}>
              {summaryLine}
            </p>
          ) : null}
        </div>

        {/* Core profiles */}
        {coreRows.length > 0 && (
          <Section
            title={t("groups.core")}
            rows={coreRows}
            tierLabels={t}
            adminSlug={adminSlug}
          />
        )}

        {/* Module profiles */}
        {moduleRows.length > 0 && (
          <Section
            title={t("groups.modules")}
            rows={moduleRows}
            tierLabels={t}
            adminSlug={adminSlug}
          />
        )}

        {overview.rows.length === 0 && (
          <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
            {t("empty")}
          </p>
        )}
      </div>
    </WidgetCard>
  );
}

function Section({
  title,
  rows,
  tierLabels,
  adminSlug,
}: {
  title: string;
  rows: ReadonlyArray<CapacityRow>;
  tierLabels: Awaited<ReturnType<typeof getTranslations<"admin.dashboard.widgets.capacityOverview">>>;
  adminSlug: string;
}) {
  return (
    <div>
      <p
        className="text-[10px] font-semibold uppercase tracking-widest mb-1"
        style={{ color: "var(--admin-text-faint)" }}>
        {title}
      </p>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
        }}>
        {rows.map((row, i) => (
          <ProfileRow
            key={row.id}
            row={row}
            tierLabel={tierLabels(`tier.${row.profile.currentTier}`)}
            adminSlug={adminSlug}
            isLast={i === rows.length - 1}
          />
        ))}
      </ul>
    </div>
  );
}

function ProfileRow({
  row,
  tierLabel,
  adminSlug,
  isLast,
}: {
  row: CapacityRow;
  tierLabel: string;
  adminSlug: string;
  isLast: boolean;
}) {
  const tier = row.profile.currentTier;
  const colors = TIER_COLORS[tier];

  // Risorse rese come chip compatti (name del provider). Tooltip
  // espone il plan corrente per quick context senza espandere la riga.
  const resourceChips = row.profile.resources.slice(0, 3); // max 3 per non sforare

  const label = row.moduleLabel
    ? `${row.moduleLabel} · ${row.profile.label}`
    : row.profile.label;

  const content = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 0",
        borderBottom: isLast ? "none" : "1px solid var(--admin-divider)",
      }}>
      <span
        style={{
          fontSize: 13,
          color: "var(--admin-text)",
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
        {label}
      </span>
      <div className="flex items-center gap-1.5 shrink-0">
        {resourceChips.map((r) => (
          <span
            key={r.name}
            title={`${r.name} · ${r.plan}`}
            style={{
              fontSize: 10,
              padding: "1px 6px",
              borderRadius: 4,
              background: "var(--admin-hover-bg)",
              color: "var(--admin-text-muted)",
              border: "1px solid var(--admin-card-border)",
              whiteSpace: "nowrap",
            }}>
            {r.name}
          </span>
        ))}
        <span
          title={`Tier: ${tierLabel}`}
          style={{
            fontSize: 10,
            padding: "1px 7px",
            borderRadius: 999,
            background: colors.bg,
            color: colors.fg,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
          }}>
          {tierLabel}
        </span>
      </div>
    </div>
  );

  if (row.editPath) {
    const href = buildAdminPathFromSlug(adminSlug, row.editPath);
    return (
      <li>
        <Link
          href={href}
          prefetch={false}
          className="block rounded transition-colors hover:bg-[var(--admin-hover-bg)] -mx-1 px-1">
          {content}
        </Link>
      </li>
    );
  }
  // Core rows: niente link (read-only — il tier si aggiorna a mano nel file).
  return <li>{content}</li>;
}
