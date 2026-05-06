import { Map } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function SitemapPage() {
  const t = await getTranslations("admin.seo.sitemap");
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{
            background: "color-mix(in srgb, var(--admin-accent) 12%, var(--admin-card-bg))",
            border: "1px solid color-mix(in srgb, var(--admin-accent) 25%, transparent)",
          }}
        >
          <Map size={18} style={{ color: "var(--admin-accent)" }} />
        </div>
        <div>
          <h2
            className="text-xl font-bold"
            style={{ color: "var(--admin-text)" }}>
            {t("pageHeading")}
          </h2>
          <p
            className="text-sm mt-0.5"
            style={{ color: "var(--admin-text-muted)" }}>
            {t("pageSubtitleBefore")}{" "}
            <code className="font-mono text-xs px-1 py-0.5 rounded" style={{ background: "var(--admin-hover-bg)" }}>sitemap.xml</code>
            {t("pageSubtitleAfter")}
          </p>
        </div>
      </div>

      <div
        className="rounded-xl p-12 flex flex-col items-center justify-center text-center"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px dashed var(--admin-card-border)",
        }}>
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: "var(--admin-hover-bg)" }}>
          <Map size={28} style={{ color: "var(--admin-text-faint)" }} />
        </div>
        <p className="font-semibold text-sm mb-1" style={{ color: "var(--admin-text)" }}>
          {t("placeholderTitle")}
        </p>
        <p className="text-sm max-w-sm" style={{ color: "var(--admin-text-muted)" }}>
          {t("placeholderBody")}
        </p>
      </div>
    </div>
  );
}
