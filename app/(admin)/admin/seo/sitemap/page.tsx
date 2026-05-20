import { getCmsSitemapStats } from "@/app/sitemap";
import { getSiteUrl } from "@/lib/seo";
import { MODULE_SITEMAPS } from "@/lib/modules/sitemap-registry";
import type { ModuleSitemap } from "@/lib/modules/types";
import { ExternalLink, Layers, Map } from "lucide-react";
import { getTranslations } from "next-intl/server";

interface SitemapCardData {
  /** Slug stabile per la key React + i18n future. */
  id: string;
  label: string;
  /** Path root-relative pubblico, es. "/sitemap.xml" o "/coins/sitemap.xml". */
  url: string;
  /** Stats resolved via Promise.allSettled — null se il provider non
   *  espone loadStats o ha fallito. */
  stats: { count: number; lastModified: Date | null } | { error: true } | null;
}

/**
 * Risolve in parallelo le stats di:
 *   - sitemap core CMS pages (sempre)
 *   - ogni modulo installato che dichiara `sitemap` nel manifest
 *
 * Promise.allSettled: un modulo che fa crash sulla query stats non
 * deve abbattere l'intera pagina admin. Le card senza stats restano
 * comunque cliccabili.
 */
async function resolveSitemapCards(): Promise<SitemapCardData[]> {
  // id stabile per la key React: slugifico la URL togliendo slash e
  // estensione (es. /coins/sitemap.xml → coins-sitemap-xml).
  const moduleSitemaps: Array<{ id: string; sitemap: ModuleSitemap }> =
    MODULE_SITEMAPS.map((sitemap) => ({
      id: sitemap.url.replace(/^\/+/, "").replace(/[/.]/g, "-"),
      sitemap,
    }));

  const statsResults = await Promise.allSettled([
    getCmsSitemapStats(),
    ...moduleSitemaps.map(async ({ sitemap }) => {
      if (!sitemap.loadStats) return null;
      const mod = await sitemap.loadStats();
      return mod.default();
    }),
  ]);

  function toStats(
    r: PromiseSettledResult<{ count: number; lastModified: Date | null } | null>,
  ): SitemapCardData["stats"] {
    if (r.status === "rejected") return { error: true };
    return r.value;
  }

  const cards: SitemapCardData[] = [
    {
      id: "cms-pages",
      label: "cardCmsPagesLabel",
      url: "/sitemap.xml",
      stats: toStats(statsResults[0]),
    },
  ];
  moduleSitemaps.forEach(({ id, sitemap }, i) => {
    cards.push({
      id,
      label: sitemap.label,
      url: sitemap.url,
      stats: toStats(statsResults[i + 1]),
    });
  });
  return cards;
}

function formatRelative(d: Date | null, dateLocale: string): string {
  if (!d) return "";
  const date = new Date(d);
  return date.toLocaleString(dateLocale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function SitemapPage() {
  const [t, siteUrl, cards] = await Promise.all([
    getTranslations("admin.seo.sitemap"),
    getSiteUrl(),
    resolveSitemapCards(),
  ]);

  // i18n dei label core: cardCmsPagesLabel è una i18n key, il label dei
  // moduli arriva direttamente dal manifest (free-form). Non passa per
  // l'i18n perché un modulo terzo potrebbe non aver pre-tradotto.
  function resolveLabel(raw: string): string {
    if (raw === "cardCmsPagesLabel") return t("cardCmsPagesLabel");
    return raw;
  }

  return (
    <div className="space-y-5">
      <div
        className="rounded-xl p-5"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-border)",
        }}>
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "var(--admin-hover-bg)" }}>
            <Layers size={18} style={{ color: "var(--admin-accent)" }} />
          </div>
          <div className="min-w-0">
            <p
              className="font-semibold text-sm mb-1"
              style={{ color: "var(--admin-text)" }}>
              {t("introTitle")}
            </p>
            <p
              className="text-sm leading-relaxed"
              style={{ color: "var(--admin-text-muted)" }}>
              {t("introBody")}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map((card) => (
          <SitemapCard
            key={card.id}
            label={resolveLabel(card.label)}
            url={card.url}
            siteUrl={siteUrl}
            stats={card.stats}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}

function SitemapCard({
  label,
  url,
  siteUrl,
  stats,
  t,
}: {
  label: string;
  url: string;
  siteUrl: string;
  stats: SitemapCardData["stats"];
  t: Awaited<ReturnType<typeof getTranslations<"admin.seo.sitemap">>>;
}) {
  const fullUrl = siteUrl ? `${siteUrl}${url}` : url;
  const hasError = stats !== null && "error" in stats;
  const data = stats && "count" in stats ? stats : null;

  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-border)",
      }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "var(--admin-hover-bg)" }}>
            <Map size={16} style={{ color: "var(--admin-text-muted)" }} />
          </div>
          <p
            className="font-semibold text-sm truncate"
            style={{ color: "var(--admin-text)" }}>
            {label}
          </p>
        </div>
        <a
          href={fullUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md transition-colors shrink-0"
          style={{
            color: "var(--admin-accent)",
            background:
              "color-mix(in srgb, var(--admin-accent) 8%, transparent)",
          }}>
          {t("cardOpenButton")} <ExternalLink size={12} />
        </a>
      </div>

      <code
        className="block text-xs px-2.5 py-1.5 rounded mb-3 truncate"
        style={{
          background: "var(--admin-input-bg)",
          border: "1px solid var(--admin-input-border)",
          color: "var(--admin-text-muted)",
          fontFamily: "monospace",
        }}>
        {url}
      </code>

      {hasError ? (
        <p className="text-xs" style={{ color: "var(--admin-text-faint)" }}>
          {t("cardStatsError")}
        </p>
      ) : data ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p
              className="text-xs uppercase tracking-wide mb-0.5"
              style={{
                color: "var(--admin-text-faint)",
                fontSize: "0.65rem",
                fontWeight: 600,
              }}>
              {t("cardCountLabel")}
            </p>
            <p
              className="text-sm font-semibold"
              style={{ color: "var(--admin-text)" }}>
              {data.count.toLocaleString()}
            </p>
          </div>
          <div>
            <p
              className="text-xs uppercase tracking-wide mb-0.5"
              style={{
                color: "var(--admin-text-faint)",
                fontSize: "0.65rem",
                fontWeight: 600,
              }}>
              {t("cardLastModifiedLabel")}
            </p>
            <p
              className="text-xs"
              style={{ color: "var(--admin-text-muted)" }}>
              {data.lastModified
                ? formatRelative(data.lastModified, "it-IT")
                : t("cardLastModifiedUnknown")}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
