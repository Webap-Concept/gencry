import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ExternalLink, Gauge, Settings2 } from "lucide-react";

// Force dynamic: la page legge `app_settings` (con cache snapshot R2
// cross-request) + chiama probes live verso API esterne (Sentry/Upstash).
// Cacchearla a livello RSC porterebbe a `{ error: missing_token }`
// congelato anche dopo che l'admin ha aggiornato le credenziali e
// re-sync-ato lo snapshot. Le probe stesse hanno cache TTL 5min lato
// fetch → niente perdita di perf reale.
export const dynamic = "force-dynamic";

import { AdminSectionHeader } from "@/app/(admin)/admin/_components/section-header";
import {
  getCapacityOverview,
  resolveUsageProbes,
  resourceUsageKey,
  type CapacityRow,
  type ResourceUsageMap,
} from "@/lib/admin/capacity/aggregate";
import { getAdminUrlSlug } from "@/lib/admin-paths";
import { buildAdminPathFromSlug } from "@/lib/admin-paths-shared";
import { requireAdminSectionPage } from "@/lib/rbac/guards";
import type { CapacityTier } from "@/lib/modules/types";

// Tier color coding allineato al widget — la coerenza visiva tra widget
// e pagina di dettaglio aiuta l'admin a "tracciare" lo stesso profilo.
const TIER_COLORS: Record<CapacityTier, { bg: string; fg: string }> = {
  alpha: { bg: "color-mix(in srgb, #d97706 15%, var(--admin-card-bg))", fg: "#d97706" },
  beta:  { bg: "color-mix(in srgb, #6366f1 15%, var(--admin-card-bg))", fg: "#6366f1" },
  growth:{ bg: "color-mix(in srgb, #0891b2 15%, var(--admin-card-bg))", fg: "#0891b2" },
  scale: { bg: "color-mix(in srgb, #16a34a 15%, var(--admin-card-bg))", fg: "#16a34a" },
};

export default async function CapacityPage() {
  // Stessa permission che gate il widget — chi vede il widget vede la pagina.
  await requireAdminSectionPage("admin:access");

  const [overview, t, adminSlug] = await Promise.all([
    getCapacityOverview(),
    getTranslations("admin.capacity"),
    getAdminUrlSlug(),
  ]);

  // Probe live separato dopo overview: usa rows già aggregate per
  // sapere quali resources hanno `loadUsage`. Promise.allSettled
  // interno → un provider down non blocca la pagina.
  const usage = await resolveUsageProbes(overview.rows);

  const coreRows = overview.rows.filter((r) => r.group === "core");
  const moduleRows = overview.rows.filter((r) => r.group === "module");

  // Summary line: stessa logica del widget per consistency.
  const tierChunks: string[] = [];
  for (const tier of ["alpha", "beta", "growth", "scale"] as CapacityTier[]) {
    if (overview.summary.byTier[tier] > 0) {
      tierChunks.push(t(`tierBreakdown.${tier}`, { count: overview.summary.byTier[tier] }));
    }
  }

  return (
    <div className="space-y-5">
      <AdminSectionHeader
        icon={Gauge}
        breadcrumbLabel={t("breadcrumb")}
        title={t("title")}
        subtitle={t("subtitle")}
      />

      <div
        className="rounded-xl p-4"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-card-border)",
        }}>
        <p
          className="text-sm font-semibold"
          style={{
            margin: 0,
            color: TIER_COLORS[overview.summary.worstTier].fg,
          }}>
          {t("summary", {
            total: overview.summary.total,
            worst: t(`tier.${overview.summary.worstTier}`),
          })}
        </p>
        {tierChunks.length > 0 && (
          <p
            className="text-xs mt-1"
            style={{ color: "var(--admin-text-faint)" }}>
            {tierChunks.join(" · ")}
          </p>
        )}
        <p
          className="text-xs mt-2"
          style={{ color: "var(--admin-text-muted)" }}>
          {t("totalMonthlyCost", {
            cost: overview.summary.totalMonthlyCost.toFixed(2),
          })}
        </p>
      </div>

      {coreRows.length > 0 && (
        <ProfileSection
          title={t("groups.core")}
          rows={coreRows}
          t={t}
          adminSlug={adminSlug}
          usage={usage}
        />
      )}

      {moduleRows.length > 0 && (
        <ProfileSection
          title={t("groups.modules")}
          rows={moduleRows}
          t={t}
          adminSlug={adminSlug}
          usage={usage}
        />
      )}

      {overview.rows.length === 0 && (
        <p className="text-sm" style={{ color: "var(--admin-text-faint)" }}>
          {t("empty")}
        </p>
      )}
    </div>
  );
}

function ProfileSection({
  title,
  rows,
  t,
  adminSlug,
  usage,
}: {
  title: string;
  rows: ReadonlyArray<CapacityRow>;
  t: Awaited<ReturnType<typeof getTranslations<"admin.capacity">>>;
  adminSlug: string;
  usage: ResourceUsageMap;
}) {
  return (
    <section>
      <h2
        className="text-xs font-semibold uppercase tracking-widest mb-3"
        style={{ color: "var(--admin-text-faint)" }}>
        {title}
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {rows.map((row) => (
          <ProfileCard
            key={row.id}
            row={row}
            t={t}
            adminSlug={adminSlug}
            usage={usage}
          />
        ))}
      </div>
    </section>
  );
}

function ProfileCard({
  row,
  t,
  adminSlug,
  usage,
}: {
  row: CapacityRow;
  t: Awaited<ReturnType<typeof getTranslations<"admin.capacity">>>;
  adminSlug: string;
  usage: ResourceUsageMap;
}) {
  const tier = row.profile.currentTier;
  const colors = TIER_COLORS[tier];
  const tierLabel = t(`tier.${tier}`);
  const editHref = row.editPath
    ? buildAdminPathFromSlug(adminSlug, row.editPath)
    : null;

  const label = row.moduleLabel
    ? `${row.moduleLabel} · ${row.profile.label}`
    : row.profile.label;

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
      }}>
      {/* Card header: label + tier badge + edit link */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className="text-sm font-semibold"
            style={{ color: "var(--admin-text)" }}>
            {label}
          </p>
          <p
            className="text-xs mt-0.5 font-mono"
            style={{ color: "var(--admin-text-faint)" }}>
            {row.profile.scope}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            style={{
              fontSize: 11,
              padding: "2px 8px",
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
          {editHref && (
            <Link
              href={editHref}
              prefetch={false}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors"
              style={{
                color: "var(--admin-accent)",
                background:
                  "color-mix(in srgb, var(--admin-accent) 8%, transparent)",
              }}>
              <Settings2 size={12} />
              {t("configureButton")}
            </Link>
          )}
        </div>
      </div>

      {/* Risorse esterne — bullet list */}
      <div className="space-y-2.5">
        {row.profile.resources.map((res) => {
          const probe = usage[resourceUsageKey(row.id, res.name)];
          return (
            <div
              key={res.name}
              className="rounded-lg p-3"
              style={{
                background: "var(--admin-page-bg)",
                border: "1px solid var(--admin-card-border)",
              }}>
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <p
                  className="text-xs font-semibold"
                  style={{ color: "var(--admin-text)" }}>
                  {res.name}
                </p>
                <div className="flex items-center gap-1.5">
                  {typeof res.monthlyCost === "number" && (
                    <span
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                      style={{
                        color:
                          res.monthlyCost > 0
                            ? "var(--admin-accent)"
                            : "var(--admin-text-faint)",
                        background: "var(--admin-hover-bg)",
                      }}
                      title={t("monthlyCostTooltip")}>
                      ${res.monthlyCost.toFixed(2)}/mo
                    </span>
                  )}
                  <span
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                    style={{
                      color: "var(--admin-text-muted)",
                      background: "var(--admin-hover-bg)",
                    }}>
                    {res.plan}
                  </span>
                </div>
              </div>

              {/* Live usage probe row (se la resource ha loadUsage). */}
              {probe && <UsageRow probe={probe} t={t} />}

              {res.limits.length > 0 && (
                <ul
                  className="text-xs mt-1.5 mb-2 ml-3.5 list-disc"
                  style={{ color: "var(--admin-text-muted)" }}>
                  {res.limits.map((limit, i) => (
                    <li key={i}>{limit}</li>
                  ))}
                </ul>
              )}

              <div
                className="mt-2 pt-2 text-xs space-y-1"
                style={{
                  borderTop: "1px dashed var(--admin-card-border)",
                  color: "var(--admin-text-muted)",
                }}>
                <p>
                  <span
                    className="font-semibold"
                    style={{ color: "var(--admin-text)" }}>
                    {t("upgradeAtLabel")}:
                  </span>{" "}
                  {res.upgradeAt}
                </p>
                <p>
                  <span
                    className="font-semibold"
                    style={{ color: "var(--admin-text)" }}>
                    {t("upgradePathLabel")}:
                  </span>{" "}
                  {res.upgradePath}
                </p>
                {res.docsUrl && (
                  <a
                    href={res.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-1"
                    style={{ color: "var(--admin-accent)" }}>
                    {t("docsLink")} <ExternalLink size={10} />
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Riga compatta che mostra l'usage live di una risorsa: barra di
 * progress + numero current/max + periodo. Colori:
 *   - <60%  → verde
 *   - 60-85% → ambra
 *   - >85% → rosso
 *
 * Se la probe ha fallito (error), mostra messaggio neutro "n/d" con
 * tooltip del codice errore (utile per dev — es. "missing_token"
 * suggerisce di configurare le credenziali).
 */
function UsageRow({
  probe,
  t,
}: {
  probe: NonNullable<ResourceUsageMap[string]>;
  t: Awaited<ReturnType<typeof getTranslations<"admin.capacity">>>;
}) {
  if ("error" in probe) {
    return (
      <p
        className="text-[11px] mt-1.5 mb-1"
        style={{ color: "var(--admin-text-faint)" }}
        title={`${t("usageErrorPrefix")}: ${probe.error}`}>
        {t("usageNotAvailable")}
      </p>
    );
  }
  const pct = Math.round(probe.percent * 100);
  const barColor =
    probe.percent < 0.6
      ? "#16a34a"
      : probe.percent < 0.85
        ? "#d97706"
        : "#ef4444";
  return (
    <div className="mb-2">
      <div className="flex items-baseline justify-between mb-1">
        <p
          className="text-[11px]"
          style={{ color: "var(--admin-text-muted)" }}>
          <span style={{ color: "var(--admin-text)" }}>
            {probe.current.toLocaleString()}
          </span>
          {" / "}
          {probe.max.toLocaleString()} {probe.unit}{" "}
          <span style={{ color: "var(--admin-text-faint)" }}>
            · {t(`usagePeriod.${probe.period}`)}
          </span>
        </p>
        <span
          className="text-[10px] font-semibold"
          style={{ color: barColor }}>
          {pct}%
        </span>
      </div>
      <div
        style={{
          height: 4,
          borderRadius: 2,
          background: "var(--admin-hover-bg)",
          overflow: "hidden",
        }}>
        <div
          style={{
            width: `${Math.min(100, pct)}%`,
            height: "100%",
            background: barColor,
            transition: "width 200ms ease",
          }}
        />
      </div>
    </div>
  );
}
